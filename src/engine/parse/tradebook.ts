import Papa from 'papaparse';
import { z } from 'zod';
import {
  FoWrappedError,
  RowValidationError,
  UnrecognizedFileError,
  UnsupportedSegmentError,
} from '../errors';
import { decimalToPaise, decimalToWholeNumber } from '../money';
import { parseIstDate, parseIstDateTime } from '../time';
import type { Exchange, Fill, Paise, Side } from '../types';
import { parseSymbol } from './symbol';

/** Confirmed Console F&O tradebook headers (API_CONTRACT §2). */
export const TRADEBOOK_HEADERS = [
  'symbol',
  'isin',
  'trade_date',
  'exchange',
  'segment',
  'series',
  'trade_type',
  'auction',
  'quantity',
  'price',
  'trade_id',
  'order_id',
  'order_execution_time',
  'expiry_date',
] as const;

const F_AND_O_SEGMENT = 'FO';

function refine<T>(parse: (s: string) => T | null, message: string) {
  return z.string().transform((s, ctx) => {
    const v = parse(s);
    if (v === null) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return v;
  });
}

const digits = z.string().regex(/^\d+$/, 'expected digits only');

/** One CSV row, as strings, to typed values. `symbol` is resolved after. */
const rowSchema = z.object({
  symbol: z.string().trim().min(1, 'required'),
  trade_date: refine(parseIstDate, 'expected a YYYY-MM-DD date'),
  exchange: z.enum(['NSE', 'BSE']),
  trade_type: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['buy', 'sell'])),
  auction: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['true', 'false'])),
  quantity: refine(
    (s) => {
      const n = decimalToWholeNumber(s);
      return n !== null && n > 0 ? n : null;
    },
    'expected a positive whole number',
  ),
  price: refine(
    (s) => {
      const p = decimalToPaise(s);
      return p !== null && p > 0 ? p : null;
    },
    'expected a positive price in whole paise',
  ),
  // IDs stay strings: order_id can exceed Number.MAX_SAFE_INTEGER.
  trade_id: digits,
  order_id: digits,
  order_execution_time: refine(parseIstDateTime, 'expected YYYY-MM-DDTHH:mm:ss'),
  expiry_date: refine(parseIstDate, 'expected a YYYY-MM-DD date'),
});

/**
 * Parses a Zerodha Console F&O tradebook (CSV). Validation is all-or-nothing:
 * the first invalid row rejects the whole file (API_CONTRACT §5).
 */
export function parseTradebook(fileName: string, bytes: ArrayBuffer): Fill[] {
  if (isZip(bytes)) {
    // XLSX is a zip container. Its layout is not verified yet (API_CONTRACT §2).
    throw new FoWrappedError(
      `${fileName} is an Excel file. Excel tradebooks aren’t supported yet. ` +
        'Please download the CSV version from Console.',
    );
  }

  // TextDecoder strips a leading byte-order mark by default.
  const text = new TextDecoder('utf-8').decode(bytes);
  const { data } = Papa.parse<string[]>(text, { header: false, dynamicTyping: false, skipEmptyLines: false });

  // A single trailing empty line is normal; blank lines elsewhere are not.
  const rows = data.slice();
  while (rows.length > 0 && isBlank(rows[rows.length - 1]!)) rows.pop();

  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const index = new Map(header.map((h, i) => [h, i]));
  if (!TRADEBOOK_HEADERS.every((h) => index.has(h))) {
    throw UnrecognizedFileError.forFile(fileName);
  }

  const fills: Fill[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r]!;
    const get = (h: (typeof TRADEBOOK_HEADERS)[number]) => (cells[index.get(h)!] ?? '').trim();

    if (isBlank(cells)) throw new RowValidationError(fileName, line, 'row', '', 'blank line');

    const segment = get('segment');
    if (segment.toUpperCase() !== F_AND_O_SEGMENT) throw new UnsupportedSegmentError(fileName, segment);

    const raw = Object.fromEntries(TRADEBOOK_HEADERS.map((h) => [h, get(h)]));
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0] ?? 'row');
      throw new RowValidationError(fileName, line, field, raw[field] ?? '', issue.message);
    }

    const row = parsed.data;
    const exchange: Exchange = row.exchange;
    fills.push({
      tradeId: row.trade_id,
      orderId: row.order_id,
      instrument: parseSymbol(row.symbol, exchange, row.expiry_date),
      exchange,
      side: (row.trade_type === 'buy' ? 'BUY' : 'SELL') satisfies Side,
      auction: row.auction === 'true',
      qty: row.quantity,
      pricePaise: row.price as Paise,
      tradeDate: row.trade_date,
      executedAt: row.order_execution_time,
      sourceFile: fileName,
      sourceRow: line,
    });
  }

  if (fills.length === 0) throw UnrecognizedFileError.forFile(fileName);
  return fills;
}

function isBlank(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

function isZip(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

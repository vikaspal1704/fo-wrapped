import { z } from 'zod';
import { RowValidationError, UnrecognizedFileError, UnsupportedSegmentError } from '../errors';
import type { EquityFill } from '../equity/types';
import { decimalToPaise, decimalToWholeNumber, safeMul } from '../money';
import { parseIstDate, parseIstDateTime } from '../time';
import type { Paise } from '../types';
import { COMMON_HEADERS, digits, findTradebookHeader, isBlank, refine, tradebookSegment } from './tradebook';

const EQUITY_SEGMENT = 'EQ';

/** An Indian ISIN: IN, nine letters or digits, a check digit. */
const ISIN = /^IN[A-Z0-9]{9}\d$/;

const rowSchema = z.object({
  symbol: z.string().trim().min(1, 'required'),
  isin: z.string().regex(ISIN, 'expected an ISIN such as INE009A01021'),
  trade_date: refine(parseIstDate, 'expected a YYYY-MM-DD date'),
  exchange: z.enum(['NSE', 'BSE']),
  series: z.string().trim().min(1, 'required'),
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
  trade_id: digits,
  order_id: digits,
  order_execution_time: refine(parseIstDateTime, 'expected YYYY-MM-DDTHH:mm:ss'),
});

/** A Console tradebook (no `expiry_date` column) whose rows are the equity segment. */
export function isEquityTradebook(rows: readonly (readonly string[])[]): boolean {
  const header = findTradebookHeader(rows);
  return header !== null && !header.index.has('expiry_date') && tradebookSegment(rows) === EQUITY_SEGMENT;
}

/**
 * Validates a Zerodha Console equity tradebook (docs/SPEC.md AC-3.1.1).
 * All-or-nothing, like the F&O tradebook: the first bad row rejects the file.
 */
export function parseEquityTradebookRows(fileName: string, data: readonly (readonly string[])[]): EquityFill[] {
  const rows = data.slice();
  while (rows.length > 0 && isBlank(rows[rows.length - 1]!)) rows.pop();
  const header = findTradebookHeader(rows);
  if (!header) throw UnrecognizedFileError.forFile(fileName);
  const { headerAt, index } = header;

  const fills: EquityFill[] = [];
  for (let r = headerAt + 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r]!;
    const get = (h: string) => (cells[index.get(h)!] ?? '').trim();
    if (isBlank(cells)) throw new RowValidationError(fileName, line, 'row', '', 'blank line');

    const segment = get('segment');
    if (segment.toUpperCase() !== EQUITY_SEGMENT) throw new UnsupportedSegmentError(fileName, segment);

    const raw = Object.fromEntries(COMMON_HEADERS.map((h) => [h, get(h)]));
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0] ?? 'row');
      throw new RowValidationError(fileName, line, field, raw[field] ?? '', issue.message);
    }
    const row = parsed.data;
    fills.push({
      broker: 'zerodha',
      tradeId: row.trade_id,
      orderId: row.order_id,
      symbol: row.symbol,
      isin: row.isin,
      exchange: row.exchange,
      series: row.series.toUpperCase(),
      side: row.trade_type === 'buy' ? 'BUY' : 'SELL',
      auction: row.auction === 'true',
      qty: row.quantity,
      pricePaise: row.price as Paise,
      valuePaise: safeMul(row.quantity, row.price) as Paise,
      tradeDate: row.trade_date,
      executedAt: row.order_execution_time,
      sourceFile: fileName,
      sourceRow: line,
    });
  }
  if (fills.length === 0) throw UnrecognizedFileError.forFile(fileName);
  return fills;
}

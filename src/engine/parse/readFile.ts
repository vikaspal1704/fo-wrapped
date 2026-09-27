import Papa from 'papaparse';
import { FoWrappedError, UnrecognizedFileError } from '../errors';
import { m } from '../i18n';
import { isAngelOneTradesHistory, parseAngelOneRows } from './angelone';
import { isDhanGlobalTransactionReport, parseDhanRows } from './dhan';
import { looksLikePnlStatement, parsePnlStatement, type PnlStatement } from './pnlStatement';
import type { BrokerFills } from './table';
import { isZip, isLegacyXls, looksLikeTradebook, parseTradebookRows } from './tradebook';
import { isUpstoxTradeReport, parseUpstoxRows } from './upstox';

/** One uploaded file, read: trades from a broker, or a Zerodha P&L statement. */
export type BrokerFile = ({ kind: 'fills' } & BrokerFills) | { kind: 'pnlStatement'; statement: PnlStatement };

type Rows = readonly (readonly string[])[];

/**
 * Reads any supported file (docs/BROKERS.md). The layout is recognised by its
 * header row, never guessed; anything else is rejected with a message that
 * says which files are supported.
 */
export async function readBrokerFile(fileName: string, bytes: ArrayBuffer): Promise<BrokerFile> {
  if (isLegacyXls(bytes)) throw new FoWrappedError(m().legacyXls(fileName));

  if (!isZip(bytes)) {
    // TextDecoder strips a leading byte-order mark by default.
    const text = new TextDecoder('utf-8').decode(bytes);
    const { data } = Papa.parse<string[]>(text, { header: false, dynamicTyping: false, skipEmptyLines: false });
    return { kind: 'fills', ...readRows(fileName, data) };
  }

  const { readXlsxSheets } = await import('./xlsx');
  const sheets = await readXlsxSheets(fileName, bytes);
  if (sheets.some((s) => looksLikePnlStatement(s.rows))) {
    return { kind: 'pnlStatement', statement: await parsePnlStatement(fileName, bytes) };
  }
  // Prefer a sheet in a known layout; fall back to the first non-empty one
  // so its rejection message is about the data the person sees.
  const known = sheets.find((s) => detect(s.rows) !== null);
  const sheet = known ?? sheets.find((s) => s.rows.some((r) => r.some((c) => c !== '')));
  if (!sheet) throw UnrecognizedFileError.forFile(fileName);
  return { kind: 'fills', ...readRows(fileName, sheet.rows) };
}

function detect(rows: Rows): ((fileName: string, rows: Rows) => BrokerFills) | null {
  if (looksLikeTradebook(rows)) return (f, r) => ({ broker: 'zerodha', fills: parseTradebookRows(f, r), charges: null });
  if (isAngelOneTradesHistory(rows)) return parseAngelOneRows;
  if (isUpstoxTradeReport(rows)) return parseUpstoxRows;
  if (isDhanGlobalTransactionReport(rows)) return parseDhanRows;
  return null;
}

function readRows(fileName: string, rows: Rows): BrokerFills {
  const parse = detect(rows);
  if (parse) return parse(fileName, rows);
  if (looksLikeGroww(rows)) throw new FoWrappedError(m().growwNotSupported(fileName));
  throw UnrecognizedFileError.forFile(fileName);
}

/**
 * Groww reports open with a `Unique Client Code` line, and its order history
 * has an `Exchange Order Id` column (docs/BROKERS.md §2.5).
 */
function looksLikeGroww(rows: Rows): boolean {
  const top = rows.slice(0, 10).map((r) => r.map((c) => c.trim().toLowerCase()));
  return top.some((r) => r[0] === 'unique client code' || (r.includes('exchange order id') && r.includes('execution date and time')));
}

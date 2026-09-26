import { FoWrappedError, UnknownInstrumentError } from '../errors';
import { m } from '../i18n';
import { safeMul } from '../money';
import { parseIstDate, parseIstDateTime } from '../time';
import type { Exchange, Fill, InstrumentKind, IstDate, Paise } from '../types';
import { dayFirstDate, makeInstrument } from './instrument';
import { findHeader, isBlankRow, rowReader, type BrokerFills } from './table';

/** Upstox trade report headers (docs/BROKERS.md §2.2). */
export const UPSTOX_HEADERS = [
  'Date',
  'Company',
  'Amount',
  'Exchange',
  'Segment',
  'Scrip Code',
  'Instrument Type',
  'Strike Price',
  'Expiry',
  'Trade Num',
  'Trade Time',
  'Side',
  'Quantity',
  'Price',
] as const;

const MAX_HEADER_ROW = 30;
const FNO_SEGMENT = 'FO';
/** Upstox's F&O exchange labels, as seen in a real report. */
const EXCHANGES: Record<string, Exchange> = { FON: 'NSE', FOB: 'BSE' };
const OPTION_TYPES: Record<string, InstrumentKind> = { 'european call': 'CE', 'european put': 'PE' };
/** Contract codes Upstox prints in place of an index name (seen on a real report). */
const UNDERLYING_CODES: Record<string, string> = { BSX: 'SENSEX' };

export function isUpstoxTradeReport(rows: readonly (readonly string[])[]): boolean {
  return findHeader(rows, UPSTOX_HEADERS, MAX_HEADER_ROW) !== null;
}

/**
 * Parses the F&O option rows of an Upstox trade report. Equity rows are
 * skipped; futures are rejected until seen in a real export. Rows carry trade
 * times but no order IDs, and no charges (they are estimated).
 */
export function parseUpstoxRows(fileName: string, rows: readonly (readonly string[])[]): BrokerFills {
  const header = findHeader(rows, UPSTOX_HEADERS, MAX_HEADER_ROW);
  if (!header) throw new FoWrappedError(m().unrecognizedFile(fileName));

  const fills: Fill[] = [];
  for (let r = header.at + 1; r < rows.length; r++) {
    const cells = rows[r]!;
    // The table ends at the first blank row; notes follow it.
    if (isBlankRow(cells)) break;
    const line = r + 1;
    const row = rowReader(fileName, line, cells, header.col);
    if (row.get('Segment').toUpperCase() !== FNO_SEGMENT) continue;

    const exchange = EXCHANGES[row.get('Exchange').toUpperCase()];
    if (!exchange) return row.fail('Exchange', 'expected FON or FOB');
    const type = row.get('Instrument Type');
    const code = row.get('Scrip Code').toUpperCase();
    const raw = `${code} ${type} ${row.get('Strike Price')} ${row.get('Expiry')}`;
    if (/fut/i.test(type)) throw new UnknownInstrumentError(raw, m().futuresNotSeen('Upstox'));
    const kind = OPTION_TYPES[type.toLowerCase()];
    if (!kind) throw new UnknownInstrumentError(raw, m().contractNotRecognised);

    const tradeDate = anyDate(row.get('Date'));
    if (!tradeDate) return row.fail('Date', 'expected a date');
    const expiry = anyDate(row.get('Expiry'));
    if (!expiry || expiry < tradeDate) return row.fail('Expiry', 'expected dd-mm-yyyy on or after the trade date');
    const time = /(?:^|T)(\d{2}:\d{2}:\d{2})$/.exec(row.get('Trade Time'))?.[1];
    const executedAt = time ? parseIstDateTime(`${tradeDate}T${time}`) : null;
    if (executedAt === null) return row.fail('Trade Time', 'expected HH:MM:SS');
    const sideText = row.get('Side').toLowerCase();
    if (sideText !== 'buy' && sideText !== 'sell') return row.fail('Side', 'expected Buy or Sell');
    const tradeId = row.get('Trade Num');
    if (!/^\d+$/.test(tradeId)) return row.fail('Trade Num', 'expected digits only');

    const qty = row.qty('Quantity');
    const price = row.price('Price');
    const value = safeMul(qty, price);
    if (Math.abs(row.money('Amount') - value) > 1) throw new FoWrappedError(m().rowDoesntAddUp(fileName, line));

    const instrument = makeInstrument(raw, {
      exchange,
      underlying: UNDERLYING_CODES[code] ?? code,
      kind,
      strikePaise: row.price('Strike Price'),
      expiry,
    });
    fills.push({
      broker: 'upstox',
      tradeId,
      orderId: null,
      instrument,
      exchange,
      side: sideText === 'buy' ? 'BUY' : 'SELL',
      auction: false,
      qty,
      pricePaise: price,
      valuePaise: value as Paise,
      tradeDate,
      executedAt,
      timePrecision: 'second',
      sourceFile: fileName,
      sourceRow: line,
    });
  }

  if (fills.length === 0) throw new FoWrappedError(m().noFnoRows(fileName));
  return { broker: 'upstox', fills, charges: null };
}

/** A date cell ('YYYY-MM-DD') or Upstox's 'dd-mm-yyyy' text. */
function anyDate(s: string): IstDate | null {
  return parseIstDate(s) ?? dayFirstDate(s);
}

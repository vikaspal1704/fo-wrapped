import type { ChargeRecord } from '../charges/types';
import { FoWrappedError, UnknownInstrumentError } from '../errors';
import { m } from '../i18n';
import { decimalToPaise, safeMul } from '../money';
import { parseIstDate, parseIstDateTime } from '../time';
import type { Exchange, Fill, InstrumentKind, Paise } from '../types';
import { makeInstrument, monthNumber, ymd } from './instrument';
import { chargesOf, findHeader, isBlankRow, mergeRecords, rowReader, type BrokerFills } from './table';

/** Angel One Trades History headers (docs/BROKERS.md §2.1). */
export const ANGELONE_HEADERS = [
  'Scrip/Contract',
  'Buy/Sell',
  'Buy Price',
  'Sell Price',
  'Quantity',
  'Brokerage',
  'GST',
  'STT',
  'Sebi Tax',
  'Exchange Turnover Charges',
  'Stamp Duty',
  'Other Charges',
  'IPFT Charges',
  'Segment',
  'Exchange',
  'Order ID',
  'Trade ID',
  'Date',
] as const;

/** The preamble (client code, dates, a charges summary) is ~35 rows. */
const MAX_HEADER_ROW = 80;
const FNO_SEGMENT = 'FUTURES';
const CONTRACT = /^(OPTIDX|OPTSTK|BSXOPT)\s+(\S+)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d+(?:\.\d+)?)\s+(CE|PE)(?:\s+\(BT\))?$/;
const FUTURE = /^(FUTIDX|FUTSTK|BSXFUT)\b/;

export function isAngelOneTradesHistory(rows: readonly (readonly string[])[]): boolean {
  return findHeader(rows, ANGELONE_HEADERS, MAX_HEADER_ROW) !== null;
}

/**
 * Parses the F&O rows of an Angel One Trades History sheet. Equity rows are
 * skipped. Each trade row becomes a fill with its date only; brokerage rows
 * (quantity 0, no trade ID) only add charges. Charges are Angel One's own.
 */
export function parseAngelOneRows(fileName: string, rows: readonly (readonly string[])[]): BrokerFills {
  const header = findHeader(rows, ANGELONE_HEADERS, MAX_HEADER_ROW);
  if (!header) throw new FoWrappedError(m().unrecognizedFile(fileName));

  const fills: Fill[] = [];
  const records: ChargeRecord[] = [];
  for (let r = header.at + 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (isBlankRow(cells)) continue;
    if (/^note\b/i.test(cells[0]?.trim() ?? '')) break;
    const line = r + 1;
    const row = rowReader(fileName, line, cells, header.col);
    if (row.get('Segment').toUpperCase() !== FNO_SEGMENT) continue;

    const contract = row.get('Scrip/Contract');
    const exchange = row.get('Exchange').toUpperCase();
    if (exchange !== 'NSE' && exchange !== 'BSE') row.fail('Exchange', 'expected NSE or BSE');
    const sideText = row.get('Buy/Sell').toLowerCase();
    if (sideText !== 'buy' && sideText !== 'sell') row.fail('Buy/Sell', 'expected Buy or Sell');
    const side = sideText === 'buy' ? 'BUY' : 'SELL';
    const tradeDate = parseIstDate(row.get('Date'));
    if (!tradeDate) return row.fail('Date', 'expected a date');
    const qty = row.qty('Quantity', true);
    const tradeId = row.get('Trade ID');
    const orderId = row.get('Order ID');

    const charges = chargesOf({
      brokerage: row.money('Brokerage'),
      gst: row.money('GST'),
      stt: row.money('STT'),
      sebi: row.money('Sebi Tax'),
      exchangeTxn: row.money('Exchange Turnover Charges'),
      stampDuty: row.money('Stamp Duty'),
      other: (row.money('Other Charges') + row.money('IPFT Charges')) as Paise,
    });

    if (qty === 0) {
      // A brokerage row: charges for the order, no trade.
      if (tradeId !== '') row.fail('Trade ID', 'expected no trade ID on a brokerage row');
      if (!orderId) row.fail('Order ID', 'required');
      records.push({ broker: 'angelone', id: `order|${exchange}|${orderId}|${side}`, date: tradeDate, charges });
      continue;
    }
    if (!/^\d+$/.test(tradeId)) row.fail('Trade ID', 'expected digits only');

    const instrument = angelContract(contract, exchange as Exchange);
    const price = row.price(side === 'BUY' ? 'Buy Price' : 'Sell Price');
    records.push({ broker: 'angelone', id: `trade|${exchange}|${tradeId}`, date: tradeDate, charges });
    fills.push({
      broker: 'angelone',
      tradeId,
      orderId: orderId || null,
      instrument,
      exchange: exchange as Exchange,
      side,
      auction: false,
      qty,
      pricePaise: price,
      valuePaise: safeMul(qty, price) as Paise,
      tradeDate,
      executedAt: parseIstDateTime(`${tradeDate}T00:00:00`)!,
      timePrecision: 'date',
      sourceFile: fileName,
      sourceRow: line,
    });
  }

  if (fills.length === 0) throw new FoWrappedError(m().noFnoRows(fileName));
  return { broker: 'angelone', fills, charges: mergeRecords(records) };
}

/** `OPTIDX NIFTY Aug 25 2026 24150.00 PE (BT)` → instrument. */
function angelContract(raw: string, exchange: Exchange) {
  if (FUTURE.test(raw)) throw new UnknownInstrumentError(raw, m().futuresNotSeen('Angel One'));
  const match = CONTRACT.exec(raw);
  const month = match ? monthNumber(match[3]!) : null;
  const expiry = match && month ? ymd(Number(match[5]), month, Number(match[4])) : null;
  const strikePaise = match ? decimalToPaise(match[6]!) : null;
  if (!match || !expiry || strikePaise === null) throw new UnknownInstrumentError(raw, m().contractNotRecognised);
  return makeInstrument(raw, { exchange, underlying: match[2]!.toUpperCase(), kind: match[7] as InstrumentKind, strikePaise, expiry });
}

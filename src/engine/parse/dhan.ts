import type { ChargeRecord } from '../charges/types';
import { FoWrappedError, UnknownInstrumentError } from '../errors';
import { m } from '../i18n';
import { decimalToPaise } from '../money';
import { parseIstDateTime } from '../time';
import type { Exchange, Fill, InstrumentKind, Paise, Side } from '../types';
import { dayFirstDate, makeInstrument, monthNumber, ymd } from './instrument';
import { chargesOf, findHeader, isBlankRow, mergeRecords, rowReader, type BrokerFills } from './table';

/** Dhan Global Transaction Report headers (docs/BROKERS.md §2.3). */
export const DHAN_HEADERS = [
  'Date',
  'Scrip Name',
  'Exchange',
  'Bill No.',
  'Buy Qty.',
  'Buy Value',
  'Sell Qty.',
  'Sell Value',
  'Brokerage',
  'GST',
  'STT',
  'SEBI Fees',
  'Stamp Duty',
  'Txn. Charges',
  'Oth. Charges',
  'Gross Amount',
] as const;

const MAX_HEADER_ROW = 20;
const OPTION = /^OPT (\S+) (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d+(?:\.\d+)?) (CE|PE)$/;
const FUTURE = /^FUT (\S+) (\d{2}) ([A-Za-z]{3}) (\d{4})$/;
/** The printed Gross Amount may differ from our sum by rounding. */
const GROSS_TOLERANCE_PAISE = 5;

export function isDhanGlobalTransactionReport(rows: readonly (readonly string[])[]): boolean {
  return findHeader(rows, DHAN_HEADERS, MAX_HEADER_ROW) !== null;
}

/**
 * Parses the NSE/BSE F&O rows of a Dhan Global Transaction Report. Each row
 * is one contract's totals for one day, so it becomes up to two date-only
 * fills (the day's buys and sells). Equity and MCX rows are skipped. Charges
 * are Dhan's own, checked against the row's Gross Amount.
 */
export function parseDhanRows(fileName: string, rows: readonly (readonly string[])[]): BrokerFills {
  const header = findHeader(rows, DHAN_HEADERS, MAX_HEADER_ROW);
  if (!header) throw new FoWrappedError(m().unrecognizedFile(fileName));

  const fills: Fill[] = [];
  const records: ChargeRecord[] = [];
  for (let r = header.at + 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (isBlankRow(cells)) continue;
    const first = cells[0]?.trim() ?? '';
    if (/^net p&l$/i.test(first) || /^note\b/i.test(first)) break;
    const line = r + 1;
    const row = rowReader(fileName, line, cells, header.col);

    const scrip = row.get('Scrip Name');
    const exchange = row.get('Exchange').toUpperCase();
    if (!/^(OPT|FUT) /.test(scrip) || (exchange !== 'NSE' && exchange !== 'BSE')) continue;

    const tradeDate = dayFirstDate(row.get('Date'));
    if (!tradeDate) return row.fail('Date', 'expected dd-mm-yyyy');
    const bill = row.get('Bill No.');
    if (!/^\d+$/.test(bill)) return row.fail('Bill No.', 'expected digits only');
    const instrument = dhanContract(scrip, exchange);

    const buyQty = row.qty('Buy Qty.', true);
    const sellQty = row.qty('Sell Qty.', true);
    const buyValue = row.money('Buy Value');
    const sellValue = row.money('Sell Value');
    if (buyQty + sellQty === 0) return row.fail('Buy Qty.', 'expected a quantity');
    if ((buyQty > 0) !== (buyValue > 0)) return row.fail('Buy Value', 'expected a value for the quantity');
    if ((sellQty > 0) !== (sellValue > 0)) return row.fail('Sell Value', 'expected a value for the quantity');

    const charges = chargesOf({
      brokerage: row.money('Brokerage'),
      gst: row.money('GST'),
      stt: row.money('STT'),
      sebi: row.money('SEBI Fees'),
      stampDuty: row.money('Stamp Duty'),
      exchangeTxn: row.money('Txn. Charges'),
      other: row.money('Oth. Charges'),
    });
    if (Math.abs(sellValue - buyValue - charges.total - row.money('Gross Amount')) > GROSS_TOLERANCE_PAISE) {
      throw new FoWrappedError(m().rowDoesntAddUp(fileName, line));
    }

    const id = `${bill}|${exchange}|${scrip}`;
    records.push({ broker: 'dhan', id, date: tradeDate, charges });
    const push = (side: Side, qty: number, value: number) =>
      fills.push({
        broker: 'dhan',
        tradeId: `${id}|${side}`,
        orderId: null,
        instrument,
        exchange,
        side,
        auction: false,
        qty,
        pricePaise: Math.round(value / qty) as Paise,
        valuePaise: value as Paise,
        tradeDate,
        executedAt: parseIstDateTime(`${tradeDate}T00:00:00`)!,
        timePrecision: 'date',
        sourceFile: fileName,
        sourceRow: line,
      });
    if (buyQty > 0) push('BUY', buyQty, buyValue);
    if (sellQty > 0) push('SELL', sellQty, sellValue);
  }

  if (fills.length === 0) throw new FoWrappedError(m().noFnoRows(fileName));
  return { broker: 'dhan', fills, charges: mergeRecords(records) };
}

/** `OPT NIFTY 07 Apr 2026 23000 CE` / `FUT WIPRO 28 Apr 2026` → instrument. */
function dhanContract(raw: string, exchange: Exchange) {
  const opt = OPTION.exec(raw);
  const fut = opt ? null : FUTURE.exec(raw);
  const match = opt ?? fut;
  const month = match ? monthNumber(match[3]!) : null;
  const expiry = match && month ? ymd(Number(match[4]), month, Number(match[2])) : null;
  if (!match || !expiry) throw new UnknownInstrumentError(raw, m().contractNotRecognised);
  const strikePaise = opt ? decimalToPaise(opt[5]!) : null;
  if (opt && strikePaise === null) throw new UnknownInstrumentError(raw, m().contractNotRecognised);
  const kind: InstrumentKind = opt ? (opt[6] as InstrumentKind) : 'FUT';
  return makeInstrument(raw, { exchange, underlying: match[1]!.toUpperCase(), kind, strikePaise, expiry });
}

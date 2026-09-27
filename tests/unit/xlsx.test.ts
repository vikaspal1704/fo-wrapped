import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { RowValidationError, UnrecognizedFileError, parseTradebook, parseTradebookFile } from '../../src/engine';
import type { Fill } from '../../src/engine';
import { fixture } from './helpers';

type Cell = string | number | boolean | Date | null | { value: unknown; type?: unknown; format?: string };

const csvText = new TextDecoder().decode(fixture('zerodha-fo-tradebook.synthetic.csv'));
const csvRows = csvText.trim().split('\n').map((l) => l.split(','));
const [header, ...dataRows] = csvRows as [string[], ...string[][]];
const col = (name: string) => header.indexOf(name);

const date = (s: string) => ({ value: new Date(`${s}T00:00:00Z`), type: Date, format: 'yyyy-mm-dd' });
const dateTime = (s: string) => ({ value: new Date(`${s}Z`), type: Date, format: 'yyyy-mm-dd hh:mm:ss' });

/**
 * Builds an XLSX that mimics an Excel export: a preamble above the header,
 * numbers stored as numbers, dates as date cells, IDs as text.
 */
async function toXlsx(rows: Cell[][]): Promise<ArrayBuffer> {
  const buf: Buffer = await writeExcelFile(rows as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function typedRow(r: string[], idsAsNumbers = false): Cell[] {
  return r.map((v, i) => {
    const name = header[i];
    if (v === '') return null;
    if (name === 'trade_date' || name === 'expiry_date') return date(v);
    if (name === 'order_execution_time') return dateTime(v);
    if (name === 'quantity' || name === 'price') return Number(v);
    if (idsAsNumbers && (name === 'order_id' || name === 'trade_id')) return Number(v);
    return v;
  });
}

const preamble: Cell[][] = [['Client ID', 'AB1234'], ['Tradebook for F&O'], ['From', '2026-10-01', 'To', '2026-10-31'], [], ...Array.from({ length: 6 }, () => [])];
const strip = (fills: Fill[]) => fills.map(({ sourceFile: _f, sourceRow: _r, ...rest }) => rest);

describe('xlsx tradebooks', () => {
  it('parses_xlsx_with_preamble', async () => {
    const xlsx = await toXlsx([...preamble, header, ...dataRows.map((r) => typedRow(r))]);
    const fromXlsx = await parseTradebookFile('tb.xlsx', xlsx);
    const fromCsv = parseTradebook('tb.csv', fixture('zerodha-fo-tradebook.synthetic.csv'));
    expect(strip(fromXlsx)).toEqual(strip(fromCsv));
    // Row numbers point at the spreadsheet row (preamble + header + 1).
    expect(fromXlsx[0]!.sourceRow).toBe(preamble.length + 2);
  });

  it('parses_xlsx_with_console_headers', async () => {
    // Console's XLSX writes `Trade Date`, not `trade_date`, and starts in column B.
    const titleCase = header.map((h) => h.split('_').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '));
    expect(titleCase).toContain('Order Execution Time');
    const b = (r: Cell[]): Cell[] => [null, ...r];
    const xlsx = await toXlsx([...preamble.map(b), b(titleCase), ...dataRows.map((r) => b(typedRow(r)))]);
    const fromCsv = parseTradebook('tb.csv', fixture('zerodha-fo-tradebook.synthetic.csv'));
    expect(strip(await parseTradebookFile('tb.xlsx', xlsx))).toEqual(strip(fromCsv));
  });

  it('rejects_equity_xlsx_tradebook', async () => {
    const eqHeader = ['Symbol', 'ISIN', 'Trade Date', 'Exchange', 'Segment', 'Series', 'Trade Type', 'Auction', 'Quantity', 'Price', 'Trade ID', 'Order ID', 'Order Execution Time'];
    const row: Cell[] = ['TEST', 'INE000000000', date('2026-04-01'), 'NSE', 'EQ', 'EQ', 'buy', false, 11, 572.75, '205170048', '1100000051344017', dateTime('2026-04-01T11:14:28')];
    await expect(parseTradebookFile('eq.xlsx', await toXlsx([eqHeader, row]))).rejects.toMatchObject({ userMessage: expect.stringContaining('Equity') });
  });

  it('xlsx_keeps_19_digit_text_order_id_exact', async () => {
    const row = typedRow(dataRows[5]!);
    expect(row[col('order_id')]).toBe('1799000000000000001');
    const [f] = await parseTradebookFile('tb.xlsx', await toXlsx([header, row]));
    expect(f!.orderId).toBe('1799000000000000001');
  });

  it('rejects_xlsx_order_id_rounded_by_excel', async () => {
    const row = typedRow(dataRows[5]!, true); // 19-digit order_id stored as a number
    const err = await parseTradebookFile('tb.xlsx', await toXlsx([header, row])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RowValidationError);
    expect((err as RowValidationError).field).toBe('order_id');
  });

  it('parses_xlsx_price_stored_as_number_exactly', async () => {
    const row = typedRow(dataRows[0]!);
    row[col('price')] = 0.29; // 0.29 × 100 is 28.999… in floating point
    const [f] = await parseTradebookFile('tb.xlsx', await toXlsx([header, row]));
    expect(f!.pricePaise).toBe(29);
  });

  it('xlsx_time_rounding_to_nearest_second', async () => {
    // Every second of a trading day must survive the fractional-day round trip.
    const rows: Cell[][] = [header];
    const base = typedRow(dataRows[0]!);
    for (let sec = 0; sec < 60; sec++) {
      const r = [...base];
      r[col('trade_id')] = String(9_000_000 + sec);
      r[col('order_execution_time')] = dateTime(`2026-10-06T11:02:${String(sec).padStart(2, '0')}`);
      rows.push(r);
    }
    const fills = await parseTradebookFile('tb.xlsx', await toXlsx(rows));
    expect(fills.map((f) => ((f.executedAt / 1000) % 60 + 60) % 60)).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });

  it('rejects_xlsx_without_tradebook_headers', async () => {
    await expect(parseTradebookFile('x.xlsx', await toXlsx([['name', 'amount'], ['a', 1]]))).rejects.toThrow(UnrecognizedFileError);
  });

  it('rejects_corrupt_xlsx', async () => {
    const zipHeaderOnly = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer;
    await expect(parseTradebookFile('bad.xlsx', zipHeaderOnly)).rejects.toThrow(UnrecognizedFileError);
  });

  it('rejects_legacy_xls_with_message', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer;
    await expect(parseTradebookFile('old.xls', ole)).rejects.toThrow(/old \.xls file/);
  });

  it('csv_path_unchanged_through_parseTradebookFile', async () => {
    const bytes = fixture('zerodha-fo-tradebook.synthetic.csv');
    expect(await parseTradebookFile('tb.csv', bytes)).toEqual(parseTradebook('tb.csv', bytes));
  });
});

import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { RATES, analyze, readBrokerFile, type BrokerFile, type BrokerFills } from '../../src/engine';

type Cell = string | number | Date | null;
const SITE = 'https://example.test/';

async function xlsx(rows: Cell[][], sheet: string): Promise<ArrayBuffer> {
  const data = rows.map((r) => r.map((c) => (c instanceof Date ? { value: c, type: Date, format: 'yyyy-mm-dd' } : c)));
  const buf: Buffer = await writeExcelFile(data as never, { sheet } as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
const csv = (lines: string[]) => new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer;
const day = (s: string) => new Date(`${s}T00:00:00Z`);
function fillsOf(f: BrokerFile): BrokerFills {
  if (f.kind !== 'fills') throw new Error('expected fills');
  return f;
}

// ---------------------------------------------------------------- Angel One
const ANGEL_HEADER = ['Scrip/Contract', 'Buy/Sell', 'Buy Price', 'Sell Price', 'Quantity', 'Brokerage', 'GST', 'STT', 'Sebi Tax', 'Exchange Turnover Charges', 'Stamp Duty', 'Other Charges', 'IPFT Charges', 'Order Type', 'Segment', 'Exchange', 'Order ID', 'Trade ID', 'Date'];
/** Synthetic Trades History with the real layout (docs/BROKERS.md §2.1). */
function angelOne(rows: Cell[][]): Promise<ArrayBuffer> {
  return xlsx(
    [
      [],
      ['ClientCode'],
      ['DateOfDownload', '2026-09-04'],
      [],
      ['Date Range'],
      ['StartDate', 'EndDate'],
      ['2026-08-01 00:00:00.0', '2026-08-31 23:59:59.0'],
      [],
      ['Charges Summary'],
      ['Total Charges', 1],
      [],
      ['TradeBook And Charges'],
      ANGEL_HEADER,
      ...rows,
      [],
      ['NOTE: Data Accurate Till', '2026-08-31'],
    ],
    'TradesAndCharges',
  );
}
const NIFTY_PE = 'OPTIDX NIFTY Aug 25 2026 24150.00 PE (BT)';
const angelRows = (): Cell[][] => [
  // contract, side, buy, sell, qty, brokerage, gst, stt, sebi, txn, stamp, other, ipft, type, segment, exch, order, trade, date
  ['TEST EQUITY LTD', 'Sell', null, 221.2, 5, 0.33, 0.07, 0.03, 0, 0.03, 0, 0, 0, 'Intraday', 'CAPITAL', 'NSE', '1100000000000001', '400000001', day('2026-08-25')],
  [NIFTY_PE, 'Buy', 17.65, null, 65, 0, 0.07, 0, 0, 0.41, 0.02, 0, 0, 'Intraday', 'FUTURES', 'NSE', '1000000000000001', '8000001', day('2026-08-25')],
  [NIFTY_PE, 'Sell', null, 32.9, 65, 0, 0.14, 3, 0.01, 0.76, 0, 0, 0.01, 'Intraday', 'FUTURES', 'NSE', '1000000000000002', '8000002', day('2026-08-25')],
  [NIFTY_PE, 'Buy', 0, null, 0, 20, 3.6, 0, 0, 0, 0, 0, 0, 'Intraday', 'FUTURES', 'NSE', '1000000000000001', null, day('2026-08-25')],
  [NIFTY_PE, 'Sell', null, 0, 0, 20, 3.6, 0, 0, 0, 0, 0, 0, 'Intraday', 'FUTURES', 'NSE', '1000000000000002', null, day('2026-08-25')],
  ['BSXOPT SENSEX Aug 27 2026 77600.00 CE (BT)', 'Buy', 54.75, null, 40, 0, 0.13, 0, 0, 0.71, 0, 0, 0, 'Intraday', 'FUTURES', 'BSE', '1787805984776337001', '17000001', day('2026-08-27')],
];

describe('Angel One Trades History', () => {
  it('parses_angelone_trades_history', async () => {
    const f = fillsOf(await readBrokerFile('trades.xlsx', await angelOne(angelRows())));
    expect(f.broker).toBe('angelone');
    expect(f.fills).toHaveLength(3); // equity row skipped, brokerage rows are charges only
    const [buy, sell, sensex] = f.fills;
    expect(buy).toMatchObject({ side: 'BUY', qty: 65, pricePaise: 1765, valuePaise: 114725, tradeDate: '2026-08-25', timePrecision: 'date', exchange: 'NSE' });
    expect(buy!.instrument).toMatchObject({ underlying: 'NIFTY', kind: 'PE', strikePaise: 2415000, expiry: '2026-08-25', tradingSymbol: 'NIFTY 25AUG26 24150 PE' });
    expect(sell).toMatchObject({ side: 'SELL', pricePaise: 3290 });
    expect(sensex!.instrument).toMatchObject({ underlying: 'SENSEX', kind: 'CE', expiry: '2026-08-27' });
    expect(sensex!.exchange).toBe('BSE');
    // F&O charges only: 2 trades' rows + 2 brokerage rows + the SENSEX row.
    const total = f.charges!.reduce((s, r) => s + r.charges.total, 0);
    expect(total).toBe(7 + 41 + 2 + 14 + 300 + 1 + 76 + 1 + 2 * 2360 + 13 + 71);
    const brokerage = f.charges!.reduce((s, r) => s + r.charges.brokerage, 0);
    expect(brokerage).toBe(4000);
  });

  it('angelone_charges_are_exact_in_analysis', async () => {
    const f = fillsOf(await readBrokerFile('trades.xlsx', await angelOne(angelRows().slice(0, 5))));
    const r = analyze({ tradebooks: [f.fills], reportedCharges: [{ broker: 'angelone', records: f.charges! }], rates: RATES, siteUrl: SITE });
    expect(r.totals.source).toBe('BROKER');
    expect(r.totals.grossPnlPaise).toBe(65 * (3290 - 1765));
    expect(r.totals.charges!.total).toBe(7 + 41 + 2 + 14 + 300 + 1 + 76 + 1 + 2 * 2360);
    expect(r.cards.yourClock).toMatchObject({ status: 'INSUFFICIENT_DATA', code: 'NO_TRADE_TIMES' });
  });

  it('rejects_angelone_futures', async () => {
    const rows = angelRows();
    rows[1]![0] = 'FUTIDX NIFTY Aug 25 2026';
    await expect(readBrokerFile('trades.xlsx', await angelOne(rows))).rejects.toMatchObject({ userMessage: expect.stringContaining('Futures from Angel One') });
  });

  it('rejects_angelone_file_without_fno_rows', async () => {
    await expect(readBrokerFile('trades.xlsx', await angelOne(angelRows().slice(0, 1)))).rejects.toMatchObject({ userMessage: expect.stringContaining('no F&O trades') });
  });
});

// ---------------------------------------------------------------- Upstox
const UPSTOX_HEADER = ['Date', 'Company', 'Amount', 'Exchange', 'Segment', 'Scrip Code', 'Instrument Type', 'Strike Price', 'Expiry', 'Trade Num', 'Trade Time', 'Side', 'Quantity', 'Price'];
/** Synthetic trade report with the real layout (docs/BROKERS.md §2.2). */
function upstox(rows: Cell[][]): Promise<ArrayBuffer> {
  return xlsx(
    [
      ['UPSTOX SECURITIES PRIVATE LIMITED'],
      ['(test)'],
      ['Dealing Office: test'],
      [],
      ['UCC'],
      ['Name'],
      ['PAN'],
      ['Report Time Period', '28-08-2026 To 04-09-2026'],
      ['Generated On', '2026-09-04 00:07:10'],
      [],
      UPSTOX_HEADER,
      ...rows,
      [],
      [],
      ['A footnote about the broker.'],
    ],
    'TRADE',
  );
}
const upstoxRows = (): Cell[][] => [
  [day('2026-08-28'), 'TEST CO', 1243.7, 'NSE', 'EQ', '500001', 'Equity', 0, null, '204257888', '11:52:13', 'Buy', 2, 621.85],
  [day('2026-08-28'), 'NIFTY', 2470, 'FON', 'FO', 'NIFTY', 'European Put', 24000, '01-09-2026', '1468483', '11:37:22', 'Buy', 65, 38],
  [day('2026-08-28'), 'NIFTY', 2385.5, 'FON', 'FO', 'NIFTY', 'European Put', 24000, '01-09-2026', '1489993', '11:38:40', 'Sell', 65, 36.7],
  [day('2026-08-28'), 'BSX', 1801, 'FOB', 'FO', 'BSX', 'European Call', 78300, '03-09-2026', '903090', '11:46:39', 'Buy', 20, 90.05],
  [day('2026-08-28'), 'BSX', 1816, 'FOB', 'FO', 'BSX', 'European Call', 78300, '03-09-2026', '910080', '11:49:32', 'Sell', 20, 90.8],
];

describe('Upstox trade report', () => {
  it('parses_upstox_trade_report', async () => {
    const f = fillsOf(await readBrokerFile('trade.xlsx', await upstox(upstoxRows())));
    expect(f.broker).toBe('upstox');
    expect(f.charges).toBeNull();
    expect(f.fills).toHaveLength(4);
    expect(f.fills[0]).toMatchObject({ side: 'BUY', qty: 65, pricePaise: 3800, valuePaise: 247000, exchange: 'NSE', orderId: null, timePrecision: 'second', tradeId: '1468483' });
    expect(f.fills[0]!.instrument).toMatchObject({ underlying: 'NIFTY', kind: 'PE', strikePaise: 2400000, expiry: '2026-09-01' });
    expect(f.fills[2]).toMatchObject({ exchange: 'BSE', pricePaise: 9005 });
    expect(f.fills[2]!.instrument).toMatchObject({ underlying: 'SENSEX', kind: 'CE', expiry: '2026-09-03' });
    expect(new Date(f.fills[0]!.executedAt).toISOString()).toBe('2026-08-28T06:07:22.000Z');
  });

  it('upstox_charges_are_estimated_with_upstox_brokerage', async () => {
    const f = fillsOf(await readBrokerFile('trade.xlsx', await upstox(upstoxRows())));
    const r = analyze({ tradebooks: [f.fills], rates: RATES, siteUrl: SITE });
    expect(r.totals.source).toBe('ESTIMATED');
    expect(r.totals.charges!.brokerage).toBe(4 * 2000); // ₹20 per executed order, 4 orders
    expect(r.cards.yourClock).not.toMatchObject({ code: 'NO_TRADE_TIMES' });
    const card = r.cards.theNumber;
    expect(card.status === 'OK' && card.notes).toContain('Charges are estimated from published rates.');
  });

  it('rejects_upstox_futures', async () => {
    const rows = upstoxRows();
    rows[1]![6] = 'Future';
    await expect(readBrokerFile('trade.xlsx', await upstox(rows))).rejects.toMatchObject({ userMessage: expect.stringContaining('Futures from Upstox') });
  });

  it('rejects_upstox_row_whose_amount_doesnt_match', async () => {
    const rows = upstoxRows();
    rows[1]![2] = 2471;
    await expect(readBrokerFile('trade.xlsx', await upstox(rows))).rejects.toMatchObject({ userMessage: expect.stringContaining('row 13') });
  });
});

// ---------------------------------------------------------------- Dhan
/** Synthetic Global Transaction Report with the real layout (docs/BROKERS.md §2.3). */
function dhan(rows: string[]): ArrayBuffer {
  const pad = (s: string) => s + ','.repeat(15 - (s.match(/,/g)?.length ?? 0));
  return csv([
    pad('Global transction report,From 01-04-2026 to 30-04-2026'),
    pad('Name'),
    pad('UCC'),
    pad('Mobile'),
    pad('Email ID'),
    pad(''),
    'Date,Scrip Name,Exchange,Bill No.,Buy Qty.,Buy Value,Sell Qty.,Sell Value,Brokerage,GST,STT,SEBI Fees,Stamp Duty,Txn. Charges,Oth. Charges,Gross Amount',
    ...rows,
    pad(''),
    pad('Net P&L,-1.5,Brokerage,1,Gross P&L,1,Total Charges,1'),
    pad(''),
    pad('NOTE : This sheet was downloaded at 4/30/2026 12:43 AM'),
  ]);
}
const DHAN_ROWS = [
  '01-04-2026 00:00,OPT CRUDEOIL 16 Apr 2026 9000 PE,MCX,4894,200,127380,200,128340,80,33.69,64,0.26,3.82,106.89,0,671.34',
  '01-04-2026 00:00,Test Equity Ltd,NSE,14993,354,136406.54,354,135807.82,40,8.75,34.03,0.27,4.09,8.36,0,-694.22',
  '01-04-2026 00:00,OPT NIFTY 07 Apr 2026 23000 CE,NSE,14993,585,135840.25,585,134260.75,80,31.72,201.22,0.27,4.32,95.97,0,-1993',
  '01-04-2026 00:00,OPT SENSEX 02 Apr 2026 73000 PE,BSE,14993,220,65670.99,220,72806.01,40,15.33,109.21,0.14,1.97,45.01,0,6923.36',
  '02-04-2026 00:00,FUT WIPRO 28 Apr 2026,NSE,15001,3000,720000,0,0,20,3.6,0,0.72,14.4,5.94,0,-720044.66',
];

describe('Dhan Global Transaction Report', () => {
  it('parses_dhan_global_transaction_report', async () => {
    const f = fillsOf(await readBrokerFile('gtr.csv', dhan(DHAN_ROWS)));
    expect(f.broker).toBe('dhan');
    expect(f.fills).toHaveLength(5); // MCX + equity skipped; futures buy only
    expect(f.fills[0]).toMatchObject({ side: 'BUY', qty: 585, valuePaise: 13584025, timePrecision: 'date', tradeDate: '2026-04-01' });
    expect(f.fills[0]!.instrument).toMatchObject({ underlying: 'NIFTY', kind: 'CE', strikePaise: 2300000, expiry: '2026-04-07' });
    expect(f.fills[2]!.exchange).toBe('BSE');
    expect(f.fills[4]!.instrument).toMatchObject({ underlying: 'WIPRO', kind: 'FUT', strikePaise: null, expiry: '2026-04-28' });
    expect(f.charges!.reduce((s, r) => s + r.charges.total, 0)).toBe(41350 + 21166 + 4466);
  });

  it('dhan_totals_match_the_report', async () => {
    const f = fillsOf(await readBrokerFile('gtr.csv', dhan(DHAN_ROWS.slice(2, 4))));
    const r = analyze({ tradebooks: [f.fills], reportedCharges: [{ broker: 'dhan', records: f.charges! }], rates: RATES, siteUrl: SITE });
    // Net = Σ Gross Amount of the two rows.
    expect(r.totals.netPnlPaise).toBe(-199300 + 692336);
    expect(r.totals.source).toBe('BROKER');
  });

  it('dhan_overlapping_files_count_once', async () => {
    const a = fillsOf(await readBrokerFile('a.csv', dhan(DHAN_ROWS.slice(2, 4))));
    const b = fillsOf(await readBrokerFile('b.csv', dhan(DHAN_ROWS.slice(2, 4))));
    const r = analyze({
      tradebooks: [a.fills, b.fills],
      reportedCharges: [{ broker: 'dhan', records: a.charges! }, { broker: 'dhan', records: b.charges! }],
      rates: RATES,
      siteUrl: SITE,
    });
    expect(r.duplicateFillsDropped).toBe(4);
    expect(r.totals.netPnlPaise).toBe(-199300 + 692336);
  });

  it('rejects_dhan_row_that_doesnt_add_up', async () => {
    const rows = [DHAN_ROWS[2]!.replace(',-1993', ',-1990')];
    await expect(readBrokerFile('gtr.csv', dhan(rows))).rejects.toMatchObject({ userMessage: expect.stringContaining('row 8') });
  });

  it('rejects_unreadable_dhan_contract', async () => {
    const rows = [DHAN_ROWS[2]!.replace('OPT NIFTY 07 Apr 2026 23000 CE', 'OPT NIFTY 2026-04-07 23000 CE')];
    await expect(readBrokerFile('gtr.csv', dhan(rows))).rejects.toMatchObject({ userMessage: expect.stringContaining('OPT NIFTY 2026-04-07') });
  });
});

// ---------------------------------------------------------------- Routing
describe('file routing', () => {
  it('recognises_groww_file_and_explains', async () => {
    const bytes = await xlsx(
      [
        ['Name', 'TEST'],
        ['Unique Client Code'],
        [],
        ['Order history for stocks from 01-04-2025 to 31-03-2026'],
        [],
        ['Stock name', 'Symbol', 'ISIN', 'Type', 'Quantity', 'Value', 'Exchange', 'Exchange Order Id', 'Execution date and time', 'Order status'],
        ['TEST LTD', 'TEST', 'INE000000000', 'BUY', 1, 100, 'NSE', '1', '11-04-2025 10:43 AM', 'Executed'],
      ],
      'Sheet1',
    );
    await expect(readBrokerFile('groww.xlsx', bytes)).rejects.toMatchObject({ userMessage: expect.stringContaining('Groww') });
  });

  it('routes_zerodha_tradebook', async () => {
    const lines = [
      'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date',
      'NIFTY25N2024000CE,,2025-11-20,NSE,FO,,buy,false,75,100.00,1,1,2025-11-20T09:20:00,2025-11-20',
    ];
    const f = fillsOf(await readBrokerFile('tradebook.csv', csv(lines)));
    expect(f).toMatchObject({ broker: 'zerodha', charges: null });
    expect(f.fills).toHaveLength(1);
  });

  it('rejects_unrecognized_file_naming_supported_brokers', async () => {
    await expect(readBrokerFile('notes.csv', csv(['hello,world']))).rejects.toMatchObject({ userMessage: expect.stringContaining('Angel One') });
  });
});

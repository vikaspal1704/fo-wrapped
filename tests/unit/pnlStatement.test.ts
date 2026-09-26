import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { RATES, analyze, checkStatementCoverage, decimalToPaiseRounded, parsePnlStatement } from '../../src/engine';
import type { IstDate } from '../../src/engine';
import { fill } from './helpers';

type Cell = string | number | null;

/** A synthetic Console P&L statement with the real layout (docs/BROKERS.md §2.4): data from column B. */
async function statement(opts: {
  segment?: string;
  from?: string;
  to?: string;
  realized: string;
  heads: [string, string][];
  chargesTotal?: string;
  other?: string;
  symbols: [string, string][];
}): Promise<ArrayBuffer> {
  const b = (...cells: Cell[]): Cell[] => [null, ...cells];
  const total = opts.chargesTotal ?? opts.heads.reduce((s, [, v]) => s + Number(v), 0).toFixed(4);
  const rows: Cell[][] = [
    [], [], [], [], [], [],
    b('Client ID', 'AB1234'),
    [], [], [],
    b(`P&L Statement for ${opts.segment ?? 'F&O'} from ${opts.from ?? '2025-11-01'} to ${opts.to ?? '2025-11-30'}`),
    [],
    b('Summary'),
    [],
    b('Charges', Number(total)),
    b('Other Credit & Debit', Number(opts.other ?? '0')),
    b('Realized P&L', Number(opts.realized)),
    b('Unrealized P&L', 0),
    [], [],
    b('Charges'),
    [],
    b('Account Head', 'Amount'),
    ...opts.heads.map(([h, v]) => b(h, Number(v))),
    [], [], [], [],
    b('Symbol', 'ISIN', 'Quantity', 'Buy Value', 'Sell Value', 'Realized P&L', 'Realized P&L Pct.', 'Previous Closing Price', 'Open Quantity', 'Open Quantity Type', 'Open Value', 'Unrealized P&L', 'Unrealized P&L Pct.'),
    ...opts.symbols.map(([s, v]) => b(s, null, 75, 0, 0, Number(v), 0, 0, 0, null, 0, 0, 0)),
  ];
  const buf: Buffer = await writeExcelFile(rows.map((r) => r.map((c) => (c === undefined ? null : c))) as never, { sheet: 'F&O' } as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const HEADS: [string, string][] = [
  ['Brokerage - Z', '100'],
  ['Exchange Transaction Charges - Z', '6.1337'],
  ['Clearing Charges - Z', '0'],
  ['Central GST - Z', '0'],
  ['State GST - Z', '0'],
  ['Integrated GST - Z', '19.1643'],
  ['Securities Transaction Tax - Z', '45'],
  ['SEBI Turnover Fees - Z', '0.0221'],
  ['Stamp Duty - Z', '3'],
  ['IPFT', '0.2901'],
];

const trip = (sym: string, buy: string, sell: string, day = '2025-11-20') => [
  fill({ side: 'BUY', qty: 75, price: buy, at: `${day}T10:00:00`, symbol: sym, expiry: '2025-11-25' }),
  fill({ side: 'SELL', qty: 75, price: sell, at: `${day}T10:30:00`, symbol: sym, expiry: '2025-11-25' }),
];

describe('P&L statement', () => {
  it('rounds_statement_values_to_paise', () => {
    expect(decimalToPaiseRounded('20099.9999')).toBe(2_010_000);
    expect(decimalToPaiseRounded('-127.5')).toBe(-12_750);
    expect(decimalToPaiseRounded('0.0221')).toBe(2);
    expect(decimalToPaiseRounded('1,234.565')).toBe(123_457);
    expect(decimalToPaiseRounded('1.2e3')).toBeNull();
  });

  it('parses_console_pnl_statement', async () => {
    const st = await parsePnlStatement('pnl.xlsx', await statement({ realized: '1500', heads: HEADS, symbols: [['NIFTY25NOV24000CE', '1500']] }));
    expect(st).toMatchObject({ periodFrom: '2025-11-01', periodTo: '2025-11-30', realizedPnlPaise: 150_000, unmappedHeads: [] });
    expect(st.charges).toEqual({ brokerage: 10_000, exchangeTxn: 613, gst: 1916, stt: 4500, sebi: 2, stampDuty: 300, other: 29, total: 17_360 });
    expect(st.perSymbol).toEqual([{ tradingSymbol: 'NIFTY25NOV24000CE', realizedPnlPaise: 150_000, openQuantity: 0 }]);
  });

  it('rejects_equity_pnl_statement', async () => {
    await expect(parsePnlStatement('eq.xlsx', await statement({ segment: 'Equity', realized: '0', heads: HEADS, symbols: [] }))).rejects.toThrow(/P&L statement for Equity/);
  });

  it('rejects_statement_whose_charges_dont_add_up', async () => {
    await expect(parsePnlStatement('bad.xlsx', await statement({ realized: '0', heads: HEADS, chargesTotal: '999', symbols: [] }))).rejects.toThrow(/don’t add up/);
  });

  it('statement_totals_override_calculator', async () => {
    const st = await parsePnlStatement('pnl.xlsx', await statement({ realized: '1500', heads: HEADS, symbols: [['NIFTY25NOV24000CE', '1500']] }));
    const r = analyze({ tradebooks: [trip('NIFTY25NOV24000CE', '100', '120')], pnlStatements: [st], rates: RATES, siteUrl: 'x' });
    expect(r.totals).toMatchObject({ source: 'PNL_STATEMENT', grossPnlPaise: 150_000, netPnlPaise: 150_000 - 17_360 });
    expect(r.totals.charges).toEqual(st.charges);
    const c = r.cards.theNumber;
    expect(c.status === 'OK' && c.data.estimated).toBe(false);
  });

  it('values_settled_position_from_pnl_statement', async () => {
    // Closed trade +₹1,500; an unclosed call that expired; the statement says the symbol made ₹1,500 − ₹700.
    const expired = fill({ side: 'BUY', qty: 75, price: '10', at: '2025-11-21T10:00:00', symbol: 'NIFTY25NOV24100CE', expiry: '2025-11-25' });
    const later = fill({ side: 'BUY', qty: 1, price: '1', at: '2025-11-28T10:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' });
    const st = await parsePnlStatement(
      'pnl.xlsx',
      await statement({ realized: '800', heads: HEADS, symbols: [['NIFTY25NOV24000CE', '1500'], ['NIFTY25NOV24100CE', '-700']] }),
    );
    const r = analyze({ tradebooks: [[...trip('NIFTY25NOV24000CE', '100', '120'), expired, later]], pnlStatements: [st], rates: RATES, siteUrl: 'x' });
    const valued = r.roundTrips.find((rt) => rt.exitKind === 'EXPIRY')!;
    expect(valued).toMatchObject({ grossPnlPaise: -70_000, exitDate: '2025-11-25', qty: 75, side: 'LONG' });
    expect(r.unclosed.map((u) => u.instrument.tradingSymbol)).toEqual(['NIFTY25DEC24000CE']);
  });

  it('settled_position_without_symbol_row_stays_excluded', async () => {
    const expired = fill({ side: 'BUY', qty: 75, price: '10', at: '2025-11-21T10:00:00', symbol: 'NIFTY25NOV24100CE', expiry: '2025-11-25' });
    const later = fill({ side: 'BUY', qty: 1, price: '1', at: '2025-11-28T10:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' });
    const st = await parsePnlStatement('pnl.xlsx', await statement({ realized: '1500', heads: HEADS, symbols: [['NIFTY25NOV24000CE', '1500']] }));
    const r = analyze({ tradebooks: [[...trip('NIFTY25NOV24000CE', '100', '120'), expired, later]], pnlStatements: [st], rates: RATES, siteUrl: 'x' });
    expect(r.roundTrips.some((rt) => rt.exitKind === 'EXPIRY')).toBe(false);
    expect(r.unclosed.map((u) => u.status)).toContain('SETTLED_AT_EXPIRY');
  });

  it('warns_when_tradebook_and_statement_differ', async () => {
    const st = await parsePnlStatement('pnl.xlsx', await statement({ realized: '1600', heads: HEADS, symbols: [['NIFTY25NOV24000CE', '1600']] }));
    const r = analyze({ tradebooks: [trip('NIFTY25NOV24000CE', '100', '120')], pnlStatements: [st], rates: RATES, siteUrl: 'x' });
    expect(r.warnings.join(' ')).toMatch(/differs from your P&L statement by 6\.3%/);
  });

  it('statement_never_split_across_periods', async () => {
    // Statement covers Nov; the calendar-2025 view has Nov + Dec trades → estimated there, exact in a Nov-only view.
    const st = await parsePnlStatement('pnl.xlsx', await statement({ realized: '1500', heads: HEADS, symbols: [] }));
    const dec = [
      fill({ side: 'BUY', qty: 75, price: '10', at: '2025-12-02T10:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
      fill({ side: 'SELL', qty: 75, price: '11', at: '2025-12-02T10:30:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
    ];
    const r = analyze({ tradebooks: [[...trip('NIFTY25NOV24000CE', '100', '120'), ...dec]], pnlStatements: [st], rates: RATES, siteUrl: 'x' });
    const cy = r.views.find((v) => v.period.id === 'cy-2025')!;
    expect(cy.totals.source).toBe('ESTIMATED');
    expect(cy.warnings.join(' ')).toMatch(/doesn’t match this period/);
  });

  it('rejects_statement_with_non_overlapping_period', async () => {
    const st = await parsePnlStatement('pnl.xlsx', await statement({ from: '2022-04-01', to: '2023-03-31', realized: '0', heads: HEADS, symbols: [] }));
    expect(() => checkStatementCoverage('pnl.xlsx', st, ['2025-11-20' as IstDate])).toThrow(/covers 2022-04-01 to 2023-03-31/);
    expect(() => checkStatementCoverage('pnl.xlsx', st, [])).toThrow(/Add your Zerodha tradebook/);
  });
});

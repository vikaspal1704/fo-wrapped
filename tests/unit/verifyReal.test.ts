import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import {
  checkAccount,
  classifyContracts,
  countPrimaryRates,
  decideGate,
  detailFileName,
  formatMarkdown,
  main,
  type AccountOutcome,
} from '../../scripts/verify-real';
import { buildRoundTrips, RATES, type ChargeRateTable, type IstDate, type Paise } from '../../src/engine';
import { fill } from './helpers';

const csv = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const HEADER = 'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date';
const TRADEBOOK = [
  HEADER,
  'NIFTY25N2024000CE,,2025-11-20,NSE,FO,,buy,false,75,100.00,1,11,2025-11-20T09:20:00,2025-11-20',
  'NIFTY25N2024000CE,,2025-11-20,NSE,FO,,sell,false,75,120.00,2,12,2025-11-20T10:20:00,2025-11-20',
].join('\n');

async function statement(realized: number, charges: number): Promise<ArrayBuffer> {
  const b = (...cells: (string | number | null)[]) => [null, ...cells];
  const rows = [
    b('P&L Statement for F&O from 2025-11-01 to 2025-11-30'),
    b('Charges', charges),
    b('Other Credit & Debit', 0),
    b('Realized P&L', realized),
    [],
    b('Account Head', 'Amount'),
    b('Brokerage - Z', charges),
  ];
  const buf: Buffer = await writeExcelFile(rows as never, { sheet: 'F&O' } as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('verify-real harness', () => {
  it('verify_real_passes_within_tolerance', async () => {
    // Gross ₹1,500; the estimate's charges are within a few rupees of ₹60.
    const est = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(TRADEBOOK) },
      { name: 'pnl.xlsx', bytes: await statement(1500, 60) },
    ]);
    expect(est.grossDiffPct).toBe(0);
    expect(est.componentDiffPct.stt).toBeNull();
    expect(est.pass).toBe(est.netDiffPct <= 0.5);
  });

  it('verify_real_fails_outside_tolerance', async () => {
    const r = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(TRADEBOOK) },
      { name: 'pnl.xlsx', bytes: await statement(1600, 60) },
    ]);
    expect(r.netDiffPct).toBeGreaterThan(0.5);
    expect(r.pass).toBe(false);
  });

  it('verify_real_needs_one_statement', async () => {
    await expect(checkAccount([{ name: 'tradebook.csv', bytes: csv(TRADEBOOK) }])).rejects.toThrow('exactly one P&L statement');
  });
});

/** A P&L statement with contract rows: [symbol, realised ₹, open qty]. */
async function statementWithRows(realized: number, charges: number, rows: [string, number, number][], period = ['2025-11-01', '2025-11-30']): Promise<ArrayBuffer> {
  const b = (...cells: (string | number | null)[]) => [null, ...cells];
  const sheet = [
    b(`P&L Statement for F&O from ${period[0]} to ${period[1]}`),
    b('Charges', charges),
    b('Other Credit & Debit', 0),
    b('Realized P&L', realized),
    [],
    b('Account Head', 'Amount'),
    b('Brokerage - Z', charges),
    [],
    b('Symbol', 'ISIN', 'Quantity', 'Buy Value', 'Sell Value', 'Realized P&L', 'Realized P&L Pct.', 'Previous Closing Price', 'Open Quantity', 'Open Quantity Type', 'Open Value', 'Unrealized P&L', 'Unrealized P&L Pct.'),
    ...rows.map(([sym, pnl, open]) => b(sym, '', 0, 0, 0, pnl, 0, 0, open, '', 0, 0, 0)),
  ];
  const buf: Buffer = await writeExcelFile(sheet as never, { sheet: 'F&O' } as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const row = (sym: string, date: string, side: 'buy' | 'sell', qty: number, price: string, id: number, expiry: string) =>
  `${sym},,${date},NSE,FO,,${side},false,${qty},${price},${id},${id + 100},${date}T10:${String(id % 60).padStart(2, '0')}:00,${expiry}`;

/** Everything set to primary, as the table must be at launch. */
function allPrimary(): ChargeRateTable {
  const t = structuredClone(RATES) as ChargeRateTable;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if ('checked' in o) (o as { checked: string }).checked = 'primary';
      Object.values(o).forEach(walk);
    }
  };
  walk(t);
  return t;
}

describe('launch-gate harness (SPEC US-0.1, US-0.2, US-0.5)', () => {
  it('verify_real_uses_only_trades_in_statement_period', async () => {
    // AC-0.1.2: a big October trade outside the November statement is ignored.
    const tb = [
      HEADER,
      row('NIFTY25OCT24000CE', '2025-10-20', 'buy', 75, '100.00', 21, '2025-10-28'),
      row('NIFTY25OCT24000CE', '2025-10-20', 'sell', 75, '400.00', 22, '2025-10-28'),
      ...TRADEBOOK.split('\n').slice(1),
    ].join('\n');
    const r = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(tb) },
      { name: 'pnl.xlsx', bytes: await statement(1500, 60) },
    ]);
    expect(r.grossDiffPct).toBe(0);
  });

  it('verify_real_classifies_contracts', () => {
    // AC-0.2.2 to AC-0.2.5, one contract each.
    const at = (d: string, t: string) => `${d}T${t}`;
    const c = (symbol: string, expiry = '2025-11-25') => ({ symbol, expiry });
    const fills = [
      fill({ side: 'BUY', qty: 75, price: '100.00', at: at('2025-11-10', '10:00:00'), ...c('NIFTY25NOV24000CE') }),
      fill({ side: 'SELL', qty: 75, price: '120.00', at: at('2025-11-10', '11:00:00'), ...c('NIFTY25NOV24000CE') }),
      fill({ side: 'BUY', qty: 75, price: '100.00', at: at('2025-11-10', '10:00:00'), ...c('NIFTY25NOV24100CE') }),
      fill({ side: 'SELL', qty: 75, price: '110.00', at: at('2025-11-10', '11:00:00'), ...c('NIFTY25NOV24100CE') }),
      fill({ side: 'BUY', qty: 75, price: '100.00', at: at('2025-11-10', '10:00:00'), ...c('NIFTY25NOV24200CE') }),
      fill({ side: 'SELL', qty: 75, price: '101.00', at: at('2025-11-10', '11:00:00'), ...c('NIFTY25NOV24200CE') }),
      fill({ side: 'BUY', qty: 75, price: '50.00', at: at('2025-11-12', '10:00:00'), ...c('NIFTY25NOV24300CE') }),
    ];
    const { roundTrips, unclosed } = buildRoundTrips(fills, '2025-11-28' as IstDate);
    const rows = classifyContracts(roundTrips, unclosed, [
      { tradingSymbol: 'NIFTY25NOV24000CE', realizedPnlPaise: 150_001 as Paise, openQuantity: 0 }, // 1 paise of rounding
      { tradingSymbol: 'NIFTY25NOV24100CE', realizedPnlPaise: 70_000 as Paise, openQuantity: 0 }, // Console says less
      { tradingSymbol: 'NIFTY25NOV24300CE', realizedPnlPaise: -375_000 as Paise, openQuantity: 0 }, // expired worthless
      { tradingSymbol: 'NIFTY25NOV24400PE', realizedPnlPaise: 12_000 as Paise, openQuantity: 0 }, // not in the tradebook
      { tradingSymbol: 'NIFTY25NOV24500PE', realizedPnlPaise: 0 as Paise, openQuantity: 75 }, // nothing realised: no row
    ]);
    expect(rows.map((r) => [r.symbol, r.status, r.diffPaise])).toEqual([
      ['NIFTY25NOV24000CE', 'MATCHED', -1],
      ['NIFTY25NOV24100CE', 'DIFFERENT', 5_000],
      ['NIFTY25NOV24200CE', 'ONLY_IN_TRADEBOOK', 7_500],
      ['NIFTY25NOV24300CE', 'EXCLUDED', 375_000],
      ['NIFTY25NOV24400PE', 'ONLY_IN_STATEMENT', -12_000],
    ]);
  });

  it('verify_real_attributes_expired_contract_as_excluded', async () => {
    // AC-0.2.5: an option that expired without a closing trade.
    const tb = [
      ...TRADEBOOK.split('\n'),
      row('NIFTY25N2524000PE', '2025-11-21', 'buy', 75, '40.00', 31, '2025-11-25'),
      row('NIFTY25D3024000CE', '2025-11-27', 'buy', 75, '10.00', 32, '2025-12-30'),
      row('NIFTY25D3024000CE', '2025-11-27', 'sell', 75, '10.00', 33, '2025-12-30'),
    ].join('\n');
    const r = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(tb) },
      { name: 'pnl.xlsx', bytes: await statementWithRows(-1500, 100, [['NIFTY25N2024000CE', 1500, 0], ['NIFTY25N2524000PE', -3000, 0], ['NIFTY25D3024000CE', 0, 0]]) },
    ]);
    const expired = r.detail.contracts.find((c) => c.symbol === 'NIFTY25N2524000PE')!;
    expect(expired).toEqual({ symbol: 'NIFTY25N2524000PE', tradebookPnlPaise: 0, statementPnlPaise: -300_000, diffPaise: 300_000, status: 'EXCLUDED' });
    expect(r.detail.attribution.excludedPaise).toBe(300_000);
  });

  it('verify_real_attribution_adds_up', async () => {
    // AC-0.2.6: netDiff = contractDiff + excluded + statementRowsGap − chargesDiff, exactly.
    const tb = [...TRADEBOOK.split('\n'), row('NIFTY25N2524000PE', '2025-11-21', 'buy', 75, '40.00', 31, '2025-11-25')].join('\n');
    const r = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(tb) },
      // Rows add up to ₹1,400 but the statement's total says ₹1,450: a ₹50 gap.
      { name: 'pnl.xlsx', bytes: await statementWithRows(1450, 70, [['NIFTY25N2024000CE', 1400, 0]]) },
    ]);
    const a = r.detail.attribution;
    expect(a.statementRowsGapPaise).toBe(-5_000);
    expect(a.contractDiffPaise).toBe(10_000);
    expect(a.netDiffPaise).toBe(a.contractDiffPaise + a.excludedPaise + a.statementRowsGapPaise - a.chargesDiffPaise);
  });

  it('verify_real_gate_needs_five_passing_accounts', () => {
    // AC-0.1.4
    const ok = (alias: string): AccountOutcome => ({ alias, check: { netDiffPct: 0.1, grossDiffPct: 0, pass: true } as AccountOutcome['check'] });
    const rates = allPrimary();
    expect(decideGate([1, 2, 3, 4].map((i) => ok(`a${i}`)), rates).pass).toBe(false);
    expect(decideGate([1, 2, 3, 4, 5].map((i) => ok(`a${i}`)), rates).pass).toBe(true);
    const withError = [...[1, 2, 3, 4, 5].map((i) => ok(`a${i}`)), { alias: 'a6', check: null, error: 'no tradebook' }];
    expect(decideGate(withError, rates)).toMatchObject({ pass: false, passedAccounts: 5, accounts: 6 });
  });

  it('verify_real_gate_needs_primary_rates', () => {
    // AC-0.3.4: today's table is checked against secondary sources only.
    const ok = (alias: string): AccountOutcome => ({ alias, check: { netDiffPct: 0.1, grossDiffPct: 0, pass: true } as AccountOutcome['check'] });
    const five = [1, 2, 3, 4, 5].map((i) => ok(`a${i}`));
    const { primary, total } = countPrimaryRates(RATES);
    expect(total).toBeGreaterThan(10);
    expect(primary).toBeLessThan(total);
    const gate = decideGate(five, RATES);
    expect(gate.pass).toBe(false);
    expect(gate.reasons.join(' ')).toContain(`${total - primary} rate rows not checked against a primary source`);
    expect(countPrimaryRates(allPrimary())).toEqual({ primary: total, total });
  });

  it('verify_real_detail_file_is_gitignored', () => {
    // AC-0.2.7
    const patterns = readFileSync(join(__dirname, '../../.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(patterns).toContain('verification-report*.json');
    expect(detailFileName('acct-one')).toMatch(/^verification-report.*\.json$/);
  });

  it('verify_real_writes_contract_detail', async () => {
    // AC-0.2.1
    const dir = mkdtempSync(join(tmpdir(), 'fow-verify-'));
    mkdirSync(join(dir, 'acct-one'));
    writeFileSync(join(dir, 'acct-one', 'tradebook.csv'), TRADEBOOK);
    writeFileSync(join(dir, 'acct-one', 'pnl.xlsx'), Buffer.from(await statementWithRows(1500, 60, [['NIFTY25N2024000CE', 1500, 0]])));
    await main(['--dir', dir], { log: () => {} });
    const detail = JSON.parse(readFileSync(join(dir, detailFileName('acct-one')), 'utf8'));
    expect(detail.alias).toBe('acct-one');
    expect(detail.contracts).toEqual([{ symbol: 'NIFTY25N2024000CE', tradebookPnlPaise: 150_000, statementPnlPaise: 150_000, diffPaise: 0, status: 'MATCHED' }]);
    expect(Object.keys(detail.attribution).sort()).toEqual(['chargesDiffPaise', 'contractDiffPaise', 'excludedPaise', 'netDiffPaise', 'statementRowsGapPaise']);
  });

  it('verify_real_console_shows_no_trade_data', async () => {
    // AC-0.1.5, AC-0.2.8, PV-4
    const dir = mkdtempSync(join(tmpdir(), 'fow-verify-'));
    mkdirSync(join(dir, 'acct-one'));
    writeFileSync(join(dir, 'acct-one', 'tradebook.csv'), TRADEBOOK);
    writeFileSync(join(dir, 'acct-one', 'pnl.xlsx'), Buffer.from(await statementWithRows(1600, 60, [['NIFTY25N2024000CE', 1600, 0]])));
    const lines: string[] = [];
    for (const extra of [[], ['--markdown']]) await main(['--dir', dir, ...extra], { log: (s) => lines.push(s) });
    const out = lines.join('\n');
    expect(out).toContain('acct-one');
    expect(out).toContain(detailFileName('acct-one'));
    expect(out).toMatch(/DIFFERENT 1/);
    for (const secret of ['NIFTY', '24000', '1500', '1,500', '1600', '1,600', '100.00', '120.00']) expect(out).not.toContain(secret);
  });

  it('verify_real_markdown_has_no_amounts', () => {
    // AC-0.5.1
    const outcomes: AccountOutcome[] = [
      { alias: 'acct-one', check: { netDiffPct: 0.12, grossDiffPct: 0, pass: true } as AccountOutcome['check'] },
      { alias: 'acct-two', check: null, error: 'no tradebook found' },
    ];
    const md = formatMarkdown(outcomes, decideGate(outcomes, RATES));
    expect(md).toContain('| Account | Net difference | Gross difference | Result |');
    expect(md).toContain('| acct-one | 0.12% | 0.00% | PASS |');
    expect(md).toContain('| acct-two | – | – | ERROR |');
    expect(md).toContain('Rates checked against primary sources:');
    expect(md).toContain('**NO-GO**');
    expect(md).not.toMatch(/₹|paise|NIFTY/);
  });
});

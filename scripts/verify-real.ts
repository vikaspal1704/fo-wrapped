/**
 * Launch-gate harness (TRD §9, ACCEPTANCE_CRITERIA §A). Local only: it reads
 * real exports that must never enter the repo.
 *
 *   npm run verify:real -- --dir ../fo-wrapped-private
 *   # expects <dir>/<account-alias>/ with Zerodha tradebook(s) + one F&O P&L statement
 *
 * For each account it runs the engine WITHOUT the statement (estimated mode)
 * on the statement's dates, and compares with the statement. It prints only
 * the alias, percentages and PASS/FAIL: never amounts, symbols or trades.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RATES, analyze, readBrokerFile, type ChargesBreakdown, type Fill, type PnlStatement } from '../src/engine';

/** ±0.5% on net P&L (ACCEPTANCE_CRITERIA §A). */
export const TOLERANCE_PCT = 0.5;
export const MIN_ACCOUNTS = 5;
const COMPONENTS = ['brokerage', 'stt', 'exchangeTxn', 'sebi', 'stampDuty', 'gst', 'other'] as const;

export interface AccountCheck {
  /** |estimated − statement| / |statement| × 100. */
  netDiffPct: number;
  grossDiffPct: number;
  /** Per charge head; null when the statement's figure is 0. Report only. */
  componentDiffPct: Record<(typeof COMPONENTS)[number], number | null>;
  pass: boolean;
}

const pct = (estimate: number, truth: number) => (Math.abs(estimate - truth) / Math.max(Math.abs(truth), 1)) * 100;

/** Compares one account's estimate with its P&L statement. */
export async function checkAccount(files: readonly { name: string; bytes: ArrayBuffer }[]): Promise<AccountCheck> {
  const fills: Fill[][] = [];
  const statements: PnlStatement[] = [];
  for (const f of files) {
    const read = await readBrokerFile(f.name, f.bytes);
    if (read.kind === 'pnlStatement') statements.push(read.statement);
    else if (read.broker === 'zerodha') fills.push(read.fills);
  }
  if (statements.length !== 1) throw new Error(`expected exactly one P&L statement, found ${statements.length}`);
  if (fills.length === 0) throw new Error('no Zerodha tradebook found');
  const st = statements[0]!;
  const inPeriod = fills.map((tb) => tb.filter((f) => st.periodFrom <= f.tradeDate && f.tradeDate <= st.periodTo));
  if (inPeriod.every((tb) => tb.length === 0)) throw new Error('the tradebook has no trades in the statement’s period');

  const { totals } = analyze({ tradebooks: inPeriod, rates: RATES, siteUrl: 'https://example.invalid/' });
  if (!totals.charges || totals.netPnlPaise === null) throw new Error('charges could not be estimated for these dates');
  const stNet = st.realizedPnlPaise - st.charges.total;
  const netDiffPct = pct(totals.netPnlPaise, stNet);
  const componentDiffPct = Object.fromEntries(
    COMPONENTS.map((k) => [k, st.charges[k] === 0 ? null : pct((totals.charges as ChargesBreakdown)[k], st.charges[k])]),
  ) as AccountCheck['componentDiffPct'];
  return { netDiffPct, grossDiffPct: pct(totals.grossPnlPaise, st.realizedPnlPaise), componentDiffPct, pass: netDiffPct <= TOLERANCE_PCT };
}

const f2 = (n: number | null) => (n === null ? '–' : `${n.toFixed(2)}%`).padStart(8);
const LABELS: Record<(typeof COMPONENTS)[number], string> = {
  brokerage: 'brokerage',
  stt: 'stt',
  exchangeTxn: 'txn',
  sebi: 'sebi',
  stampDuty: 'stamp',
  gst: 'gst',
  other: 'other',
};

export async function main(args: readonly string[]): Promise<number> {
  const i = args.indexOf('--dir');
  const dir = i >= 0 ? args[i + 1] : undefined;
  if (!dir) {
    console.error('usage: npm run verify:real -- --dir <private dir>');
    return 2;
  }
  const aliases = readdirSync(dir).filter((a) => !a.startsWith('.') && statSync(join(dir, a)).isDirectory()).sort();
  let passed = 0;
  console.log(`${'alias'.padEnd(20)}${['net', 'gross', ...COMPONENTS.map((c) => LABELS[c])].map((h) => h.padStart(10)).join('')}  result`);
  for (const alias of aliases) {
    const files = readdirSync(join(dir, alias))
      .filter((n) => /\.(csv|xlsx)$/i.test(n))
      .map((name) => {
        const b = readFileSync(join(dir, alias, name));
        return { name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
      });
    try {
      const r = await checkAccount(files);
      if (r.pass) passed++;
      const cells = [r.netDiffPct, r.grossDiffPct, ...COMPONENTS.map((c) => r.componentDiffPct[c])].map((v) => f2(v).padStart(10)).join('');
      console.log(`${alias.padEnd(20)}${cells}  ${r.pass ? 'PASS' : 'FAIL'}`);
    } catch (e) {
      // Only the message: engine messages name files and rows, never amounts.
      console.log(`${alias.padEnd(20)} ERROR: ${e instanceof Error ? ((e as { userMessage?: string }).userMessage ?? e.message) : String(e)}`);
    }
  }
  const gate = passed >= MIN_ACCOUNTS && passed === aliases.length;
  console.log(`\nLaunch gate: ${gate ? 'PASS' : 'FAIL'} (${passed} of ${aliases.length} accounts within ±${TOLERANCE_PCT}%; ${MIN_ACCOUNTS} needed)`);
  return gate ? 0 : 1;
}

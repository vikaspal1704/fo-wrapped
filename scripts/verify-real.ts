/**
 * Launch-gate harness (TRD §9, docs/SPEC.md US-0.1 to US-0.5). Local only: it
 * reads real exports that must never enter the repo.
 *
 *   npm run verify:real -- --dir ../fo-wrapped-private [--markdown]
 *   # expects <dir>/<account-alias>/ with Zerodha tradebook(s) + one F&O P&L statement
 *
 * For each account it runs the engine WITHOUT the statement (estimated mode)
 * on the statement's dates and compares with the statement. The console gets
 * only aliases, percentages, counts and PASS/FAIL (PV-4). The per-contract
 * breakdown, which names contracts and amounts, goes to
 * <dir>/verification-report-<alias>.json next to the private exports.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RATES,
  analyze,
  readBrokerFile,
  type ChargeRateTable,
  type ChargesBreakdown,
  type Fill,
  type PnlStatement,
  type RoundTrip,
  type UnclosedPosition,
} from '../src/engine';

/** ±0.5% on net P&L (ACCEPTANCE_CRITERIA §A). */
export const TOLERANCE_PCT = 0.5;
export const MIN_ACCOUNTS = 5;
/** Statement values are rounded to paise on import, so 1 paise either way is a match. */
export const CONTRACT_TOLERANCE_PAISE = 1;
const COMPONENTS = ['brokerage', 'stt', 'exchangeTxn', 'sebi', 'stampDuty', 'gst', 'other'] as const;

export type ContractStatus = 'MATCHED' | 'DIFFERENT' | 'ONLY_IN_TRADEBOOK' | 'ONLY_IN_STATEMENT' | 'EXCLUDED';
export const CONTRACT_STATUSES: readonly ContractStatus[] = ['MATCHED', 'DIFFERENT', 'ONLY_IN_TRADEBOOK', 'ONLY_IN_STATEMENT', 'EXCLUDED'];

export interface ContractRow {
  symbol: string;
  /** Σ gross P&L of the tradebook's closed round trips in this contract. */
  tradebookPnlPaise: number;
  /** The statement's realised P&L for this contract (0 without a row). */
  statementPnlPaise: number;
  /** tradebook − statement. */
  diffPaise: number;
  status: ContractStatus;
}

/** Estimate minus statement, in paise. `netDiffPaise` is exactly the sum of the rest (AC-0.2.6). */
export interface Attribution {
  netDiffPaise: number;
  /** Contracts both sides can value: MATCHED, DIFFERENT, ONLY_IN_*. */
  contractDiffPaise: number;
  /** Contracts the estimate leaves out by design (unclosed in the tradebook). */
  excludedPaise: number;
  /** The statement's contract rows minus its realised total. */
  statementRowsGapPaise: number;
  /** Estimated charges minus the statement's charges (subtracted in the identity). */
  chargesDiffPaise: number;
}

export interface AccountCheck {
  /** |estimated − statement| / |statement| × 100. */
  netDiffPct: number;
  grossDiffPct: number;
  /** Per charge head; null when the statement's figure is 0. Report only. */
  componentDiffPct: Record<(typeof COMPONENTS)[number], number | null>;
  pass: boolean;
  detail: { contracts: ContractRow[]; attribution: Attribution };
}

export interface AccountOutcome {
  alias: string;
  check: AccountCheck | null;
  /** Set when the account could not be checked; counts as not passed. */
  error?: string;
}

export interface GateResult {
  pass: boolean;
  passedAccounts: number;
  accounts: number;
  primaryRates: number;
  totalRates: number;
  /** Why the gate fails, without amounts. */
  reasons: string[];
}

const pct = (estimate: number, truth: number) => (Math.abs(estimate - truth) / Math.max(Math.abs(truth), 1)) * 100;

/**
 * One row per contract in either source (AC-0.2.2 to AC-0.2.5). A statement row
 * with nothing realised and no tradebook trades (an open position) adds no row.
 */
export function classifyContracts(
  roundTrips: readonly RoundTrip[],
  unclosed: readonly UnclosedPosition[],
  perSymbol: PnlStatement['perSymbol'],
): ContractRow[] {
  const tradebook = new Map<string, number>();
  for (const rt of roundTrips) {
    const sym = rt.instrument.tradingSymbol.toUpperCase();
    tradebook.set(sym, (tradebook.get(sym) ?? 0) + rt.grossPnlPaise);
  }
  const excluded = new Set(unclosed.map((u) => u.instrument.tradingSymbol.toUpperCase()));
  const statement = new Map<string, number>();
  for (const r of perSymbol) statement.set(r.tradingSymbol, (statement.get(r.tradingSymbol) ?? 0) + r.realizedPnlPaise);

  const symbols = new Set([...tradebook.keys(), ...excluded]);
  for (const [sym, pnl] of statement) if (pnl !== 0) symbols.add(sym);

  return [...symbols].sort().map((symbol) => {
    const tradebookPnlPaise = tradebook.get(symbol) ?? 0;
    const statementPnlPaise = statement.get(symbol) ?? 0;
    const diffPaise = tradebookPnlPaise - statementPnlPaise;
    return { symbol, tradebookPnlPaise, statementPnlPaise, diffPaise, status: contractStatus(symbol, diffPaise, tradebook, statement, excluded) };
  });
}

function contractStatus(
  symbol: string,
  diffPaise: number,
  tradebook: ReadonlyMap<string, number>,
  statement: ReadonlyMap<string, number>,
  excluded: ReadonlySet<string>,
): ContractStatus {
  if (excluded.has(symbol)) return 'EXCLUDED';
  if (!statement.has(symbol)) return 'ONLY_IN_TRADEBOOK';
  if (!tradebook.has(symbol)) return 'ONLY_IN_STATEMENT';
  return Math.abs(diffPaise) <= CONTRACT_TOLERANCE_PAISE ? 'MATCHED' : 'DIFFERENT';
}

function attribute(
  contracts: readonly ContractRow[],
  statement: PnlStatement,
  estimate: { grossPnlPaise: number; chargesPaise: number },
): Attribution {
  const sum = (rows: readonly ContractRow[]) => rows.reduce((s, r) => s + r.diffPaise, 0);
  const rowsTotal = statement.perSymbol.reduce((s, r) => s + r.realizedPnlPaise, 0);
  const chargesDiffPaise = estimate.chargesPaise - statement.charges.total;
  return {
    netDiffPaise: estimate.grossPnlPaise - estimate.chargesPaise - (statement.realizedPnlPaise - statement.charges.total),
    contractDiffPaise: sum(contracts.filter((r) => r.status !== 'EXCLUDED')),
    excludedPaise: sum(contracts.filter((r) => r.status === 'EXCLUDED')),
    statementRowsGapPaise: rowsTotal - statement.realizedPnlPaise,
    chargesDiffPaise,
  };
}

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

  const { totals, roundTrips, unclosed } = analyze({ tradebooks: inPeriod, rates: RATES, siteUrl: 'https://example.invalid/' });
  if (!totals.charges || totals.netPnlPaise === null) throw new Error('charges could not be estimated for these dates');
  const charges: ChargesBreakdown = totals.charges;
  const stNet = st.realizedPnlPaise - st.charges.total;
  const netDiffPct = pct(totals.netPnlPaise, stNet);
  const componentDiffPct = Object.fromEntries(
    COMPONENTS.map((k) => [k, st.charges[k] === 0 ? null : pct(charges[k], st.charges[k])]),
  ) as AccountCheck['componentDiffPct'];
  const contracts = classifyContracts(roundTrips, unclosed, st.perSymbol);
  return {
    netDiffPct,
    grossDiffPct: pct(totals.grossPnlPaise, st.realizedPnlPaise),
    componentDiffPct,
    pass: netDiffPct <= TOLERANCE_PCT,
    detail: { contracts, attribution: attribute(contracts, st, { grossPnlPaise: totals.grossPnlPaise, chargesPaise: charges.total }) },
  };
}

/** How many rate windows are checked against a primary source (AC-0.3.4). */
export function countPrimaryRates(rates: ChargeRateTable): { primary: number; total: number } {
  let primary = 0;
  let total = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if ('checked' in node && 'effectiveFrom' in node) {
        total++;
        if ((node as { checked: unknown }).checked === 'primary') primary++;
        return;
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(rates);
  return { primary, total };
}

/** Launch only when ≥ 5 accounts ran, every one passed, and every rate is primary-checked (AC-0.1.4, AC-0.3.4). */
export function decideGate(outcomes: readonly AccountOutcome[], rates: ChargeRateTable): GateResult {
  const passedAccounts = outcomes.filter((o) => o.check?.pass === true).length;
  const { primary, total } = countPrimaryRates(rates);
  const reasons: string[] = [];
  if (outcomes.length < MIN_ACCOUNTS) reasons.push(`${outcomes.length} of ${MIN_ACCOUNTS} accounts checked`);
  if (passedAccounts < outcomes.length) reasons.push(`${outcomes.length - passedAccounts} of ${outcomes.length} accounts not within ±${TOLERANCE_PCT}%`);
  if (primary < total) reasons.push(`${total - primary} rate rows not checked against a primary source`);
  return { pass: reasons.length === 0, passedAccounts, accounts: outcomes.length, primaryRates: primary, totalRates: total, reasons };
}

/** The detail file's name; matches the `.gitignore` pattern `verification-report*.json` (AC-0.2.7). */
export function detailFileName(alias: string): string {
  return `verification-report-${alias}.json`;
}

const pctCell = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toFixed(2)}%`);
const resultOf = (o: AccountOutcome) => (o.check === null ? 'ERROR' : o.check.pass ? 'PASS' : 'FAIL');
const ratesLine = (g: GateResult) => `Rates checked against primary sources: ${g.primaryRates} of ${g.totalRates}`;
const gateLine = (g: GateResult) =>
  `Launch gate: ${g.pass ? 'PASS' : 'FAIL'} (${g.passedAccounts} of ${g.accounts} accounts within ±${TOLERANCE_PCT}%; ${MIN_ACCOUNTS} needed)`;

/** Privacy-safe table for docs/validation-report.md (AC-0.5.1). */
export function formatMarkdown(outcomes: readonly AccountOutcome[], gate: GateResult): string {
  return [
    '| Account | Net difference | Gross difference | Result |',
    '|---------|---------------:|-----------------:|--------|',
    ...outcomes.map((o) => `| ${o.alias} | ${pctCell(o.check?.netDiffPct)} | ${pctCell(o.check?.grossDiffPct)} | ${resultOf(o)} |`),
    '',
    ratesLine(gate),
    '',
    `Decision: **${gate.pass ? 'GO' : 'NO-GO'}**${gate.reasons.length ? ` (${gate.reasons.join('; ')})` : ''}`,
  ].join('\n');
}

const LABELS: Record<(typeof COMPONENTS)[number], string> = {
  brokerage: 'brokerage',
  stt: 'stt',
  exchangeTxn: 'txn',
  sebi: 'sebi',
  stampDuty: 'stamp',
  gst: 'gst',
  other: 'other',
};

function readAccountFiles(dir: string, alias: string) {
  return readdirSync(join(dir, alias))
    .filter((n) => /\.(csv|xlsx)$/i.test(n))
    .map((name) => {
      const b = readFileSync(join(dir, alias, name));
      return { name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
    });
}

function statusCounts(contracts: readonly ContractRow[]): string {
  return CONTRACT_STATUSES.map((s) => `${s} ${contracts.filter((c) => c.status === s).length}`).join(', ');
}

export async function main(args: readonly string[], io: { log: (line: string) => void } = { log: console.log }): Promise<number> {
  const i = args.indexOf('--dir');
  const dir = i >= 0 ? args[i + 1] : undefined;
  if (!dir) {
    io.log('usage: npm run verify:real -- --dir <private dir> [--markdown]');
    return 2;
  }
  const aliases = readdirSync(dir).filter((a) => !a.startsWith('.') && statSync(join(dir, a)).isDirectory()).sort();
  const outcomes: AccountOutcome[] = [];
  io.log(`${'alias'.padEnd(20)}${['net', 'gross', ...COMPONENTS.map((c) => LABELS[c])].map((h) => h.padStart(10)).join('')}  result`);
  for (const alias of aliases) {
    try {
      const check = await checkAccount(readAccountFiles(dir, alias));
      outcomes.push({ alias, check });
      const cells = [check.netDiffPct, check.grossDiffPct, ...COMPONENTS.map((c) => check.componentDiffPct[c])].map((v) => pctCell(v).padStart(10)).join('');
      io.log(`${alias.padEnd(20)}${cells}  ${check.pass ? 'PASS' : 'FAIL'}`);
      const file = join(dir, detailFileName(alias));
      writeFileSync(file, JSON.stringify({ alias, ...check.detail }, null, 2));
      io.log(`${''.padEnd(20)}detail: ${file} (${statusCounts(check.detail.contracts)})`);
    } catch (e) {
      // Only the message: engine messages name files and rows, never amounts.
      const error = e instanceof Error ? ((e as { userMessage?: string }).userMessage ?? e.message) : String(e);
      outcomes.push({ alias, check: null, error });
      io.log(`${alias.padEnd(20)} ERROR: ${error}`);
    }
  }
  const gate = decideGate(outcomes, RATES);
  io.log(`\n${ratesLine(gate)}`);
  io.log(gateLine(gate));
  if (args.includes('--markdown')) io.log(`\n${formatMarkdown(outcomes, gate)}`);
  return gate.pass ? 0 : 1;
}

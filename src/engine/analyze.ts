import { calculateCharges } from './charges/calculate';
import type { ChargeRateTable } from './charges/types';
import { computeCards, type CardSet, type Totals } from './cards';
import { samvatLabel } from './config/samvat';
import { ChargesUnavailableError } from './errors';
import { mergeFills } from './merge';
import { inPeriod, periodsFor, previousPeriod, type Period } from './periods';
import { buildRoundTrips } from './roundTrips';
import { istDateOf, istMinuteOfDay } from './time';
import type { Fill, IstDate, Paise, RoundTrip, UnclosedPosition } from './types';

export const ENGINE_VERSION = '0.2.0';

export interface ComparisonRow {
  key: 'netPnl' | 'grossPnl' | 'charges' | 'trades' | 'winRate' | 'revengeTrades' | 'loserHoldMs';
  label: string;
  unit: 'paise' | 'count' | 'ratio' | 'ms';
  /** null when that period doesn't have enough data for the number. */
  current: number | null;
  previous: number | null;
}

export interface Comparison {
  previous: Period;
  rows: ComparisonRow[];
}

/** Cards and totals for one period (ARCHITECTURE §7.2). */
export interface PeriodView {
  period: Period;
  /** Heading for the summary card, e.g. 'Samvat 2082' or 'FY 2025-26'. */
  title: string;
  dateRange: { from: IstDate; to: IstDate };
  roundTripCount: number;
  fillCount: number;
  totals: Totals;
  cards: CardSet;
  warnings: string[];
  /** Against the previous period of the same kind, when it has trades. */
  comparison: Comparison | null;
}

export interface AnalysisResult {
  engineVersion: string;
  rateTableVersion: string;
  dateRange: { from: IstDate; to: IstDate };
  /** e.g. '2081' or '2081–82'; null when outside the Samvat table. */
  samvat: string | null;
  fillCount: number;
  duplicateFillsDropped: number;
  roundTrips: RoundTrip[];
  unclosed: UnclosedPosition[];
  /** The 'all' view's totals, cards and warnings. */
  totals: Totals;
  cards: CardSet;
  warnings: string[];
  /** One view per period that has trades; views[0] is 'all'. */
  views: PeriodView[];
  /** The latest Samvat year with ≥ 10 closed trades, else 'all'. */
  defaultViewId: string;
}

const MIN_TRADES_FOR_DEFAULT_SAMVAT = 10;

/**
 * The whole pipeline from parsed tradebook files to cards (ARCHITECTURE §2).
 * FIFO matching runs once over all data; each period view then takes the
 * round trips that closed in it and the charges of fills traded in it.
 * Pure and deterministic.
 */
export function analyze(input: {
  tradebooks: readonly (readonly Fill[])[];
  rates: ChargeRateTable;
  siteUrl: string;
}): AnalysisResult {
  const { fills, duplicatesDropped } = mergeFills(input.tradebooks);
  if (fills.length === 0) throw new RangeError('analyze() needs at least one fill');

  const dates = fills.map((f) => f.tradeDate);
  const from = dates.reduce((a, b) => (b < a ? b : a));
  const to = dates.reduce((a, b) => (b > a ? b : a));
  const { roundTrips, unclosed } = buildRoundTrips(fills, to);
  const samvat = samvatLabel(roundTrips.length > 0 ? roundTrips.map((r) => r.exitDate) : dates);

  const periods = periodsFor(dates);
  const views = periods.map((period) => buildView(period, { fills, roundTrips, unclosed, samvat, rates: input.rates, siteUrl: input.siteUrl }));
  for (const view of views) {
    const prev = previousPeriod(view.period, periods);
    const prevView = prev && views.find((v) => v.period.id === prev.id);
    view.comparison = prevView && prevView.roundTripCount > 0 && view.roundTripCount > 0 ? compare(view, prevView) : null;
  }

  const all = views[0]!;
  const samvatViews = views.filter((v) => v.period.kind === 'SAMVAT' && v.roundTripCount >= MIN_TRADES_FOR_DEFAULT_SAMVAT);
  const defaultViewId = samvatViews.length > 0 ? samvatViews[0]!.period.id : 'all';

  return {
    engineVersion: ENGINE_VERSION,
    rateTableVersion: input.rates.version,
    dateRange: { from, to },
    samvat,
    fillCount: fills.length,
    duplicateFillsDropped: duplicatesDropped,
    roundTrips,
    unclosed,
    totals: all.totals,
    cards: all.cards,
    warnings: all.warnings,
    views,
    defaultViewId,
  };
}

function buildView(
  period: Period,
  ctx: {
    fills: readonly Fill[];
    roundTrips: readonly RoundTrip[];
    unclosed: readonly UnclosedPosition[];
    samvat: string | null;
    rates: ChargeRateTable;
    siteUrl: string;
  },
): PeriodView {
  const isAll = period.kind === 'ALL';
  const fills = isAll ? ctx.fills : ctx.fills.filter((f) => inPeriod(f.tradeDate, period));
  const roundTrips = isAll ? ctx.roundTrips : ctx.roundTrips.filter((r) => inPeriod(r.exitDate, period));
  const unclosed = isAll ? ctx.unclosed : ctx.unclosed.filter((u) => inPeriod(istDateOf(u.openedAt), period));

  const grossPnlPaise = roundTrips.reduce((s, r) => s + r.grossPnlPaise, 0) as Paise;
  let charges = null;
  let chargesUnavailableReason: string | null = null;
  try {
    charges = fills.length > 0 ? calculateCharges(fills, ctx.rates) : null;
  } catch (e) {
    if (!(e instanceof ChargesUnavailableError)) throw e;
    chargesUnavailableReason = e.userMessage;
  }

  // Charges cover every fill traded in the period, including those of
  // positions excluded from P&L, because they were really paid.
  const totals: Totals = {
    source: 'ESTIMATED',
    grossPnlPaise,
    charges,
    netPnlPaise: charges ? ((grossPnlPaise - charges.total) as Paise) : null,
    chargesUnavailableReason,
    excludedUnclosedCount: unclosed.length,
  };

  const viewDates = fills.map((f) => f.tradeDate);
  const dateRange = {
    from: viewDates.length ? viewDates.reduce((a, b) => (b < a ? b : a)) : period.from,
    to: viewDates.length ? viewDates.reduce((a, b) => (b > a ? b : a)) : period.to,
  };
  const title = isAll ? (ctx.samvat ? `Samvat ${ctx.samvat}` : null) ?? 'All trades' : period.label;
  const samvatOfView = period.kind === 'SAMVAT' ? period.label.replace('Samvat ', '') : isAll ? ctx.samvat : null;
  const cards = computeCards({ roundTrips, fills, totals, samvat: samvatOfView, periodTitle: title, siteUrl: ctx.siteUrl });

  const warnings: string[] = [];
  if (charges) warnings.push('Charges are estimated from published rates.');
  if (chargesUnavailableReason) warnings.push(chargesUnavailableReason);
  const settled = unclosed.filter((u) => u.status === 'SETTLED_AT_EXPIRY').length;
  if (settled > 0) {
    warnings.push(`${settled} position${settled === 1 ? '' : 's'} expired without a closing trade and ${settled === 1 ? 'isn’t' : 'aren’t'} counted in P&L.`);
  }
  const open = unclosed.length - settled;
  if (open > 0) warnings.push(`${open} position${open === 1 ? ' is' : 's are'} still open and not counted in P&L.`);
  const outOfSession = fills.filter((f) => {
    const m = istMinuteOfDay(f.executedAt);
    return m < 9 * 60 + 15 || m > 15 * 60 + 30;
  }).length;
  if (outOfSession > 0) {
    warnings.push(`${outOfSession} fill${outOfSession === 1 ? ' was' : 's were'} outside 09:15–15:30 and placed in the nearest time slot.`);
  }
  if (!isAll) warnings.push('Trades count in the period they closed; charges count in the period they were paid.');

  return { period, title, dateRange, roundTripCount: roundTrips.length, fillCount: fills.length, totals, cards, warnings, comparison: null };
}

/** Facts only: each number for this period and the previous one. */
function compare(current: PeriodView, previous: PeriodView): Comparison {
  const row = (key: ComparisonRow['key'], label: string, unit: ComparisonRow['unit'], get: (v: PeriodView) => number | null): ComparisonRow => ({
    key,
    label,
    unit,
    current: get(current),
    previous: get(previous),
  });
  const ok = <T>(c: { status: string; data?: T }) => (c.status === 'OK' ? (c.data as T) : null);
  const bothNet = current.totals.netPnlPaise !== null && previous.totals.netPnlPaise !== null;
  return {
    previous: previous.period,
    rows: [
      bothNet
        ? row('netPnl', 'Net P&L', 'paise', (v) => v.totals.netPnlPaise)
        : row('grossPnl', 'P&L before charges', 'paise', (v) => v.totals.grossPnlPaise),
      row('charges', 'Charges', 'paise', (v) => v.totals.charges?.total ?? null),
      row('trades', 'Trades', 'count', (v) => v.roundTripCount),
      row('winRate', 'Win rate', 'ratio', (v) => ok<{ winRate: number }>(v.cards.rightButBroke)?.winRate ?? null),
      row('revengeTrades', 'Revenge trades', 'count', (v) => ok<{ count: number }>(v.cards.revengeTrades)?.count ?? null),
      row('loserHoldMs', 'Median time holding losers', 'ms', (v) => ok<{ medianLoserMs: number }>(v.cards.holdingTime)?.medianLoserMs ?? null),
    ],
  };
}


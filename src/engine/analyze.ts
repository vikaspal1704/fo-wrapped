import { calculateCharges } from './charges/calculate';
import { m } from './i18n';
import type { ChargeRateTable, ChargesBreakdown } from './charges/types';
import { prepareDateOnlyFills } from './dateOnly';
import { computeCards, type CardSet, type Totals } from './cards';
import { samvatLabel } from './config/samvat';
import { ChargesUnavailableError } from './errors';
import { mergeFills } from './merge';
import { inPeriod, periodsFor, previousPeriod, type Period } from './periods';
import { buildRoundTrips } from './roundTrips';
import { istDateOf, istMinuteOfDay } from './time';
import type { BrokerId, Fill, IstDate, Paise, RoundTrip, UnclosedPosition } from './types';

export const ENGINE_VERSION = '0.2.0';

/** Charges a broker's own file reports, for one day (Angel One, Dhan). */
export interface ChargeRecord {
  broker: BrokerId;
  date: IstDate;
  charges: ChargesBreakdown;
}

/** A broker whose export carries its own charges; its fills are never estimated. */
export interface ReportedCharges {
  broker: BrokerId;
  records: ChargeRecord[];
}

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
  /** Brokers whose files report their own charges (docs/BROKERS.md). */
  reportedCharges?: readonly ReportedCharges[];
  rates: ChargeRateTable;
  siteUrl: string;
}): AnalysisResult {
  const merged = mergeFills(input.tradebooks);
  const duplicatesDropped = merged.duplicatesDropped;
  const fills = mergeFills([prepareDateOnlyFills(merged.fills)]).fills;
  if (fills.length === 0) throw new RangeError('analyze() needs at least one fill');

  const dates = fills.map((f) => f.tradeDate);
  const from = dates.reduce((a, b) => (b < a ? b : a));
  const to = dates.reduce((a, b) => (b > a ? b : a));
  const { roundTrips, unclosed } = buildRoundTrips(fills, to);
  const samvat = samvatLabel(roundTrips.length > 0 ? roundTrips.map((r) => r.exitDate) : dates);

  const periods = periodsFor(dates);
  const reported = input.reportedCharges ?? [];
  const views = periods.map((period) =>
    buildView(period, { fills, roundTrips, unclosed, samvat, reported, rates: input.rates, siteUrl: input.siteUrl }),
  );
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
    fillCount: merged.fills.length,
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
    reported: readonly ReportedCharges[];
    rates: ChargeRateTable;
    siteUrl: string;
  },
): PeriodView {
  const isAll = period.kind === 'ALL';
  const fills = isAll ? ctx.fills : ctx.fills.filter((f) => inPeriod(f.tradeDate, period));
  const roundTrips = isAll ? ctx.roundTrips : ctx.roundTrips.filter((r) => inPeriod(r.exitDate, period));
  const unclosed = isAll ? ctx.unclosed : ctx.unclosed.filter((u) => inPeriod(istDateOf(u.openedAt), period));

  const grossPnlPaise = roundTrips.reduce((s, r) => s + r.grossPnlPaise, 0) as Paise;

  // Charges cover every fill traded in the period, including those of
  // positions excluded from P&L, because they were really paid. Brokers whose
  // files report charges use those; the rest are estimated.
  const reportingBrokers = new Set(ctx.reported.map((r) => r.broker));
  const toEstimate = fills.filter((f) => !reportingBrokers.has(f.broker));
  const reportedParts = ctx.reported
    .flatMap((r) => r.records)
    .filter((rec) => isAll || inPeriod(rec.date, period))
    .map((rec) => rec.charges);
  const hasReported = fills.some((f) => reportingBrokers.has(f.broker));
  let charges: ChargesBreakdown | null = null;
  let chargesUnavailableReason: string | null = null;
  try {
    const parts = [...reportedParts, ...(toEstimate.length > 0 ? [calculateCharges(toEstimate, ctx.rates)] : [])];
    charges = parts.length > 0 ? sumCharges(parts) : null;
  } catch (e) {
    if (!(e instanceof ChargesUnavailableError)) throw e;
    chargesUnavailableReason = e.userMessage;
  }
  const source: Totals['source'] = !hasReported ? 'ESTIMATED' : toEstimate.length === 0 ? 'BROKER' : 'MIXED';

  const totals: Totals = {
    source,
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
  const title = isAll ? (ctx.samvat ? m().samvat(ctx.samvat) : m().allTrades) : period.label;
  const samvatOfView = period.kind === 'SAMVAT' ? period.id.replace('samvat-', '') : isAll ? ctx.samvat : null;
  const cards = computeCards({
    roundTrips,
    fills,
    totals,
    samvat: samvatOfView,
    periodTitle: title,
    indexUnderlyings: ctx.rates.indexUnderlyings,
    siteUrl: ctx.siteUrl,
  });

  const warnings: string[] = [];
  const t = m();
  if (charges) warnings.push(source === 'BROKER' ? t.chargesFromBroker : source === 'MIXED' ? t.chargesMixed : t.chargesEstimated);
  if (roundTrips.some((r) => r.timePrecision === 'date')) warnings.push(t.noTimesWarning);
  if (chargesUnavailableReason) warnings.push(chargesUnavailableReason);
  const settled = unclosed.filter((u) => u.status === 'SETTLED_AT_EXPIRY').length;
  if (settled > 0) {
    warnings.push(t.settledExcluded(settled));
  }
  const open = unclosed.length - settled;
  if (open > 0) warnings.push(t.openExcluded(open));
  const outOfSession = fills.filter((f) => {
    const m = istMinuteOfDay(f.executedAt);
    return m < 9 * 60 + 15 || m > 15 * 60 + 30;
  }).length;
  if (outOfSession > 0) {
    warnings.push(t.outOfSession(outOfSession));
  }
  if (!isAll) warnings.push(t.periodNote);

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
        ? row('netPnl', m().cNetPnl, 'paise', (v) => v.totals.netPnlPaise)
        : row('grossPnl', m().cGrossPnl, 'paise', (v) => v.totals.grossPnlPaise),
      row('charges', m().cCharges, 'paise', (v) => v.totals.charges?.total ?? null),
      row('trades', m().cTrades, 'count', (v) => v.roundTripCount),
      row('winRate', m().cWinRate, 'ratio', (v) => ok<{ winRate: number }>(v.cards.rightButBroke)?.winRate ?? null),
      row('revengeTrades', m().cRevenge, 'count', (v) => ok<{ count: number }>(v.cards.revengeTrades)?.count ?? null),
      row('loserHoldMs', m().cLoserHold, 'ms', (v) => ok<{ medianLoserMs: number }>(v.cards.holdingTime)?.medianLoserMs ?? null),
    ],
  };
}


function sumCharges(parts: readonly ChargesBreakdown[]): ChargesBreakdown {
  const keys = ['brokerage', 'stt', 'exchangeTxn', 'sebi', 'stampDuty', 'gst', 'other', 'total'] as const;
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
  for (const p of parts) for (const k of keys) out[k] += p[k];
  return out as ChargesBreakdown;
}

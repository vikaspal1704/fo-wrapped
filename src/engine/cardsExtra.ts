import type { CardResult, Totals } from './cards';
import { median } from './stats';
import type { Exchange, IstDate, Paise, RoundTrip } from './types';

/** The six cards added in roadmap phase Next (ARCHITECTURE §7.3). */
export interface ExtraCards {
  buyerVsSeller: CardResult<{ buyerPnlPaise: Paise; buyerTrades: number; sellerPnlPaise: Paise; sellerTrades: number }>;
  underlyings: CardResult<{
    best: UnderlyingStat;
    worst: UnderlyingStat;
    split: { indexPnlPaise: Paise; indexTrades: number; stockPnlPaise: Paise; stockTrades: number } | null;
  }>;
  busyDays: CardResult<{ busyThreshold: number; busyDays: number; busyAvgPnlPaise: number; otherDays: number; otherAvgPnlPaise: number }>;
  weekday: CardResult<{ days: WeekdayStat[]; best: WeekdayStat | null; worst: WeekdayStat | null }>;
  positionSize: CardResult<{
    medianEntryValuePaise: number;
    big: SizeGroup;
    small: SizeGroup;
  }>;
  chargesDrag: CardResult<{ chargesPaise: Paise; avgWinPaise: number; winsToCover: number; chargesPerTradePaise: number }>;
}

export interface UnderlyingStat {
  underlying: string;
  trades: number;
  pnlPaise: Paise;
}
export interface WeekdayStat {
  weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  trades: number;
  pnlPaise: Paise;
}
export interface SizeGroup {
  trades: number;
  avgPnlPaise: number;
  winRate: number;
}

export const EXTRA_THRESHOLDS = {
  minOptionTrades: 5,
  minUnderlyings: 2,
  minTradingDays: 8,
  minTradesWeekday: 10,
  minWeekdays: 3,
  minTradesPerWeekday: 3,
  minTradesSize: 10,
} as const;

const BEFORE_CHARGES = 'Before charges.';
const WEEKDAYS: WeekdayStat['weekday'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const insufficient = (reason: string) => ({ status: 'INSUFFICIENT_DATA' as const, reason });
const ok = <T>(data: T, notes: string[] = []) => ({ status: 'OK' as const, data, notes });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function computeExtraCards(input: {
  roundTrips: readonly RoundTrip[];
  totals: Totals;
  indexUnderlyings: Record<Exchange, readonly string[]>;
}): ExtraCards {
  const rts = input.roundTrips;
  return {
    buyerVsSeller: buyerVsSeller(rts),
    underlyings: underlyings(rts, input.indexUnderlyings),
    busyDays: busyDays(rts),
    weekday: weekday(rts),
    positionSize: positionSize(rts),
    chargesDrag: chargesDrag(rts, input.totals),
  };
}

function buyerVsSeller(rts: readonly RoundTrip[]): ExtraCards['buyerVsSeller'] {
  const options = rts.filter((r) => r.instrument.kind !== 'FUT');
  if (options.length < EXTRA_THRESHOLDS.minOptionTrades) {
    return insufficient(`Needs at least ${EXTRA_THRESHOLDS.minOptionTrades} closed option trades.`);
  }
  const bought = options.filter((r) => r.side === 'LONG');
  const sold = options.filter((r) => r.side === 'SHORT');
  if (bought.length === 0 || sold.length === 0) {
    return insufficient(bought.length === 0 ? 'All your option trades started with a sell.' : 'All your option trades started with a buy.');
  }
  return ok(
    {
      buyerPnlPaise: sum(bought.map((r) => r.grossPnlPaise)) as Paise,
      buyerTrades: bought.length,
      sellerPnlPaise: sum(sold.map((r) => r.grossPnlPaise)) as Paise,
      sellerTrades: sold.length,
    },
    [BEFORE_CHARGES, 'Options only. A trade counts as selling if it opened with a sell.'],
  );
}

function underlyings(rts: readonly RoundTrip[], index: Record<Exchange, readonly string[]>): ExtraCards['underlyings'] {
  const groups = new Map<string, UnderlyingStat>();
  for (const r of rts) {
    const g = groups.get(r.instrument.underlying) ?? { underlying: r.instrument.underlying, trades: 0, pnlPaise: 0 as Paise };
    g.trades++;
    g.pnlPaise = (g.pnlPaise + r.grossPnlPaise) as Paise;
    groups.set(g.underlying, g);
  }
  if (groups.size < EXTRA_THRESHOLDS.minUnderlyings) return insufficient('You traded only one underlying.');
  // Ties → alphabetical, for determinism.
  const sorted = [...groups.values()].sort((a, b) => b.pnlPaise - a.pnlPaise || (a.underlying < b.underlying ? -1 : 1));
  const isIndex = (r: RoundTrip) => index[r.instrument.key.startsWith('BSE:') ? 'BSE' : 'NSE'].includes(r.instrument.underlying);
  const idx = rts.filter(isIndex);
  const stock = rts.filter((r) => !isIndex(r));
  return ok(
    {
      best: sorted[0]!,
      worst: sorted[sorted.length - 1]!,
      split:
        idx.length > 0 && stock.length > 0
          ? {
              indexPnlPaise: sum(idx.map((r) => r.grossPnlPaise)) as Paise,
              indexTrades: idx.length,
              stockPnlPaise: sum(stock.map((r) => r.grossPnlPaise)) as Paise,
              stockTrades: stock.length,
            }
          : null,
    },
    [BEFORE_CHARGES],
  );
}

function busyDays(rts: readonly RoundTrip[]): ExtraCards['busyDays'] {
  const days = new Map<IstDate, { trades: number; pnl: number }>();
  for (const r of rts) {
    const d = days.get(r.exitDate) ?? { trades: 0, pnl: 0 };
    d.trades++;
    d.pnl += r.grossPnlPaise;
    days.set(r.exitDate, d);
  }
  if (days.size < EXTRA_THRESHOLDS.minTradingDays) return insufficient(`Needs trades on at least ${EXTRA_THRESHOLDS.minTradingDays} different days.`);
  const threshold = median([...days.values()].map((d) => d.trades));
  const busy = [...days.values()].filter((d) => d.trades > threshold);
  const other = [...days.values()].filter((d) => d.trades <= threshold);
  if (busy.length === 0) return insufficient('You traded about the same number of times every day.');
  return ok(
    {
      busyThreshold: threshold,
      busyDays: busy.length,
      busyAvgPnlPaise: sum(busy.map((d) => d.pnl)) / busy.length,
      otherDays: other.length,
      otherAvgPnlPaise: sum(other.map((d) => d.pnl)) / other.length,
    },
    [BEFORE_CHARGES, `A busy day has more than ${threshold} closed trade${threshold === 1 ? '' : 's'} (your median day).`],
  );
}

function weekday(rts: readonly RoundTrip[]): ExtraCards['weekday'] {
  const stats = new Map<WeekdayStat['weekday'], WeekdayStat>();
  for (const r of rts) {
    const wd = WEEKDAYS[new Date(`${r.exitDate}T00:00:00Z`).getUTCDay()]!;
    const s = stats.get(wd) ?? { weekday: wd, trades: 0, pnlPaise: 0 as Paise };
    s.trades++;
    s.pnlPaise = (s.pnlPaise + r.grossPnlPaise) as Paise;
    stats.set(wd, s);
  }
  if (rts.length < EXTRA_THRESHOLDS.minTradesWeekday || stats.size < EXTRA_THRESHOLDS.minWeekdays) {
    return insufficient(`Needs at least ${EXTRA_THRESHOLDS.minTradesWeekday} trades across ${EXTRA_THRESHOLDS.minWeekdays} weekdays.`);
  }
  const days = WEEKDAYS.map((w) => stats.get(w)).filter((s): s is WeekdayStat => !!s);
  const eligible = days.filter((d) => d.trades >= EXTRA_THRESHOLDS.minTradesPerWeekday);
  // Ties → earlier weekday (days are in week order).
  let best: WeekdayStat | null = null;
  let worst: WeekdayStat | null = null;
  for (const d of eligible) {
    if (!best || d.pnlPaise > best.pnlPaise) best = d;
    if (!worst || d.pnlPaise < worst.pnlPaise) worst = d;
  }
  return ok({ days, best, worst }, [
    BEFORE_CHARGES,
    'Each trade counts on the day it closed.',
    `Best and worst days need at least ${EXTRA_THRESHOLDS.minTradesPerWeekday} trades.`,
  ]);
}

function positionSize(rts: readonly RoundTrip[]): ExtraCards['positionSize'] {
  if (rts.length < EXTRA_THRESHOLDS.minTradesSize) return insufficient(`Needs at least ${EXTRA_THRESHOLDS.minTradesSize} closed trades.`);
  const value = (r: RoundTrip) => Math.round(r.qty * r.avgEntryPaise);
  const m = median(rts.map(value));
  const group = (xs: readonly RoundTrip[]): SizeGroup => {
    const wins = xs.filter((r) => r.grossPnlPaise > 0).length;
    const losses = xs.filter((r) => r.grossPnlPaise < 0).length;
    return {
      trades: xs.length,
      avgPnlPaise: sum(xs.map((r) => r.grossPnlPaise)) / xs.length,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    };
  };
  const big = rts.filter((r) => value(r) > m);
  const small = rts.filter((r) => value(r) <= m);
  if (big.length === 0) return insufficient('Your positions were all about the same size.');
  return ok({ medianEntryValuePaise: m, big: group(big), small: group(small) }, [
    BEFORE_CHARGES,
    'Size is the value at entry (quantity × average entry price). Bigger means above your median.',
  ]);
}

function chargesDrag(rts: readonly RoundTrip[], totals: Totals): ExtraCards['chargesDrag'] {
  if (!totals.charges) return insufficient(totals.chargesUnavailableReason ?? 'Charges unavailable.');
  const wins = rts.filter((r) => r.grossPnlPaise > 0);
  if (wins.length === 0 || rts.length === 0) return insufficient('Needs at least one winning trade.');
  const avgWin = sum(wins.map((r) => r.grossPnlPaise)) / wins.length;
  return ok(
    {
      chargesPaise: totals.charges.total,
      avgWinPaise: avgWin,
      winsToCover: totals.charges.total / avgWin,
      chargesPerTradePaise: totals.charges.total / rts.length,
    },
    ['Charges are estimated from published rates.'],
  );
}

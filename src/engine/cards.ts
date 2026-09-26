import type { ChargesBreakdown } from './charges/types';
import { m } from './i18n';
import { computeExtraCards, type ExtraCards } from './cardsExtra';
import { formatInr, formatPct } from './format';
import { median } from './stats';
import { withTimes } from './capabilities';
import { istMinuteOfDay } from './time';

export { median };
import type { EpochMs, Exchange, Fill, IstDate, Paise, RoundTrip } from './types';

export type CardResult<T> =
  | { status: 'OK'; data: T; notes: string[] }
  | { status: 'INSUFFICIENT_DATA'; reason: string; code?: 'NO_TRADE_TIMES' };

export interface ClockBucket {
  /** Minutes since IST midnight at which the bucket starts. */
  startMinuteIst: number;
  trades: number;
  pnlPaise: Paise;
}

export interface Headline {
  label: string;
  value: string;
}

export interface Totals {
  /** Where the charges come from: published rates, the broker's own file, or both. */
  source: 'ESTIMATED' | 'BROKER' | 'PNL_STATEMENT' | 'MIXED';
  grossPnlPaise: Paise;
  /** null when charges can't be estimated for some trade dates. */
  charges: ChargesBreakdown | null;
  netPnlPaise: Paise | null;
  chargesUnavailableReason: string | null;
  excludedUnclosedCount: number;
}

export interface CardSet extends ExtraCards {
  theNumber: CardResult<{ netPnlPaise: Paise; totalTrades: number; tradedValuePaise: Paise; estimated: boolean }>;
  whereMoneyWent: CardResult<{ grossPnlPaise: Paise; chargesPaise: Paise; chargesPctOfGrossProfit: number | null; estimated: boolean }>;
  rightButBroke: CardResult<{ winRate: number; avgWinPaise: number; avgLossPaise: number; wins: number; losses: number }>;
  expiryDay: CardResult<{ expiryPnlPaise: Paise; expiryTrades: number; otherPnlPaise: Paise; otherTrades: number }>;
  yourClock: CardResult<{ buckets: ClockBucket[]; bestIndex: number | null; worstIndex: number | null }>;
  revengeTrades: CardResult<{ count: number; combinedPnlPaise: Paise; medianLossPaise: Paise; triggers: number }>;
  holdingTime: CardResult<{ medianWinnerMs: number; medianLoserMs: number; winners: number; losers: number }>;
  bestWorstDay: CardResult<{ best: { date: IstDate; pnlPaise: Paise }; worst: { date: IstDate; pnlPaise: Paise } }>;
  summary: {
    headlines: [Headline, Headline, Headline];
    /** Every available headline (≥ 3), default ones first; the user may pick any 3 (ROADMAP X6). */
    headlineOptions: Headline[];
    samvat: string | null;
    periodTitle: string;
    siteUrl: string;
  };
}

/** Card thresholds (ARCHITECTURE §7). */
export const THRESHOLDS = {
  minTradesWinRate: 10,
  minTradesClock: 20,
  minTradesPerClockSlot: 5,
  minLossesRevenge: 5,
  minEachHolding: 3,
  revengeWindowMs: 15 * 60_000,
} as const;

const SESSION_START_MIN = 9 * 60 + 15;
export const CLOCK_BUCKETS = 25;

const insufficient = (reason: string) => ({ status: 'INSUFFICIENT_DATA' as const, reason });
const ok = <T>(data: T, notes: string[] = []) => ({ status: 'OK' as const, data, notes });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const isWin = (rt: RoundTrip) => rt.grossPnlPaise > 0;
const isLoss = (rt: RoundTrip) => rt.grossPnlPaise < 0;

export function computeCards(input: {
  roundTrips: readonly RoundTrip[];
  fills: readonly Fill[];
  totals: Totals;
  samvat: string | null;
  /** Summary heading for this period, e.g. 'Samvat 2082' or 'FY 2025-26'. */
  periodTitle?: string;
  /** Underlyings charged at index rates; used by the underlyings card. */
  indexUnderlyings?: Record<Exchange, readonly string[]>;
  siteUrl: string;
}): CardSet {
  const { roundTrips: rts, fills, totals } = input;
  const estimatedNotes = [
    totals.source === 'BROKER'
      ? m().chargesFromBroker
      : totals.source === 'PNL_STATEMENT'
        ? m().chargesFromStatement
        : totals.source === 'MIXED'
          ? m().chargesMixed
          : fills.some((f) => f.broker === 'zerodha')
            ? m().chargesEstimatedAddStatement
            : m().chargesEstimated,
    ...(totals.excludedUnclosedCount > 0 ? [m().excludedPositions(totals.excludedUnclosedCount)] : []),
  ];
  const noTrades = m().noClosedTrades;

  const theNumber: CardSet['theNumber'] =
    rts.length === 0
      ? insufficient(noTrades)
      : totals.netPnlPaise === null
        ? insufficient(totals.chargesUnavailableReason ?? m().chargesUnavailable)
        : ok(
            {
              netPnlPaise: totals.netPnlPaise,
              totalTrades: rts.length,
              tradedValuePaise: sum(fills.map((f) => f.valuePaise)) as Paise,
              estimated: totals.source === 'ESTIMATED' || totals.source === 'MIXED',
            },
            estimatedNotes,
          );

  const whereMoneyWent: CardSet['whereMoneyWent'] =
    rts.length === 0
      ? insufficient(noTrades)
      : totals.charges === null
        ? insufficient(totals.chargesUnavailableReason ?? m().chargesUnavailable)
        : ok(
            {
              grossPnlPaise: totals.grossPnlPaise,
              chargesPaise: totals.charges.total,
              chargesPctOfGrossProfit:
                totals.grossPnlPaise > 0 ? (totals.charges.total / totals.grossPnlPaise) * 100 : null,
              estimated: totals.source === 'ESTIMATED' || totals.source === 'MIXED',
            },
            estimatedNotes,
          );

  const daysTraded = new Set(fills.map((f) => f.tradeDate)).size;
  // Every honest stat, in default order; the first 3 are the default headlines (PRD D-13).
  const headlineOptions = headlines(theNumber, whereMoneyWent, rightButBrokeCard(rts), totals, rts.length, daysTraded);

  return {
    ...computeExtraCards({ roundTrips: rts, totals, indexUnderlyings: input.indexUnderlyings ?? { NSE: [], BSE: [] } }),
    theNumber,
    whereMoneyWent,
    rightButBroke: rightButBrokeCard(rts),
    expiryDay: expiryDayCard(rts),
    yourClock: withTimes(rts, clockCard),
    revengeTrades: withTimes(rts, revengeCard),
    holdingTime: withTimes(rts, holdingCard),
    bestWorstDay: bestWorstDayCard(rts),
    summary: {
      headlines: [headlineOptions[0]!, headlineOptions[1]!, headlineOptions[2]!],
      headlineOptions,
      samvat: input.samvat,
      periodTitle: input.periodTitle ?? (input.samvat ? m().samvat(input.samvat) : m().allTrades),
      siteUrl: input.siteUrl,
    },
  };
}

function rightButBrokeCard(rts: readonly RoundTrip[]): CardSet['rightButBroke'] {
  const wins = rts.filter(isWin);
  const losses = rts.filter(isLoss);
  if (rts.length < THRESHOLDS.minTradesWinRate || wins.length === 0 || losses.length === 0) {
    return insufficient(m().needsWinsAndLosses(THRESHOLDS.minTradesWinRate));
  }
  return ok(
    {
      winRate: wins.length / (wins.length + losses.length),
      avgWinPaise: sum(wins.map((r) => r.grossPnlPaise)) / wins.length,
      avgLossPaise: sum(losses.map((r) => -r.grossPnlPaise)) / losses.length,
      wins: wins.length,
      losses: losses.length,
    },
    [m().beforeCharges, m().scratchNote],
  );
}

function expiryDayCard(rts: readonly RoundTrip[]): CardSet['expiryDay'] {
  const onExpiry = rts.filter((r) => r.exitDate === r.instrument.expiry);
  const other = rts.filter((r) => r.exitDate !== r.instrument.expiry);
  if (onExpiry.length === 0 || other.length === 0) {
    return insufficient(
      onExpiry.length === 0 ? m().noExpiryTrades : m().allExpiryTrades,
    );
  }
  return ok(
    {
      expiryPnlPaise: sum(onExpiry.map((r) => r.grossPnlPaise)) as Paise,
      expiryTrades: onExpiry.length,
      otherPnlPaise: sum(other.map((r) => r.grossPnlPaise)) as Paise,
      otherTrades: other.length,
    },
    [m().beforeCharges, m().expiryNote],
  );
}

export function clockBucketOf(at: EpochMs): number {
  const i = Math.floor((istMinuteOfDay(at) - SESSION_START_MIN) / 15);
  return Math.min(CLOCK_BUCKETS - 1, Math.max(0, i));
}

function clockCard(rts: readonly RoundTrip[]): CardSet['yourClock'] {
  if (rts.length < THRESHOLDS.minTradesClock) {
    return insufficient(m().needsClosedTrades(THRESHOLDS.minTradesClock));
  }
  const buckets: ClockBucket[] = Array.from({ length: CLOCK_BUCKETS }, (_, i) => ({
    startMinuteIst: SESSION_START_MIN + i * 15,
    trades: 0,
    pnlPaise: 0 as Paise,
  }));
  for (const rt of rts) {
    const b = buckets[clockBucketOf(rt.entryAt)]!;
    b.trades++;
    b.pnlPaise = (b.pnlPaise + rt.grossPnlPaise) as Paise;
  }
  let bestIndex: number | null = null;
  let worstIndex: number | null = null;
  buckets.forEach((b, i) => {
    if (b.trades < THRESHOLDS.minTradesPerClockSlot) return;
    if (bestIndex === null || b.pnlPaise > buckets[bestIndex]!.pnlPaise) bestIndex = i;
    if (worstIndex === null || b.pnlPaise < buckets[worstIndex]!.pnlPaise) worstIndex = i;
  });
  return ok({ buckets, bestIndex, worstIndex }, [
    m().beforeCharges,
    m().clockEntryNote,
    m().clockMinNote(THRESHOLDS.minTradesPerClockSlot),
  ]);
}

function revengeCard(rts: readonly RoundTrip[]): CardSet['revengeTrades'] {
  const losses = rts.filter(isLoss);
  if (losses.length < THRESHOLDS.minLossesRevenge) {
    return insufficient(m().needsLosses(THRESHOLDS.minLossesRevenge));
  }
  const medianLoss = median(losses.map((r) => -r.grossPnlPaise));
  const triggers = losses.filter((r) => -r.grossPnlPaise > medianLoss);

  const byEntry = [...rts].sort((a, b) => a.entryAt - b.entryAt);
  const revenge = new Set<number>();
  for (const t of triggers) {
    // First trade entered strictly after the loss closed; scan up to +15 min.
    let i = firstIndexAfter(byEntry, t.exitAt);
    for (; i < byEntry.length && byEntry[i]!.entryAt <= t.exitAt + THRESHOLDS.revengeWindowMs; i++) {
      revenge.add(byEntry[i]!.id);
    }
  }
  const combined = sum(rts.filter((r) => revenge.has(r.id)).map((r) => r.grossPnlPaise));
  return ok(
    { count: revenge.size, combinedPnlPaise: combined as Paise, medianLossPaise: medianLoss as Paise, triggers: triggers.length },
    [m().beforeCharges, m().revengeNote(medianLoss)],
  );
}

function firstIndexAfter(sorted: readonly RoundTrip[], at: EpochMs): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.entryAt <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function holdingCard(rts: readonly RoundTrip[]): CardSet['holdingTime'] {
  const wins = rts.filter(isWin);
  const losses = rts.filter(isLoss);
  if (wins.length < THRESHOLDS.minEachHolding || losses.length < THRESHOLDS.minEachHolding) {
    return insufficient(m().needsWinnersAndLosers(THRESHOLDS.minEachHolding));
  }
  return ok(
    {
      medianWinnerMs: median(wins.map((r) => r.holdingMs)),
      medianLoserMs: median(losses.map((r) => r.holdingMs)),
      winners: wins.length,
      losers: losses.length,
    },
    [m().holdingNote],
  );
}

function bestWorstDayCard(rts: readonly RoundTrip[]): CardSet['bestWorstDay'] {
  const byDay = new Map<IstDate, number>();
  for (const r of rts) byDay.set(r.exitDate, (byDay.get(r.exitDate) ?? 0) + r.grossPnlPaise);
  if (byDay.size < 2) return insufficient(m().needsTwoDays);
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  let best = days[0]!;
  let worst = days[0]!;
  for (const d of days) {
    if (d[1] > best[1]) best = d;
    if (d[1] < worst[1]) worst = d;
  }
  return ok(
    {
      best: { date: best[0], pnlPaise: best[1] as Paise },
      worst: { date: worst[0], pnlPaise: worst[1] as Paise },
    },
    [m().beforeCharges, m().dayCloseNote],
  );
}

/** PRD D-13: Net P&L, Charges paid, Win rate; falls back to other honest stats. */
function headlines(
  theNumber: CardSet['theNumber'],
  money: CardSet['whereMoneyWent'],
  winRate: CardSet['rightButBroke'],
  totals: Totals,
  trades: number,
  daysTraded: number,
): Headline[] {
  const candidates: Headline[] = [];
  const t = m();
  if (theNumber.status === 'OK') candidates.push({ label: t.hNetPnl, value: formatInr(theNumber.data.netPnlPaise) });
  else candidates.push({ label: t.hGrossPnl, value: formatInr(totals.grossPnlPaise) });
  if (money.status === 'OK') candidates.push({ label: t.hCharges, value: formatInr(money.data.chargesPaise) });
  if (winRate.status === 'OK') candidates.push({ label: t.hWinRate, value: formatPct(winRate.data.winRate) });
  candidates.push({ label: t.hTrades, value: String(trades) });
  if (theNumber.status === 'OK') candidates.push({ label: t.hTradedValue, value: formatInr(theNumber.data.tradedValuePaise) });
  candidates.push({ label: t.hGrossPnl, value: formatInr(totals.grossPnlPaise) });
  candidates.push({ label: t.hDaysTraded, value: String(daysTraded) });
  const unique = candidates.filter((h, i) => candidates.findIndex((x) => x.label === h.label) === i);
  return unique;
}

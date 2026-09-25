import type { ChargesBreakdown } from './charges/types';
import { formatInr, formatPct } from './format';
import { istMinuteOfDay } from './time';
import type { EpochMs, Fill, IstDate, Paise, RoundTrip } from './types';

export type CardResult<T> =
  | { status: 'OK'; data: T; notes: string[] }
  | { status: 'INSUFFICIENT_DATA'; reason: string };

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
  source: 'ESTIMATED';
  grossPnlPaise: Paise;
  /** null when charges can't be estimated for some trade dates. */
  charges: ChargesBreakdown | null;
  netPnlPaise: Paise | null;
  chargesUnavailableReason: string | null;
  excludedUnclosedCount: number;
}

export interface CardSet {
  theNumber: CardResult<{ netPnlPaise: Paise; totalTrades: number; tradedValuePaise: Paise; estimated: boolean }>;
  whereMoneyWent: CardResult<{ grossPnlPaise: Paise; chargesPaise: Paise; chargesPctOfGrossProfit: number | null; estimated: boolean }>;
  rightButBroke: CardResult<{ winRate: number; avgWinPaise: number; avgLossPaise: number; wins: number; losses: number }>;
  expiryDay: CardResult<{ expiryPnlPaise: Paise; expiryTrades: number; otherPnlPaise: Paise; otherTrades: number }>;
  yourClock: CardResult<{ buckets: ClockBucket[]; bestIndex: number | null; worstIndex: number | null }>;
  revengeTrades: CardResult<{ count: number; combinedPnlPaise: Paise; medianLossPaise: Paise; triggers: number }>;
  holdingTime: CardResult<{ medianWinnerMs: number; medianLoserMs: number; winners: number; losers: number }>;
  bestWorstDay: CardResult<{ best: { date: IstDate; pnlPaise: Paise }; worst: { date: IstDate; pnlPaise: Paise } }>;
  summary: { headlines: [Headline, Headline, Headline]; samvat: string | null; siteUrl: string };
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
const BEFORE_CHARGES = 'Before charges.';

const insufficient = (reason: string) => ({ status: 'INSUFFICIENT_DATA' as const, reason });
const ok = <T>(data: T, notes: string[] = []) => ({ status: 'OK' as const, data, notes });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const isWin = (rt: RoundTrip) => rt.grossPnlPaise > 0;
const isLoss = (rt: RoundTrip) => rt.grossPnlPaise < 0;

/** Middle value; for an even count the mean of the two middle values, rounded half up. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]! + 1) / 2);
}

export function computeCards(input: {
  roundTrips: readonly RoundTrip[];
  fills: readonly Fill[];
  totals: Totals;
  samvat: string | null;
  siteUrl: string;
}): CardSet {
  const { roundTrips: rts, fills, totals } = input;
  const estimatedNotes = [
    'Charges are estimated from published rates. Add your P&L statement for exact numbers (coming soon).',
    ...(totals.excludedUnclosedCount > 0
      ? [`${totals.excludedUnclosedCount} position${totals.excludedUnclosedCount === 1 ? '' : 's'} that expired or are still open aren’t included.`]
      : []),
  ];
  const noTrades = 'No closed trades yet.';

  const theNumber: CardSet['theNumber'] =
    rts.length === 0
      ? insufficient(noTrades)
      : totals.netPnlPaise === null
        ? insufficient(totals.chargesUnavailableReason ?? 'Charges unavailable.')
        : ok(
            {
              netPnlPaise: totals.netPnlPaise,
              totalTrades: rts.length,
              tradedValuePaise: sum(fills.map((f) => f.qty * f.pricePaise)) as Paise,
              estimated: true,
            },
            estimatedNotes,
          );

  const whereMoneyWent: CardSet['whereMoneyWent'] =
    rts.length === 0
      ? insufficient(noTrades)
      : totals.charges === null
        ? insufficient(totals.chargesUnavailableReason ?? 'Charges unavailable.')
        : ok(
            {
              grossPnlPaise: totals.grossPnlPaise,
              chargesPaise: totals.charges.total,
              chargesPctOfGrossProfit:
                totals.grossPnlPaise > 0 ? (totals.charges.total / totals.grossPnlPaise) * 100 : null,
              estimated: true,
            },
            estimatedNotes,
          );

  const daysTraded = new Set(fills.map((f) => f.tradeDate)).size;
  const summaryHeadlines = headlines(theNumber, whereMoneyWent, rightButBrokeCard(rts), totals, rts.length, daysTraded);

  return {
    theNumber,
    whereMoneyWent,
    rightButBroke: rightButBrokeCard(rts),
    expiryDay: expiryDayCard(rts),
    yourClock: clockCard(rts),
    revengeTrades: revengeCard(rts),
    holdingTime: holdingCard(rts),
    bestWorstDay: bestWorstDayCard(rts),
    summary: { headlines: summaryHeadlines, samvat: input.samvat, siteUrl: input.siteUrl },
  };
}

function rightButBrokeCard(rts: readonly RoundTrip[]): CardSet['rightButBroke'] {
  const wins = rts.filter(isWin);
  const losses = rts.filter(isLoss);
  if (rts.length < THRESHOLDS.minTradesWinRate || wins.length === 0 || losses.length === 0) {
    return insufficient(`Needs at least ${THRESHOLDS.minTradesWinRate} closed trades with at least one win and one loss.`);
  }
  return ok(
    {
      winRate: wins.length / (wins.length + losses.length),
      avgWinPaise: sum(wins.map((r) => r.grossPnlPaise)) / wins.length,
      avgLossPaise: sum(losses.map((r) => -r.grossPnlPaise)) / losses.length,
      wins: wins.length,
      losses: losses.length,
    },
    [BEFORE_CHARGES, 'Break-even trades aren’t counted as wins or losses.'],
  );
}

function expiryDayCard(rts: readonly RoundTrip[]): CardSet['expiryDay'] {
  const onExpiry = rts.filter((r) => r.exitDate === r.instrument.expiry);
  const other = rts.filter((r) => r.exitDate !== r.instrument.expiry);
  if (onExpiry.length === 0 || other.length === 0) {
    return insufficient(
      onExpiry.length === 0 ? 'None of your trades closed on an expiry day.' : 'All of your trades closed on expiry day.',
    );
  }
  return ok(
    {
      expiryPnlPaise: sum(onExpiry.map((r) => r.grossPnlPaise)) as Paise,
      expiryTrades: onExpiry.length,
      otherPnlPaise: sum(other.map((r) => r.grossPnlPaise)) as Paise,
      otherTrades: other.length,
    },
    [BEFORE_CHARGES, 'A trade counts as expiry-day if it closed on its contract’s expiry date.'],
  );
}

export function clockBucketOf(at: EpochMs): number {
  const i = Math.floor((istMinuteOfDay(at) - SESSION_START_MIN) / 15);
  return Math.min(CLOCK_BUCKETS - 1, Math.max(0, i));
}

function clockCard(rts: readonly RoundTrip[]): CardSet['yourClock'] {
  if (rts.length < THRESHOLDS.minTradesClock) {
    return insufficient(`Needs at least ${THRESHOLDS.minTradesClock} closed trades.`);
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
    BEFORE_CHARGES,
    'Trades are placed by when you entered, in 15-minute slots (IST).',
    `Best and worst slots need at least ${THRESHOLDS.minTradesPerClockSlot} trades.`,
  ]);
}

function revengeCard(rts: readonly RoundTrip[]): CardSet['revengeTrades'] {
  const losses = rts.filter(isLoss);
  if (losses.length < THRESHOLDS.minLossesRevenge) {
    return insufficient(`Needs at least ${THRESHOLDS.minLossesRevenge} losing trades.`);
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
    [BEFORE_CHARGES, `A revenge trade is any new entry within 15 minutes after a loss bigger than your median loss (${formatInr(medianLoss)}).`],
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
    return insufficient(`Needs at least ${THRESHOLDS.minEachHolding} winning and ${THRESHOLDS.minEachHolding} losing trades.`);
  }
  return ok(
    {
      medianWinnerMs: median(wins.map((r) => r.holdingMs)),
      medianLoserMs: median(losses.map((r) => r.holdingMs)),
      winners: wins.length,
      losers: losses.length,
    },
    ['Holding time is the quantity-weighted time each unit was held (FIFO).'],
  );
}

function bestWorstDayCard(rts: readonly RoundTrip[]): CardSet['bestWorstDay'] {
  const byDay = new Map<IstDate, number>();
  for (const r of rts) byDay.set(r.exitDate, (byDay.get(r.exitDate) ?? 0) + r.grossPnlPaise);
  if (byDay.size < 2) return insufficient('Needs trades closed on at least 2 different days.');
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
    [BEFORE_CHARGES, 'Each trade counts on the day it closed.'],
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
): [Headline, Headline, Headline] {
  const candidates: Headline[] = [];
  if (theNumber.status === 'OK') candidates.push({ label: 'Net P&L', value: formatInr(theNumber.data.netPnlPaise) });
  else candidates.push({ label: 'P&L before charges', value: formatInr(totals.grossPnlPaise) });
  if (money.status === 'OK') candidates.push({ label: 'Charges paid', value: formatInr(money.data.chargesPaise) });
  if (winRate.status === 'OK') candidates.push({ label: 'Win rate', value: formatPct(winRate.data.winRate) });
  candidates.push({ label: 'Trades', value: String(trades) });
  if (theNumber.status === 'OK') candidates.push({ label: 'Traded value', value: formatInr(theNumber.data.tradedValuePaise) });
  candidates.push({ label: 'P&L before charges', value: formatInr(totals.grossPnlPaise) });
  candidates.push({ label: 'Days traded', value: String(daysTraded) });
  const unique = candidates.filter((h, i) => candidates.findIndex((x) => x.label === h.label) === i);
  return [unique[0]!, unique[1]!, unique[2]!];
}

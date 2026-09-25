import { calculateCharges } from './charges/calculate';
import type { ChargeRateTable } from './charges/types';
import { computeCards, type CardSet, type Totals } from './cards';
import { samvatLabel } from './config/samvat';
import { ChargesUnavailableError } from './errors';
import { mergeFills } from './merge';
import { buildRoundTrips } from './roundTrips';
import { istMinuteOfDay } from './time';
import type { Fill, IstDate, Paise, RoundTrip, UnclosedPosition } from './types';

export const ENGINE_VERSION = '0.1.0';

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
  totals: Totals;
  cards: CardSet;
  /** User-facing notices. */
  warnings: string[];
}

/**
 * The whole pipeline from parsed tradebook files to cards (ARCHITECTURE §2).
 * Pure and deterministic. The P&L statement input arrives once its export
 * format is verified; until then totals are always ESTIMATED.
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

  const grossPnlPaise = roundTrips.reduce((s, r) => s + r.grossPnlPaise, 0) as Paise;
  let charges = null;
  let chargesUnavailableReason: string | null = null;
  try {
    charges = calculateCharges(fills, input.rates);
  } catch (e) {
    if (!(e instanceof ChargesUnavailableError)) throw e;
    chargesUnavailableReason = e.userMessage;
  }

  // Charges cover every fill, including those of positions excluded from
  // P&L, because they were really paid.
  const totals: Totals = {
    source: 'ESTIMATED',
    grossPnlPaise,
    charges,
    netPnlPaise: charges ? ((grossPnlPaise - charges.total) as Paise) : null,
    chargesUnavailableReason,
    excludedUnclosedCount: unclosed.length,
  };

  const samvat = samvatLabel(roundTrips.length > 0 ? roundTrips.map((r) => r.exitDate) : dates);
  const cards = computeCards({ roundTrips, fills, totals, samvat, siteUrl: input.siteUrl });

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

  return {
    engineVersion: ENGINE_VERSION,
    rateTableVersion: input.rates.version,
    dateRange: { from, to },
    samvat,
    fillCount: fills.length,
    duplicateFillsDropped: duplicatesDropped,
    roundTrips,
    unclosed,
    totals,
    cards,
    warnings,
  };
}

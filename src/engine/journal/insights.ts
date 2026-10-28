/**
 * Behaviour insights (docs/SPEC.md US-2.6): one factual sentence per card,
 * built from the card formulas in ARCHITECTURE §7. A card without enough data
 * gives no insight rather than a misleading number.
 */
import type { CardSet } from '../cards';
import { formatDuration, formatInr, formatPct } from '../format';
import { m } from '../i18n';

export type InsightId = 'revenge' | 'overtrading' | 'expiryDay' | 'timeOfDay' | 'holdingTime' | 'chargesDrag';

export interface Insight {
  id: InsightId;
  text: string;
}

const slot = (startMinuteIst: number) => `${String(Math.floor(startMinuteIst / 60)).padStart(2, '0')}:${String(startMinuteIst % 60).padStart(2, '0')}`;

export function insightsFor(cards: CardSet): Insight[] {
  const out: Insight[] = [];
  const t = m();
  const r = cards.revengeTrades;
  if (r.status === 'OK') out.push({ id: 'revenge', text: t.insightRevenge(r.data.count, formatInr(r.data.combinedPnlPaise)) });
  const b = cards.busyDays;
  if (b.status === 'OK') out.push({ id: 'overtrading', text: t.insightOvertrading(b.data.busyDays, formatInr(b.data.busyAvgPnlPaise), formatInr(b.data.otherAvgPnlPaise)) });
  const e = cards.expiryDay;
  if (e.status === 'OK') {
    out.push({ id: 'expiryDay', text: t.insightExpiry(e.data.expiryTrades, formatInr(e.data.expiryPnlPaise), e.data.otherTrades, formatInr(e.data.otherPnlPaise)) });
  }
  const c = cards.yourClock;
  if (c.status === 'OK' && c.data.bestIndex !== null && c.data.worstIndex !== null) {
    out.push({ id: 'timeOfDay', text: t.insightClock(slot(c.data.buckets[c.data.bestIndex]!.startMinuteIst), slot(c.data.buckets[c.data.worstIndex]!.startMinuteIst)) });
  }
  const h = cards.holdingTime;
  if (h.status === 'OK') out.push({ id: 'holdingTime', text: t.insightHolding(formatDuration(h.data.medianWinnerMs), formatDuration(h.data.medianLoserMs)) });
  const w = cards.whereMoneyWent;
  if (w.status === 'OK') {
    const pct = w.data.chargesPctOfGrossProfit === null ? null : formatPct(w.data.chargesPctOfGrossProfit / 100);
    out.push({ id: 'chargesDrag', text: t.insightCharges(formatInr(w.data.chargesPaise), pct) });
  }
  return out;
}

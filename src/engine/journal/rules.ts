/**
 * The user's own risk rules, checked against past days (docs/SPEC.md US-2.5).
 * Facts only: which trades came after a limit was reached and what they made
 * before charges. Nothing here tells anyone how to trade (SPEC §1.3).
 */
import { z } from 'zod';
import { formatInr } from '../format';
import { m } from '../i18n';
import { istDateOf, istMinuteOfDay } from '../time';
import type { EpochMs, IstDate, Paise, RoundTrip } from '../types';

export const RULE_IDS = ['maxLossPerDay', 'maxTradesPerDay', 'stopAfterLosses', 'noTradesFirstMinutes'] as const;
export type RuleId = (typeof RULE_IDS)[number];

const limit = (max: number) => z.number().int().min(1).max(max).nullable().default(null);

/** null turns a rule off. Amounts are whole rupees, as people think about them. */
export const RulesSchema = z
  .object({
    maxLossPerDayRupees: limit(10_000_000),
    maxTradesPerDay: limit(500),
    stopAfterLosses: limit(20),
    noTradesFirstMinutes: limit(375),
  })
  .strict();

export type Rules = z.infer<typeof RulesSchema>;

/** Validates rules from storage or a form; throws on anything unexpected. */
export function parseRules(input: unknown): Rules {
  return RulesSchema.parse(input);
}

export interface RuleBreach {
  rule: RuleId;
  date: IstDate;
  /** When the limit was reached; null when the file has no trade times. */
  breachAt: EpochMs | null;
  /** tradeKey() of the trades that broke the rule (empty without trade times). */
  trades: string[];
  /** Σ gross P&L of those trades; null when they can't be identified. */
  costPaise: Paise | null;
  message: string;
}

/** A rule that couldn't be checked on a day, and why. */
export interface RuleGap {
  rule: RuleId;
  date: IstDate;
  message: string;
}

const SESSION_START = 9 * 60 + 15;

/** A stable key for a round trip, independent of its position in a list. */
export function tradeKey(rt: RoundTrip): string {
  return `${rt.broker}|${rt.instrument.key}|${rt.entryAt}|${rt.exitAt}|${rt.partial ? 'p' : 'f'}`;
}

const hhmm = (at: EpochMs) => {
  const min = istMinuteOfDay(at);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};
const sum = (rts: readonly RoundTrip[]) => rts.reduce((s, r) => s + r.grossPnlPaise, 0) as Paise;

function groupBy(rts: readonly RoundTrip[], dayOf: (rt: RoundTrip) => IstDate): Map<IstDate, RoundTrip[]> {
  const out = new Map<IstDate, RoundTrip[]>();
  for (const rt of rts) {
    const d = dayOf(rt);
    out.set(d, [...(out.get(d) ?? []), rt]);
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const byExit = (a: RoundTrip, b: RoundTrip) => a.exitAt - b.exitAt || a.entryAt - b.entryAt;
const byEntry = (a: RoundTrip, b: RoundTrip) => a.entryAt - b.entryAt || a.exitAt - b.exitAt;
const hasTimes = (day: readonly RoundTrip[]) => day.every((r) => r.timePrecision === 'second');
const enteredAfter = (day: readonly RoundTrip[], at: EpochMs) => day.filter((r) => r.entryAt > at).sort(byEntry);

function maxLoss(day: IstDate, rts: RoundTrip[], limitRupees: number): RuleBreach | null {
  const limitPaise = limitRupees * 100;
  const label = formatInr(limitPaise);
  if (!hasTimes(rts)) {
    return sum(rts) <= -limitPaise ? { rule: 'maxLossPerDay', date: day, breachAt: null, trades: [], costPaise: null, message: m().ruleMaxLossNoTimes(m().journalDay(day), label) } : null;
  }
  let running = 0;
  for (const rt of [...rts].sort(byExit)) {
    running += rt.grossPnlPaise;
    if (running <= -limitPaise) {
      const after = enteredAfter(rts, rt.exitAt);
      const cost = sum(after);
      return {
        rule: 'maxLossPerDay',
        date: day,
        breachAt: rt.exitAt,
        trades: after.map(tradeKey),
        costPaise: cost,
        message: m().ruleMaxLoss(m().journalDay(day), label, hhmm(rt.exitAt), after.length, formatInr(cost)),
      };
    }
  }
  return null;
}

function maxTrades(day: IstDate, rts: RoundTrip[], limitCount: number): RuleBreach | null {
  if (rts.length <= limitCount) return null;
  const extra = rts.length - limitCount;
  if (!hasTimes(rts)) {
    return { rule: 'maxTradesPerDay', date: day, breachAt: null, trades: [], costPaise: null, message: m().ruleMaxTradesNoTimes(m().journalDay(day), limitCount, extra) };
  }
  const sorted = [...rts].sort(byEntry);
  const over = sorted.slice(limitCount);
  const cost = sum(over);
  return {
    rule: 'maxTradesPerDay',
    date: day,
    breachAt: over[0]!.entryAt,
    trades: over.map(tradeKey),
    costPaise: cost,
    message: m().ruleMaxTrades(m().journalDay(day), limitCount, extra, formatInr(cost)),
  };
}

function streak(day: IstDate, rts: RoundTrip[], losses: number): RuleBreach | null {
  let run = 0;
  for (const rt of [...rts].sort(byExit)) {
    run = rt.grossPnlPaise < 0 ? run + 1 : 0;
    if (run === losses) {
      const after = enteredAfter(rts, rt.exitAt);
      if (after.length === 0) return null;
      const cost = sum(after);
      return {
        rule: 'stopAfterLosses',
        date: day,
        breachAt: rt.exitAt,
        trades: after.map(tradeKey),
        costPaise: cost,
        message: m().ruleStreak(m().journalDay(day), losses, hhmm(rt.exitAt), after.length, formatInr(cost)),
      };
    }
  }
  return null;
}

function opening(day: IstDate, rts: RoundTrip[], minutes: number): RuleBreach | null {
  const early = rts.filter((r) => {
    const min = istMinuteOfDay(r.entryAt);
    return min >= SESSION_START && min < SESSION_START + minutes;
  }).sort(byEntry);
  if (early.length === 0) return null;
  const cost = sum(early);
  return {
    rule: 'noTradesFirstMinutes',
    date: day,
    breachAt: early[0]!.entryAt,
    trades: early.map(tradeKey),
    costPaise: cost,
    message: m().ruleOpening(m().journalDay(day), minutes, early.length, formatInr(cost)),
  };
}

/**
 * Checks every rule on every day. Loss and streak rules follow the order in
 * which P&L was realised (exit day); trade-count and opening rules follow
 * entry day and time.
 */
export function checkRules(roundTrips: readonly RoundTrip[], rules: Rules): { breaches: RuleBreach[]; gaps: RuleGap[] } {
  const breaches: RuleBreach[] = [];
  const gaps: RuleGap[] = [];
  const byExitDay = groupBy(roundTrips, (r) => r.exitDate);
  const byEntryDay = groupBy(roundTrips, (r) => istDateOf(r.entryAt));
  const gap = (rule: RuleId, date: IstDate) => gaps.push({ rule, date, message: m().ruleNeedsTimes(m().journalDay(date)) });

  const days = [...new Set([...byExitDay.keys(), ...byEntryDay.keys()])].sort();
  for (const day of days) {
    const exits = byExitDay.get(day) ?? [];
    const entries = byEntryDay.get(day) ?? [];
    const add = (b: RuleBreach | null) => b && breaches.push(b);
    if (rules.maxLossPerDayRupees !== null && exits.length) add(maxLoss(day, exits, rules.maxLossPerDayRupees));
    if (rules.maxTradesPerDay !== null && entries.length) add(maxTrades(day, entries, rules.maxTradesPerDay));
    if (rules.stopAfterLosses !== null && exits.length) {
      if (hasTimes(exits)) add(streak(day, exits, rules.stopAfterLosses));
      else gap('stopAfterLosses', day);
    }
    if (rules.noTradesFirstMinutes !== null && entries.length) {
      if (hasTimes(entries)) add(opening(day, entries, rules.noTradesFirstMinutes));
      else gap('noTradesFirstMinutes', day);
    }
  }
  return { breaches, gaps };
}

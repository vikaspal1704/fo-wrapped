/**
 * The Journal's pure analysis (docs/SPEC.md §4): rules, insights, weekly
 * report, incremental import and notes. Synthetic fills only.
 */
import { describe, expect, it } from 'vitest';
import {
  analyze,
  ConflictingDuplicateError,
  fileLabel,
  insightsFor,
  normalizeTags,
  parseRules,
  parseTradebook,
  planImport,
  RATES,
  searchNotes,
  checkRules,
  tradeKey,
  weekOf,
  weeklyReport,
  withLocaleSync,
  buildRoundTrips,
  type IstDate,
  type Note,
  type Rules,
} from '../../src/engine';
import { fill, fixture } from './helpers';
import { violations } from './noAdviceList';

const SITE = 'https://example.invalid/';
const NO_RULES: Rules = { maxLossPerDayRupees: null, maxTradesPerDay: null, stopAfterLosses: null, noTradesFirstMinutes: null };

let symbolSeq = 0;
/** One closed trade of 100 units: entry and exit times on `day`, P&L in rupees per unit. */
function trade(day: string, entry: string, exit: string, perUnit: number, precision: 'second' | 'date' = 'second') {
  const strike = 24000 + 50 * (symbolSeq++ % 20);
  const s = { symbol: `NIFTY26MAY${strike}CE`, expiry: '2026-05-26' };
  const buy = 100;
  return [
    fill({ side: 'BUY', qty: 100, price: `${buy}.00`, at: `${day}T${entry}:00`, timePrecision: precision, ...s }),
    fill({ side: 'SELL', qty: 100, price: `${buy + perUnit}.00`, at: `${day}T${exit}:00`, timePrecision: precision, ...s }),
  ];
}
const D = '2026-05-04';
const dayFills = () => [
  ...trade(D, '09:16', '09:25', -6), // A −₹600
  ...trade(D, '09:40', '09:50', -5), // B −₹500 → running −₹1,100
  ...trade(D, '10:00', '10:10', 3), // C +₹300
  ...trade(D, '10:20', '10:30', -2), // D −₹200
  ...trade(D, '11:00', '11:30', 4), // E +₹400
];
const rts = (fills: ReturnType<typeof dayFills>) => buildRoundTrips([...fills].sort((a, b) => a.executedAt - b.executedAt), D as IstDate).roundTrips;

describe('rules (SPEC US-2.5)', () => {
  it('rules_are_validated', () => {
    expect(parseRules({ maxLossPerDayRupees: 2000, maxTradesPerDay: 5, stopAfterLosses: 2, noTradesFirstMinutes: 15 })).toEqual({
      maxLossPerDayRupees: 2000,
      maxTradesPerDay: 5,
      stopAfterLosses: 2,
      noTradesFirstMinutes: 15,
    });
    expect(parseRules({})).toEqual(NO_RULES);
    for (const bad of [{ maxLossPerDayRupees: -5 }, { maxTradesPerDay: 2.5 }, { stopAfterLosses: 0 }, { noTradesFirstMinutes: 400 }, { maxLossPerDayRupees: '100' }, { other: 1 }]) {
      expect(() => parseRules(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it('max_loss_rule_flags_days_and_later_trades', () => {
    const trips = rts(dayFills());
    const { breaches } = checkRules(trips, { ...NO_RULES, maxLossPerDayRupees: 1000 });
    expect(breaches).toHaveLength(1);
    const b = breaches[0]!;
    expect(b.rule).toBe('maxLossPerDay');
    expect(b.date).toBe(D);
    expect(b.breachAt).toBe(trips[1]!.exitAt);
    expect(b.trades).toEqual([tradeKey(trips[2]!), tradeKey(trips[3]!), tradeKey(trips[4]!)]);
  });

  it('trade_count_streak_and_opening_rules', () => {
    const trips = rts(dayFills());
    const one = (rules: Partial<Rules>) => checkRules(trips, { ...NO_RULES, ...rules }).breaches;
    expect(one({ maxTradesPerDay: 3 })[0]!.trades).toEqual([tradeKey(trips[3]!), tradeKey(trips[4]!)]);
    expect(one({ stopAfterLosses: 2 })[0]!.trades).toEqual([tradeKey(trips[2]!), tradeKey(trips[3]!), tradeKey(trips[4]!)]);
    expect(one({ noTradesFirstMinutes: 15 })[0]!.trades).toEqual([tradeKey(trips[0]!)]);
    expect(one({ maxTradesPerDay: 5 })).toEqual([]);
    expect(one({ stopAfterLosses: 3 })).toEqual([]);
  });

  it('rule_breach_cost_is_pnl_after_breach', () => {
    const trips = rts(dayFills());
    const cost = (rules: Partial<Rules>) => checkRules(trips, { ...NO_RULES, ...rules }).breaches[0]!.costPaise;
    expect(cost({ maxLossPerDayRupees: 1000 })).toBe(50_000); // C + D + E = 300 − 200 + 400
    expect(cost({ maxTradesPerDay: 3 })).toBe(20_000); // D + E
    expect(cost({ stopAfterLosses: 2 })).toBe(50_000);
    expect(cost({ noTradesFirstMinutes: 15 })).toBe(-60_000); // A
    const msg = checkRules(trips, { ...NO_RULES, maxLossPerDayRupees: 1000 }).breaches[0]!.message;
    expect(msg).toBe('4 May 2026: your loss for the day reached ₹1,000 at 09:50. The 3 trades after that made ₹500 before charges.');
  });

  it('rule_messages_pass_no_advice_check', () => {
    const trips = rts(dayFills());
    const all: Rules = { maxLossPerDayRupees: 1000, maxTradesPerDay: 3, stopAfterLosses: 2, noTradesFirstMinutes: 15 };
    for (const locale of ['en', 'hi'] as const) {
      const { breaches } = withLocaleSync(locale, () => checkRules(trips, all));
      expect(breaches).toHaveLength(4);
      for (const b of breaches) expect(violations(b.message), b.message).toEqual([]);
    }
  });

  it('time_rules_need_trade_times', () => {
    const fills = [...trade(D, '00:00', '00:00', -7, 'date'), ...trade(D, '00:00', '00:00', -5, 'date')];
    const trips = rts(fills);
    const all: Rules = { maxLossPerDayRupees: 1000, maxTradesPerDay: 1, stopAfterLosses: 2, noTradesFirstMinutes: 15 };
    const { breaches, gaps } = checkRules(trips, all);
    expect(breaches.map((b) => [b.rule, b.costPaise, b.breachAt, b.trades])).toEqual([
      ['maxLossPerDay', null, null, []],
      ['maxTradesPerDay', null, null, []],
    ]);
    expect(gaps.map((g) => g.rule)).toEqual(['stopAfterLosses', 'noTradesFirstMinutes']);
    expect(gaps[0]!.message).toContain('can’t check without trade times');
  });
});

describe('insights (SPEC US-2.6)', () => {
  const year = () => analyze({ tradebooks: [parseTradebook('year.csv', fixture('synthetic-year.csv'))], rates: RATES, siteUrl: SITE });

  it('insight_revenge', () => {
    const r = year();
    const card = r.cards.revengeTrades;
    expect(card.status).toBe('OK');
    const text = insightsFor(r.cards).find((i) => i.id === 'revenge')!.text;
    if (card.status === 'OK') expect(text).toContain(`${card.data.count} trade`);
    expect(text).toContain('within 15 minutes of a big loss');
  });

  it('insight_overtrading', () => {
    const i = insightsFor(year().cards).find((x) => x.id === 'overtrading')!;
    expect(i.text).toMatch(/On your \d+ busiest days/);
  });

  it('insight_expiry_day', () => {
    expect(insightsFor(year().cards).find((x) => x.id === 'expiryDay')!.text).toMatch(/expiry days/);
  });

  it('insight_time_of_day', () => {
    expect(insightsFor(year().cards).find((x) => x.id === 'timeOfDay')!.text).toMatch(/\d\d:\d\d/);
  });

  it('insight_holding_time', () => {
    expect(insightsFor(year().cards).find((x) => x.id === 'holdingTime')!.text).toMatch(/held winning trades/);
  });

  it('insight_charges_drag', () => {
    expect(insightsFor(year().cards).find((x) => x.id === 'chargesDrag')!.text).toMatch(/charges/);
  });

  it('insights_pass_no_advice_check', () => {
    for (const locale of ['en', 'hi'] as const) {
      const r = withLocaleSync(locale, () => year());
      const list = withLocaleSync(locale, () => insightsFor(r.cards));
      expect(list.length).toBe(6);
      for (const i of list) expect(violations(i.text), i.text).toEqual([]);
    }
  });

  it('insights_omit_thin_data', () => {
    const r = analyze({ tradebooks: [[...trade(D, '10:00', '10:30', 2)]], rates: RATES, siteUrl: SITE });
    const ids = insightsFor(r.cards).map((i) => i.id);
    for (const thin of ['revenge', 'timeOfDay', 'holdingTime', 'overtrading']) expect(ids).not.toContain(thin);
  });
});

describe('weekly report (SPEC US-2.7)', () => {
  it('weekly_report_built_on_device', () => {
    const fills = [
      ...trade('2026-04-28', '10:00', '10:30', 5), // previous week
      ...trade('2026-05-04', '09:16', '09:30', -6),
      ...trade('2026-05-06', '10:00', '10:30', 2),
    ];
    const report = weeklyReport({ tradebooks: [fills], rates: RATES, rules: { ...NO_RULES, noTradesFirstMinutes: 15 }, siteUrl: SITE })!;
    expect(report.period).toMatchObject({ kind: 'WEEK', from: '2026-05-04', to: '2026-05-10' });
    expect(report.trades).toBe(2);
    expect(report.grossPnlPaise).toBe(-40_000);
    expect(report.netPnlPaise).toBe(-40_000 - report.chargesPaise!);
    expect(report.chargesEstimated).toBe(true);
    expect(report.breaches.map((b) => b.date)).toEqual(['2026-05-04']);
    // An explicit earlier week.
    expect(weeklyReport({ tradebooks: [fills], rates: RATES, rules: NO_RULES, siteUrl: SITE, week: '2026-04-29' as IstDate })!.trades).toBe(1);
  });

  it('week_runs_monday_to_sunday', () => {
    expect(weekOf('2026-05-10' as IstDate)).toMatchObject({ id: 'week-2026-05-04', from: '2026-05-04', to: '2026-05-10' });
    expect(weekOf('2026-05-04' as IstDate).from).toBe('2026-05-04');
    expect(weekOf('2026-01-01' as IstDate).from).toBe('2025-12-29');
  });
});

describe('incremental import (SPEC US-2.4)', () => {
  it('incremental_import_merges_and_dedupes', () => {
    const a = fill({ side: 'BUY', qty: 75, price: '100.00', at: '2026-05-04T10:00:00', tradeId: 'T1' });
    const b = fill({ side: 'SELL', qty: 75, price: '110.00', at: '2026-05-04T11:00:00', tradeId: 'T2' });
    const c = fill({ side: 'BUY', qty: 75, price: '90.00', at: '2026-05-05T10:00:00', tradeId: 'T3' });
    const plan = planImport([a, b], [{ ...b }, c, { ...c }]);
    expect(plan.added.map((f) => f.tradeId)).toEqual(['T3']);
    expect(plan.duplicates).toBe(2);
  });

  it('incremental_import_rejects_conflicts', () => {
    const a = fill({ side: 'BUY', qty: 75, price: '100.00', at: '2026-05-04T10:00:00', tradeId: 'T1' });
    expect(() => planImport([a], [{ ...a, qty: 150 }])).toThrow(ConflictingDuplicateError);
  });

  it('import_history_strips_client_id', () => {
    expect(fileLabel('tradebook-AB1234-FO.csv')).toBe('tradebook-•••-FO.csv');
    expect(fileLabel('pnl-XY9876.xlsx')).toBe('pnl-•••.xlsx');
    expect(fileLabel('Trades_History_A123456_2026-04-01.xlsx')).toBe('Trades_History_•••_2026-04-01.xlsx');
    expect(fileLabel('report.csv')).toBe('report.csv');
  });
});

describe('notes (SPEC US-2.8)', () => {
  const note = (id: string, text: string, tags: string[], updatedAt: number): Note => ({ id, target: { kind: 'day', date: '2026-05-04' as IstDate }, text, tags, updatedAt });

  it('notes_search_on_device', () => {
    const notes = [note('1', 'Chased the gap at open', ['fomo'], 1), note('2', 'Calm day', ['plan'], 3), note('3', 'Revenge after loss', ['Revenge'], 2)];
    expect(searchNotes(notes, '').map((n) => n.id)).toEqual(['2', '3', '1']);
    expect(searchNotes(notes, 'GAP').map((n) => n.id)).toEqual(['1']);
    expect(searchNotes(notes, 'revenge').map((n) => n.id)).toEqual(['3']);
    expect(searchNotes(notes, '#plan').map((n) => n.id)).toEqual(['2']);
  });

  it('notes_tags_are_normalised', () => {
    expect(normalizeTags(' #Expiry, revenge,  expiry ,, FOMO ')).toEqual(['expiry', 'revenge', 'fomo']);
  });
});

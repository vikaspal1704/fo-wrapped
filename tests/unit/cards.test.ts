import { describe, expect, it } from 'vitest';
import {
  RATES,
  analyze,
  clockBucketOf,
  computeCards,
  median,
  parseIstDateTime,
  parseSymbol,
  parseTradebook,
  samvatLabel,
} from '../../src/engine';
import type { CardSet, IstDate, Paise, RoundTrip, Totals } from '../../src/engine';
import { MIN, fill, fixture } from './helpers';

const SITE = 'https://example.test/fo-wrapped/';
const inst = parseSymbol('NIFTY25NOV24000CE', 'NSE', '2025-11-25' as IstDate);
let id = 0;

/** A round trip entered at `entry` (IST) and held `holdMin` minutes. */
function rt(pnlRupees: number, entry = '2025-11-20T10:00:00', holdMin = 10, expiry = '2025-11-25'): RoundTrip {
  const entryAt = parseIstDateTime(entry)!;
  const exitAt = entryAt + holdMin * MIN;
  return {
    id: ++id,
    broker: 'zerodha',
    timePrecision: 'second',
    instrument: { ...inst, expiry: expiry as IstDate },
    side: 'LONG',
    entryAt,
    exitAt,
    exitDate: new Date(exitAt + 5.5 * 3600_000).toISOString().slice(0, 10) as IstDate,
    exitKind: 'TRADE',
    qty: 1,
    avgEntryPaise: 0,
    avgExitPaise: 0,
    grossPnlPaise: (pnlRupees * 100) as Paise,
    holdingMs: holdMin * MIN,
    fillIds: [],
  };
}

function totals(gross: number, charges: number | null): Totals {
  return {
    source: 'ESTIMATED',
    grossPnlPaise: gross as Paise,
    charges:
      charges === null
        ? null
        : { brokerage: charges as Paise, stt: 0 as Paise, exchangeTxn: 0 as Paise, sebi: 0 as Paise, stampDuty: 0 as Paise, gst: 0 as Paise, other: 0 as Paise, total: charges as Paise },
    netPnlPaise: charges === null ? null : ((gross - charges) as Paise),
    chargesUnavailableReason: charges === null ? 'unavailable' : null,
    excludedUnclosedCount: 0,
  };
}

function cards(rts: RoundTrip[], t?: Totals): CardSet {
  const gross = rts.reduce((s, r) => s + r.grossPnlPaise, 0);
  return computeCards({ roundTrips: rts, fills: [], totals: t ?? totals(gross, 0), samvat: '2081', siteUrl: SITE });
}

function data<T>(c: { status: string; data?: T }): T {
  expect(c.status).toBe('OK');
  return c.data as T;
}

describe('cards', () => {
  it('card1_net_pnl_trades_traded_value', () => {
    const r = analyze({ tradebooks: [parseTradebook('f.csv', fixture('zerodha-fo-tradebook.synthetic.csv'))], rates: RATES, siteUrl: SITE });
    const d = data(r.cards.theNumber);
    expect(d.totalTrades).toBe(4);
    expect(d.netPnlPaise).toBe(86275 - r.totals.charges!.total);
    // Σ qty × price over the 9 fills of the fixture.
    expect(d.tradedValuePaise).toBe(
      65 * 4000 + 65 * 2265 + 65 * 1810 * 2 + 130 * 1500 + 20 * 15000 + 20 * 12050 + 20 * 9505 + 20 * 13145,
    );
    expect(d.estimated).toBe(true);
  });

  it('card2_pct_of_gross_profit', () => {
    const c = cards([rt(100)], totals(1_000_000, 250_000));
    expect(data(c.whereMoneyWent).chargesPctOfGrossProfit).toBe(25);
  });

  it('card2_gross_loss_copy', () => {
    const c = cards([rt(-100)], totals(-10_000, 2_000));
    expect(data(c.whereMoneyWent).chargesPctOfGrossProfit).toBeNull();
  });

  it('cards_1_2_insufficient_when_charges_unavailable', () => {
    const c = cards([rt(100)], totals(10_000, null));
    expect(c.theNumber.status).toBe('INSUFFICIENT_DATA');
    expect(c.whereMoneyWent.status).toBe('INSUFFICIENT_DATA');
    expect(c.summary.headlines[0]).toEqual({ label: 'P&L before charges', value: '₹100' });
  });

  it('card3_win_rate_excludes_scratches', () => {
    const rts = [...[1, 2, 3, 4, 5, 6].map((x) => rt(x * 100)), rt(-50), rt(-150), rt(-100), rt(0)];
    const d = data(cards(rts).rightButBroke);
    expect(d.winRate).toBeCloseTo(6 / 9);
    expect(d.avgWinPaise).toBe(35_000);
    expect(d.avgLossPaise).toBe(10_000);
  });

  it('card3_insufficient_below_10_trades', () => {
    expect(cards([rt(1), rt(-1), rt(1), rt(-1), rt(1), rt(-1), rt(1), rt(-1), rt(1)]).rightButBroke.status).toBe('INSUFFICIENT_DATA');
  });

  it('card4_splits_by_exit_on_expiry_date', () => {
    const rts = [rt(500, '2025-11-25T10:00:00'), rt(-200, '2025-11-25T11:00:00'), rt(300, '2025-11-20T10:00:00')];
    expect(data(cards(rts).expiryDay)).toEqual({ expiryPnlPaise: 30_000, expiryTrades: 2, otherPnlPaise: 30_000, otherTrades: 1 });
  });

  it('card5_bucket_boundaries', () => {
    const at = (t: string) => parseIstDateTime(`2025-11-20T${t}`)!;
    expect(['09:15:00', '09:29:59', '09:30:00', '15:29:59', '15:30:00', '08:00:00'].map((t) => clockBucketOf(at(t)))).toEqual([0, 0, 1, 24, 24, 0]);
  });

  it('card5_best_worst_require_5_trades', () => {
    const rts = [
      ...Array.from({ length: 4 }, () => rt(1000, '2025-11-20T09:20:00')), // slot 0: 4 trades, +₹4,000
      ...Array.from({ length: 8 }, () => rt(100, '2025-11-20T10:00:00')), //  slot 3: 8 trades, +₹800
      ...Array.from({ length: 8 }, () => rt(-50, '2025-11-20T13:00:00')), //  slot 15: 8 trades, −₹400
    ];
    const d = data(cards(rts).yourClock);
    expect(d.buckets).toHaveLength(25);
    expect(d.bestIndex).toBe(3);
    expect(d.worstIndex).toBe(15);
  });

  it('card6_revenge_trade_detection', () => {
    // Losses 10, 20, 30, 40, 500 → median 30; only the 40 and 500 losses trigger.
    const big = rt(-500, '2025-11-20T10:50:00', 10); // exits 11:00:00
    const rts = [
      rt(-10, '2025-11-20T09:20:00', 5),
      rt(-20, '2025-11-20T09:30:00', 5),
      rt(-30, '2025-11-20T09:40:00', 5),
      rt(-40, '2025-11-21T09:20:00', 5),
      big,
      rt(70, '2025-11-20T11:00:00'), // same instant as the exit: not after it
      rt(80, '2025-11-20T11:10:00'),
      rt(90, '2025-11-20T11:15:00'), // exactly +15 min: included
      rt(60, '2025-11-20T11:16:00'),
    ];
    const d = data(cards(rts).revengeTrades);
    expect(d).toMatchObject({ count: 2, combinedPnlPaise: 17_000, medianLossPaise: 3000, triggers: 2 });
  });

  it('card6_small_losses_do_not_trigger', () => {
    const rts = [-10, -10, -10, -10, -10].map((x, i) => rt(x, `2025-11-20T1${i}:00:00`, 5));
    rts.push(rt(50, '2025-11-20T10:06:00'));
    expect(data(cards(rts).revengeTrades).count).toBe(0);
  });

  it('card6_trade_counted_once_for_overlapping_windows', () => {
    const rts = [
      rt(-10, '2025-11-21T09:20:00', 5),
      rt(-10, '2025-11-21T09:30:00', 5),
      rt(-10, '2025-11-21T09:40:00', 5),
      rt(-100, '2025-11-20T10:00:00', 5), // exits 10:05
      rt(-100, '2025-11-20T10:06:00', 5), // exits 10:11 (itself a revenge trade)
      rt(40, '2025-11-20T10:12:00'),
    ];
    const d = data(cards(rts).revengeTrades);
    expect(d.count).toBe(2);
    expect(d.combinedPnlPaise).toBe(-6000);
  });

  it('card7_median_holding_even_count', () => {
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([4, 1, 3])).toBe(3);
    const rts = [rt(1, undefined, 1), rt(1, undefined, 2), rt(1, undefined, 3), rt(1, undefined, 4), rt(-1, undefined, 30), rt(-1, undefined, 40), rt(-1, undefined, 50)];
    expect(data(cards(rts).holdingTime)).toMatchObject({ medianWinnerMs: 2.5 * MIN, medianLoserMs: 40 * MIN });
  });

  it('card8_best_worst_day_ties_earliest', () => {
    const rts = [rt(100, '2025-11-21T10:00:00'), rt(100, '2025-11-20T10:00:00'), rt(-40, '2025-11-24T10:00:00'), rt(-40, '2025-11-22T10:00:00')];
    expect(data(cards(rts).bestWorstDay)).toEqual({
      best: { date: '2025-11-20', pnlPaise: 10_000 },
      worst: { date: '2025-11-22', pnlPaise: -4000 },
    });
  });

  it('summary_has_three_headlines_and_no_percentiles', () => {
    const rts = [...[1, 2, 3, 4, 5, 6].map((x) => rt(x * 100)), rt(-50), rt(-150), rt(-100), rt(0)];
    const s = cards(rts, totals(160_000, 10_000)).summary;
    expect(s.headlines.map((h) => h.label)).toEqual(['Net P&L', 'Charges paid', 'Win rate']);
    expect(s.headlines.map((h) => h.value)).toEqual(['₹1,500', '₹100', '67%']);
    expect(s).toMatchObject({ samvat: '2081', siteUrl: SITE });
    expect(JSON.stringify(s)).not.toMatch(/percentile|%ile|top \d+%|better than/i);
  });

  it('summary_headline_options_start_with_defaults', () => {
    const rts = [...[1, 2, 3, 4, 5, 6].map((x) => rt(x * 100)), rt(-50), rt(-150), rt(-100), rt(0)];
    const s = cards(rts, totals(160_000, 10_000)).summary;
    expect(s.headlineOptions.slice(0, 3)).toEqual(s.headlines);
    expect(s.headlineOptions.map((h) => h.label)).toEqual(['Net P&L', 'Charges paid', 'Win rate', 'Trades', 'Traded value', 'P&L before charges', 'Days traded']);
  });

  it('summary_always_has_three_distinct_headlines', () => {
    const s = cards([rt(5)], totals(500, null)).summary;
    expect(new Set(s.headlines.map((h) => h.label)).size).toBe(3);
  });

  it('samvat_label_spans_years', () => {
    expect(samvatLabel(['2025-10-20', '2025-10-21'] as IstDate[])).toBe('2081–82');
    expect(samvatLabel(['2026-09-22'] as IstDate[])).toBe('2082');
    expect(samvatLabel(['2026-11-08'] as IstDate[])).toBe('2083');
    expect(samvatLabel(['2022-01-01'] as IstDate[])).toBeNull();
  });
});

describe('analyze', () => {
  it('analyzes_synthetic_fixture_end_to_end', () => {
    const r = analyze({ tradebooks: [parseTradebook('f.csv', fixture('zerodha-fo-tradebook.synthetic.csv'))], rates: RATES, siteUrl: SITE });
    expect(r).toMatchObject({ fillCount: 9, duplicateFillsDropped: 0, samvat: '2082', dateRange: { from: '2026-10-06', to: '2026-10-08' } });
    expect(r.totals.grossPnlPaise).toBe(86275);
    expect(r.totals.charges!.brokerage).toBe(8 * 2000);
    expect(r.cards.expiryDay.status).toBe('INSUFFICIENT_DATA');
    expect(r.warnings).toContain('Charges are estimated from published rates.');
  });

  it('charges_marked_estimated_without_statement', () => {
    const r = analyze({ tradebooks: [[fill({ side: 'BUY', qty: 1, price: '10', at: '2025-11-20T10:00:00' }), fill({ side: 'SELL', qty: 1, price: '12', at: '2025-11-20T10:05:00' })]], rates: RATES, siteUrl: SITE });
    expect(r.totals.source).toBe('ESTIMATED');
    const c = r.cards.theNumber;
    expect(c.status === 'OK' && c.notes.some((n) => /estimated/i.test(n))).toBe(true);
  });

  it('excluded_positions_are_reported', () => {
    const r = analyze({
      tradebooks: [
        [
          fill({ side: 'BUY', qty: 1, price: '10', at: '2025-11-20T10:00:00' }),
          fill({ side: 'SELL', qty: 1, price: '12', at: '2025-11-20T10:05:00' }),
          fill({ side: 'BUY', qty: 1, price: '10', at: '2025-11-20T10:00:00', symbol: 'NIFTY25NOV24100CE' }),
          fill({ side: 'SELL', qty: 1, price: '10', at: '2025-11-20T10:00:00', symbol: 'NIFTY25NOV24200CE' }),
        ],
      ],
      rates: RATES,
      siteUrl: SITE,
    });
    expect(r.totals.excludedUnclosedCount).toBe(2);
    const c = r.cards.theNumber;
    expect(c.status === 'OK' && c.notes.some((n) => n.includes('2 positions'))).toBe(true);
    expect(r.warnings).toContain('2 positions are still open and not counted in P&L.');
  });

  it('charges_unavailable_keeps_other_cards', () => {
    const r = analyze({
      tradebooks: [[fill({ side: 'BUY', qty: 1, price: '10', at: '2024-06-20T10:00:00', expiry: '2024-06-27', symbol: 'NIFTY24JUN24000CE' }), fill({ side: 'SELL', qty: 1, price: '12', at: '2024-06-20T10:05:00', expiry: '2024-06-27', symbol: 'NIFTY24JUN24000CE' })]],
      rates: RATES,
      siteUrl: SITE,
    });
    expect(r.totals.charges).toBeNull();
    expect(r.totals.grossPnlPaise).toBe(200);
    expect(r.cards.theNumber.status).toBe('INSUFFICIENT_DATA');
    expect(r.warnings.join(' ')).toMatch(/can’t estimate charges/);
  });
});

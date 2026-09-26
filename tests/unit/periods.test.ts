import { describe, expect, it } from 'vitest';
import { RATES, analyze, periodsFor, previousPeriod } from '../../src/engine';
import type { Fill, IstDate } from '../../src/engine';
import { fill } from './helpers';

const SITE = 'x';
/** A 75-unit round trip on `day`, entered 10:00, exited 10:05 on `exitDay`. */
function trip(day: string, pnlRupees: number, exitDay = day, symbol = 'NIFTY26SEP24000CE', expiry = '2026-09-29'): Fill[] {
  return [
    fill({ side: 'BUY', qty: 75, price: '100', at: `${day}T10:00:00`, symbol, expiry }),
    fill({ side: 'SELL', qty: 75, price: String(100 + pnlRupees), at: `${exitDay}T10:05:00`, symbol, expiry }),
  ];
}

describe('periods', () => {
  it('periods_for_dates', () => {
    const ids = periodsFor(['2025-10-20', '2025-10-21', '2026-04-01'] as IstDate[]).map((p) => p.id);
    expect(ids).toEqual(['all', 'samvat-2082', 'samvat-2081', 'cy-2026', 'cy-2025', 'fy-2026', 'fy-2025']);
    const labels = periodsFor(['2026-04-01'] as IstDate[]).map((p) => p.label);
    expect(labels).toEqual(['All trades', 'Samvat 2082', '2026', 'FY 2026-27']);
  });

  it('previous_period_is_same_kind', () => {
    const ps = periodsFor(['2025-05-01', '2026-05-01'] as IstDate[]);
    const fy26 = ps.find((p) => p.id === 'fy-2026')!;
    expect(previousPeriod(fy26, ps)?.id).toBe('fy-2025');
    expect(previousPeriod(ps[0]!, ps)).toBeNull();
  });

  it('view_counts_trade_where_it_closed_and_charges_where_paid', () => {
    const fills = trip('2026-03-31', 10, '2026-04-01', 'NIFTY26APR24000CE', '2026-04-28');
    const r = analyze({ tradebooks: [fills], rates: RATES, siteUrl: SITE });
    const fy25 = r.views.find((v) => v.period.id === 'fy-2025')!;
    const fy26 = r.views.find((v) => v.period.id === 'fy-2026')!;
    expect([fy25.roundTripCount, fy26.roundTripCount]).toEqual([0, 1]);
    expect(fy26.totals.grossPnlPaise).toBe(75 * 1000);
    // The buy's charges belong to FY 2025-26, the sell's to FY 2026-27.
    expect(fy25.totals.charges!.stampDuty).toBeGreaterThan(0);
    expect(fy25.totals.charges!.stt).toBe(0);
    expect(fy26.totals.charges!.stt).toBeGreaterThan(0);
    expect(fy25.totals.charges!.total + fy26.totals.charges!.total).toBe(r.totals.charges!.total);
  });

  it('default_view_is_latest_samvat_with_10_trades', () => {
    const old = Array.from({ length: 12 }, (_, i) => trip(`2025-06-${String(i + 2).padStart(2, '0')}`, 5, undefined, 'NIFTY25JUN24000CE', '2025-06-26')).flat();
    const recent = Array.from({ length: 3 }, (_, i) => trip(`2025-11-0${i + 3}`, 5, undefined, 'NIFTY25NOV24000CE', '2025-11-25')).flat();
    // Samvat 2082 has only 3 trades, so Samvat 2081 (12 trades) is the default.
    expect(analyze({ tradebooks: [[...old, ...recent]], rates: RATES, siteUrl: SITE }).defaultViewId).toBe('samvat-2081');
    // Fewer than 10 anywhere → all.
    expect(analyze({ tradebooks: [recent], rates: RATES, siteUrl: SITE }).defaultViewId).toBe('all');
  });

  it('comparison_against_previous_same_kind_period', () => {
    const fy25 = Array.from({ length: 3 }, (_, i) => trip(`2025-05-0${i + 5}`, 20, undefined, 'NIFTY25MAY24000CE', '2025-05-29')).flat();
    const fy26 = Array.from({ length: 5 }, (_, i) => trip(`2026-05-0${i + 4}`, -10, undefined, 'NIFTY26MAY24000CE', '2026-05-26')).flat();
    const r = analyze({ tradebooks: [[...fy25, ...fy26]], rates: RATES, siteUrl: SITE });
    const view = r.views.find((v) => v.period.id === 'fy-2026')!;
    expect(view.comparison?.previous.id).toBe('fy-2025');
    const rows = Object.fromEntries(view.comparison!.rows.map((x) => [x.key, [x.current, x.previous]]));
    expect(rows.trades).toEqual([5, 3]);
    expect(rows.netPnl![0]).toBeLessThan(0);
    expect(rows.winRate).toEqual([null, null]); // under 10 trades: not enough data, never 0
    expect(r.views[0]!.comparison).toBeNull();
  });

  it('charges_unavailable_only_affects_its_period', () => {
    const r = analyze({
      tradebooks: [[...trip('2024-06-10', 5, undefined, 'NIFTY24JUN24000CE', '2024-06-27'), ...trip('2025-06-10', 5, undefined, 'NIFTY25JUN24000CE', '2025-06-26')]],
      rates: RATES,
      siteUrl: SITE,
    });
    expect(r.views.find((v) => v.period.id === 'all')!.totals.charges).toBeNull();
    expect(r.views.find((v) => v.period.id === 'fy-2024')!.totals.charges).toBeNull();
    expect(r.views.find((v) => v.period.id === 'fy-2025')!.totals.charges).not.toBeNull();
  });

  it('summary_title_follows_period', () => {
    const r = analyze({ tradebooks: [trip('2026-05-04', 5, undefined, 'NIFTY26MAY24000CE', '2026-05-26')], rates: RATES, siteUrl: SITE });
    expect(r.views.map((v) => v.cards.summary.periodTitle)).toEqual(['Samvat 2082', 'Samvat 2082', '2026', 'FY 2026-27']);
  });
});

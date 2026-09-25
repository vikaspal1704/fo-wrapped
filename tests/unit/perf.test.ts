import { describe, expect, it } from 'vitest';
import { RATES, analyze } from '../../src/engine';
import type { Fill } from '../../src/engine';
import { fill } from './helpers';

describe('performance', () => {
  it('perf_20k_fills_under_budget', () => {
    // 10,000 round trips (20,000 fills) over 200 trading days.
    const fills: Fill[] = [];
    for (let i = 0; i < 10_000; i++) {
      const day = new Date(Date.UTC(2025, 10, 3) + Math.floor(i / 50) * 86_400_000).toISOString().slice(0, 10);
      const minute = 9 * 60 + 15 + (i % 50) * 7;
      const at = (m: number) => `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
      const symbol = `NIFTY26SEP${24000 + (i % 7) * 50}CE`;
      fills.push(fill({ side: 'BUY', qty: 75, price: '100.05', at: at(minute), symbol, expiry: '2026-09-29' }));
      fills.push(fill({ side: 'SELL', qty: 75, price: i % 3 ? '104.10' : '95.20', at: at(minute + 5), symbol, expiry: '2026-09-29' }));
    }
    const t0 = performance.now();
    const r = analyze({ tradebooks: [fills], rates: RATES, siteUrl: 'x' });
    const ms = performance.now() - t0;
    expect(r.roundTrips).toHaveLength(10_000);
    // NF-4 target is < 3 s on a mid-range phone; CI hardware must stay well under.
    expect(ms).toBeLessThan(1500);
  });
});

/**
 * Money math safety nets (ADR-0005, docs/SPEC.md US-2.9): reviewed golden
 * totals for every synthetic fixture, and seeded property tests for the FIFO,
 * merge and charge invariants. `UPDATE_GOLDEN=1 npm test` rewrites the golden
 * files; a change to them needs a reason in the PR.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, buildRoundTrips, calculateCharges, mergeFills, RATES, readBrokerFile, type Fill, type IstDate } from '../../src/engine';
import { fill, fixture } from './helpers';

const GOLDEN = join(__dirname, '../golden');
const SITE = 'https://example.invalid/';

describe('golden totals (SPEC AC-2.9.1)', () => {
  it('golden_totals_match', async () => {
    const files = readdirSync(join(__dirname, '../fixtures')).filter((f) => /\.(csv|xlsx)$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const name of files) {
      const read = await readBrokerFile(name, fixture(name));
      if (read.kind !== 'fills') continue;
      const r = analyze({ tradebooks: [read.fills], rates: RATES, siteUrl: SITE });
      const actual = {
        fills: r.fillCount,
        roundTrips: r.roundTrips.length,
        partialRoundTrips: r.roundTrips.filter((t) => t.partial).length,
        unclosed: r.unclosed.length,
        grossPnlPaise: r.totals.grossPnlPaise,
        charges: r.totals.charges,
        netPnlPaise: r.totals.netPnlPaise,
      };
      const file = join(GOLDEN, `${name}.json`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
      expect(actual, name).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    }
  });
});

/** mulberry32: small, seeded, reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS = [
  { symbol: 'NIFTY26MAY24000CE', expiry: '2026-05-26' },
  { symbol: 'NIFTY26MAY24000PE', expiry: '2026-05-26' },
  { symbol: 'BANKNIFTY26MAY52000CE', expiry: '2026-05-26' },
];

/** Random fills over a few days; `flat` adds closing fills so every contract ends at zero. */
function randomFills(seed: number, flat: boolean): Fill[] {
  const r = rng(seed);
  const out: Fill[] = [];
  const pos = new Map<string, number>();
  const n = 5 + Math.floor(r() * 40);
  let t = Date.parse('2026-05-04T09:15:00+05:30');
  for (let i = 0; i < n; i++) {
    t += 1000 + Math.floor(r() * 3_600_000);
    const s = SYMBOLS[Math.floor(r() * SYMBOLS.length)]!;
    const side = r() < 0.5 ? 'BUY' : 'SELL';
    const qty = 25 * (1 + Math.floor(r() * 8));
    const price = (50 + Math.floor(r() * 20000) / 100).toFixed(2);
    const at = new Date(t + 330 * 60_000).toISOString().slice(0, 19);
    out.push(fill({ side, qty, price, at, ...s }));
    pos.set(s.symbol, (pos.get(s.symbol) ?? 0) + (side === 'BUY' ? qty : -qty));
  }
  if (flat) {
    for (const s of SYMBOLS) {
      const p = pos.get(s.symbol) ?? 0;
      if (p === 0) continue;
      t += 60_000;
      const at = new Date(t + 330 * 60_000).toISOString().slice(0, 19);
      out.push(fill({ side: p > 0 ? 'SELL' : 'BUY', qty: Math.abs(p), price: '100.00', at, ...s }));
    }
  }
  return out;
}

const signedValue = (fills: readonly Fill[]) => fills.reduce((s, f) => s + (f.side === 'SELL' ? f.valuePaise : -f.valuePaise), 0);
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('property tests (SPEC AC-2.9.2)', () => {
  it('property_flat_books_balance', () => {
    for (const seed of SEEDS) {
      const fills = mergeFills([randomFills(seed, true)]).fills;
      const { roundTrips, unclosed } = buildRoundTrips(fills, '2026-05-20' as IstDate);
      expect(unclosed, `seed ${seed}`).toEqual([]);
      expect(roundTrips.reduce((s, t) => s + t.grossPnlPaise, 0), `seed ${seed}`).toBe(signedValue(fills));
    }
  });

  it('property_partial_books_balance', () => {
    for (const seed of SEEDS) {
      const fills = mergeFills([randomFills(seed, false)]).fills;
      const { roundTrips, unclosed } = buildRoundTrips(fills, '2026-05-20' as IstDate);
      // Sell value − buy value = realised P&L − cost of longs still held + proceeds of shorts still open.
      const open = unclosed.reduce((s, u) => s + (u.side === 'LONG' ? -1 : 1) * Math.round(u.avgEntryPaise * u.qty), 0);
      const realised = roundTrips.reduce((s, t) => s + t.grossPnlPaise, 0);
      expect(realised + open, `seed ${seed}`).toBe(signedValue(fills));
    }
  });

  it('property_merge_order_independent', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const all = randomFills(seed, true);
      const r = rng(seed * 7);
      const half = Math.floor(all.length / 2);
      const a = all.slice(0, half + 2);
      const b = all.slice(half - 2);
      const shuffled = [...all].sort(() => r() - 0.5);
      const once = mergeFills([a, b]).fills;
      expect(mergeFills([b, a]).fills, `seed ${seed}`).toEqual(once);
      expect(mergeFills([shuffled]).fills, `seed ${seed}`).toEqual(once);
      expect(mergeFills([once, once]).fills, `seed ${seed}`).toEqual(once);
    }
  });

  it('property_charges_split_by_day', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const fills = randomFills(seed, false);
      const days = new Map<string, Fill[]>();
      for (const f of fills) days.set(f.tradeDate, [...(days.get(f.tradeDate) ?? []), f]);
      const whole = calculateCharges(fills, RATES);
      const parts = [...days.values()].map((d) => calculateCharges(d, RATES));
      expect(parts.reduce((s, c) => s + c.total, 0), `seed ${seed}`).toBe(whole.total);
    }
  });
});

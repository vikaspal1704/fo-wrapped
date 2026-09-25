import { describe, expect, it } from 'vitest';
import { ConflictingDuplicateError, buildRoundTrips, mergeFills, parseTradebook } from '../../src/engine';
import type { Fill, IstDate } from '../../src/engine';
import { MIN, fill, fixture } from './helpers';

const DAY = '2025-11-20';
const at = (hms: string) => `${DAY}T${hms}`;
const asOf = DAY as IstDate;

function build(fills: Fill[], date: IstDate = asOf) {
  return buildRoundTrips(mergeFills([fills]).fills, date);
}

/** ARCHITECTURE §4.3. */
function canonicalFills(): Fill[] {
  return [
    fill({ side: 'BUY', qty: 150, price: '100.00', at: at('10:00:00'), tradeId: 'T1', orderId: 'O1' }),
    fill({ side: 'BUY', qty: 150, price: '110.00', at: at('10:05:00'), tradeId: 'T2', orderId: 'O2' }),
    fill({ side: 'SELL', qty: 120, price: '120.00', at: at('10:20:00'), tradeId: 'T3', orderId: 'O3' }),
    fill({ side: 'SELL', qty: 80, price: '120.00', at: at('10:20:00'), tradeId: 'T4', orderId: 'O3' }),
    fill({ side: 'SELL', qty: 250, price: '90.00', at: at('10:30:00'), tradeId: 'T5', orderId: 'O4' }),
    fill({ side: 'BUY', qty: 150, price: '80.00', at: at('10:40:00'), tradeId: 'T6', orderId: 'O5' }),
  ];
}

describe('round-trip builder', () => {
  it('test_worked_example_canonical', () => {
    const { roundTrips, unclosed } = build(canonicalFills());
    expect(unclosed).toEqual([]);
    expect(roundTrips).toHaveLength(2);
    expect(roundTrips[0]).toMatchObject({
      id: 1,
      side: 'LONG',
      qty: 300,
      avgEntryPaise: 10500,
      avgExitPaise: 11000,
      grossPnlPaise: 150000,
      holdingMs: 1_250_000,
      exitDate: DAY,
      exitKind: 'TRADE',
      fillIds: ['T1', 'T2', 'T3', 'T4', 'T5'],
    });
    expect(roundTrips[1]).toMatchObject({
      id: 2,
      side: 'SHORT',
      qty: 150,
      avgEntryPaise: 9000,
      avgExitPaise: 8000,
      grossPnlPaise: 150000,
      holdingMs: 600_000,
      fillIds: ['T5', 'T6'],
    });
    expect(roundTrips[0]!.exitAt).toBe(roundTrips[1]!.entryAt);
  });

  it('fifo_scale_in_single_exit', () => {
    const { roundTrips } = build([
      fill({ side: 'BUY', qty: 50, price: '100', at: at('10:00:00') }),
      fill({ side: 'BUY', qty: 50, price: '120', at: at('10:01:00') }),
      fill({ side: 'SELL', qty: 100, price: '130', at: at('10:02:00') }),
    ]);
    expect(roundTrips).toHaveLength(1);
    expect(roundTrips[0]).toMatchObject({ grossPnlPaise: 200000, avgEntryPaise: 11000 });
  });

  it('fifo_scale_out_multiple_exits', () => {
    const { roundTrips } = build([
      fill({ side: 'BUY', qty: 100, price: '100', at: at('10:00:00') }),
      fill({ side: 'SELL', qty: 40, price: '110', at: at('10:01:00') }),
      fill({ side: 'SELL', qty: 60, price: '90', at: at('10:02:00') }),
    ]);
    expect(roundTrips).toHaveLength(1);
    expect(roundTrips[0]!.grossPnlPaise).toBe(-20000);
    expect(roundTrips[0]!.exitAt - roundTrips[0]!.entryAt).toBe(2 * MIN);
  });

  it('fifo_partial_fills_same_order', () => {
    const split = build([
      fill({ side: 'BUY', qty: 30, price: '50', at: at('10:00:00'), orderId: 'A' }),
      fill({ side: 'BUY', qty: 30, price: '50', at: at('10:00:00'), orderId: 'A' }),
      fill({ side: 'BUY', qty: 15, price: '50', at: at('10:00:00'), orderId: 'A' }),
      fill({ side: 'SELL', qty: 75, price: '55', at: at('10:10:00') }),
    ]).roundTrips;
    const single = build([
      fill({ side: 'BUY', qty: 75, price: '50', at: at('10:00:00') }),
      fill({ side: 'SELL', qty: 75, price: '55', at: at('10:10:00') }),
    ]).roundTrips;
    const withoutFillIds = (rts: typeof single) => rts.map((rt) => ({ ...rt, fillIds: [] }));
    expect(withoutFillIds(split)).toEqual(withoutFillIds(single));
  });

  it('fifo_short_first', () => {
    const { roundTrips } = build([
      fill({ side: 'SELL', qty: 75, price: '200', at: at('10:00:00') }),
      fill({ side: 'BUY', qty: 75, price: '150', at: at('10:05:00') }),
    ]);
    expect(roundTrips[0]).toMatchObject({ side: 'SHORT', grossPnlPaise: 375000 });
  });

  it('fifo_flip_long_to_short', () => {
    const { roundTrips } = build([
      fill({ side: 'BUY', qty: 100, price: '50', at: at('10:00:00') }),
      fill({ side: 'SELL', qty: 150, price: '60', at: at('10:01:00') }),
      fill({ side: 'BUY', qty: 50, price: '55', at: at('10:02:00') }),
    ]);
    expect(roundTrips.map((r) => [r.side, r.qty, r.grossPnlPaise])).toEqual([
      ['LONG', 100, 100000],
      ['SHORT', 50, 25000],
    ]);
  });

  it('fifo_instruments_are_independent', () => {
    const a = (side: 'BUY' | 'SELL', price: string, t: string) =>
      fill({ side, qty: 10, price, at: at(t), symbol: 'NIFTY25NOV24000CE' });
    const b = (side: 'BUY' | 'SELL', price: string, t: string) =>
      fill({ side, qty: 10, price, at: at(t), symbol: 'NIFTY25NOV24000PE' });
    const together = build([a('BUY', '10', '10:00:00'), b('SELL', '20', '10:01:00'), a('SELL', '15', '10:02:00'), b('BUY', '5', '10:03:00')]);
    expect(together.roundTrips.map((r) => [r.instrument.tradingSymbol, r.grossPnlPaise])).toEqual([
      ['NIFTY25NOV24000CE', 5000],
      ['NIFTY25NOV24000PE', 15000],
    ]);
  });

  it('fifo_same_symbol_different_exchange_is_different_instrument', () => {
    const { roundTrips, unclosed } = build([
      fill({ side: 'BUY', qty: 10, price: '10', at: at('10:00:00'), exchange: 'NSE' }),
      fill({ side: 'SELL', qty: 10, price: '12', at: at('10:01:00'), exchange: 'BSE' }),
    ]);
    expect(roundTrips).toEqual([]);
    expect(unclosed.map((u) => u.instrument.key)).toEqual(['NSE:NIFTY25NOV24000CE', 'BSE:NIFTY25NOV24000CE']);
  });

  it('holding_time_is_qty_weighted_fifo', () => {
    expect(build(canonicalFills()).roundTrips[0]!.holdingMs).toBe(1_250_000);
  });
});

describe('merge', () => {
  it('dedupes_overlapping_files_by_trade_id', () => {
    const shared = Array.from({ length: 100 }, (_, i) =>
      fill({ side: i % 2 ? 'SELL' : 'BUY', qty: 1, price: '10', at: at(`11:${String(i % 60).padStart(2, '0')}:00`), tradeId: `S${i}` }),
    );
    const onlyA = [fill({ side: 'BUY', qty: 1, price: '10', at: at('09:30:00') })];
    const onlyB = [fill({ side: 'SELL', qty: 1, price: '10', at: at('14:30:00') })];
    const { fills, duplicatesDropped } = mergeFills([[...onlyA, ...shared], [...shared, ...onlyB]]);
    expect(fills).toHaveLength(102);
    expect(duplicatesDropped).toBe(100);
  });

  it('rejects_conflicting_duplicate', () => {
    const a = fill({ side: 'BUY', qty: 1, price: '10', at: at('10:00:00'), tradeId: 'X' });
    const b = { ...a, pricePaise: (a.pricePaise + 5) as typeof a.pricePaise };
    expect(() => mergeFills([[a], [b]])).toThrow(ConflictingDuplicateError);
  });

  it('same_trade_id_on_different_exchanges_is_not_a_duplicate', () => {
    const nse = fill({ side: 'BUY', qty: 1, price: '10', at: at('10:00:00'), tradeId: '42', exchange: 'NSE' });
    const bse = fill({ side: 'BUY', qty: 1, price: '11', at: at('10:00:00'), tradeId: '42', exchange: 'BSE' });
    expect(mergeFills([[nse], [bse]]).fills).toHaveLength(2);
  });

  it('merge_is_file_order_independent', () => {
    const f = canonicalFills();
    const [a, b] = [f.slice(0, 4), f.slice(2)];
    const ab = buildRoundTrips(mergeFills([a, b]).fills, asOf);
    const ba = buildRoundTrips(mergeFills([b, a]).fills, asOf);
    expect(ab).toEqual(ba);
  });
});

describe('unclosed positions', () => {
  it('flags_option_past_expiry_as_settled', () => {
    const { roundTrips, unclosed } = buildRoundTrips(
      mergeFills([
        [
          fill({ side: 'BUY', qty: 65, price: '20', at: '2025-11-20T10:00:00', expiry: '2025-11-25', symbol: 'NIFTY25NOV24000CE' }),
          fill({ side: 'BUY', qty: 65, price: '30', at: '2025-12-01T10:00:00', expiry: '2025-12-30', symbol: 'NIFTY25DEC24000CE' }),
          fill({ side: 'SELL', qty: 65, price: '35', at: '2025-12-02T10:00:00', expiry: '2025-12-30', symbol: 'NIFTY25DEC24000CE' }),
        ],
      ]).fills,
      '2025-12-02' as IstDate,
    );
    expect(roundTrips).toHaveLength(1);
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]).toMatchObject({ status: 'SETTLED_AT_EXPIRY', side: 'LONG', qty: 65, avgEntryPaise: 2000 });
  });

  it('flags_future_expiry_position_as_open', () => {
    const { unclosed } = build([fill({ side: 'SELL', qty: 65, price: '20', at: at('10:00:00'), expiry: '2025-11-25' })]);
    expect(unclosed[0]).toMatchObject({ status: 'OPEN', side: 'SHORT' });
  });

  it('position_still_open_on_its_expiry_day_is_settled', () => {
    const { unclosed } = build(
      [fill({ side: 'BUY', qty: 65, price: '20', at: '2025-11-25T10:00:00', expiry: '2025-11-25' })],
      '2025-11-25' as IstDate,
    );
    expect(unclosed[0]!.status).toBe('SETTLED_AT_EXPIRY');
  });

  it('as_of_is_last_trade_date_not_today', () => {
    // Classification depends only on the asOf argument, never the clock.
    const fills = [fill({ side: 'BUY', qty: 65, price: '20', at: at('10:00:00'), expiry: '2025-11-25' })];
    expect(build(fills, '2025-11-20' as IstDate).unclosed[0]!.status).toBe('OPEN');
    expect(build(fills, '2025-11-26' as IstDate).unclosed[0]!.status).toBe('SETTLED_AT_EXPIRY');
  });
});

describe('invariants', () => {
  function randomFills(seed: number): Fill[] {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const symbols = ['NIFTY25NOV24000CE', 'NIFTY25NOV24000PE', 'NIFTY25NOV24100CE'];
    return Array.from({ length: 300 }, (_, i) =>
      fill({
        side: rand() < 0.5 ? 'BUY' : 'SELL',
        qty: 1 + Math.floor(rand() * 5) * 25,
        price: `${1 + Math.floor(rand() * 300)}.${String(Math.floor(rand() * 20) * 5).padStart(2, '0')}`,
        at: `${DAY}T${String(9 + Math.floor(i / 60) % 6).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
        symbol: symbols[Math.floor(rand() * symbols.length)]!,
      }),
    );
  }

  it('invariant_quantity_conservation', () => {
    const fills = randomFills(7);
    const { roundTrips, unclosed } = build(fills);
    const net = new Map<string, number>();
    for (const f of fills) net.set(f.instrument.key, (net.get(f.instrument.key) ?? 0) + (f.side === 'BUY' ? f.qty : -f.qty));
    for (const [key, q] of net) {
      const u = unclosed.find((x) => x.instrument.key === key);
      expect(u ? (u.side === 'LONG' ? u.qty : -u.qty) : 0).toBe(q);
    }
    expect(roundTrips.length).toBeGreaterThan(10);
  });

  it('invariant_flat_to_flat_gross', () => {
    for (const rt of build(randomFills(11)).roundTrips) {
      const sign = rt.side === 'LONG' ? 1 : -1;
      expect(rt.grossPnlPaise).toBeCloseTo(sign * rt.qty * (rt.avgExitPaise - rt.avgEntryPaise), 6);
      expect(Number.isSafeInteger(rt.grossPnlPaise)).toBe(true);
    }
  });

  it('invariant_dedupe_idempotent', () => {
    const f = randomFills(3);
    const [a, b] = [f.slice(0, 150), f.slice(150)];
    expect(mergeFills([a, b, a]).fills).toEqual(mergeFills([a, b]).fills);
  });

  it('engine_is_deterministic', () => {
    const f = randomFills(5);
    expect(build(f)).toEqual(build(f));
  });
});

describe('synthetic Console fixture', () => {
  it('parses_synthetic_console_fixture', () => {
    const fills = parseTradebook('zerodha-fo-tradebook.synthetic.csv', fixture('zerodha-fo-tradebook.synthetic.csv'));
    expect(fills).toHaveLength(9);
    const { fills: merged } = mergeFills([fills]);
    const { roundTrips, unclosed } = buildRoundTrips(merged, merged.at(-1)!.tradeDate);
    expect(unclosed).toEqual([]);
    expect(
      roundTrips.map((r) => [r.instrument.key, r.side, r.qty, r.avgEntryPaise, r.avgExitPaise, r.grossPnlPaise, r.holdingMs]),
    ).toEqual([
      ['NSE:NIFTY26O0624800CE', 'SHORT', 65, 4000, 2265, 112775, 35 * MIN + 30_000],
      ['NSE:NIFTY26O0624700PE', 'LONG', 130, 1810, 1500, -40300, 20 * MIN],
      ['BSE:SENSEX26O0874000PE', 'LONG', 20, 15000, 12050, -59000, 30 * MIN + 35_000],
      ['BSE:SENSEX26O0874200CE', 'LONG', 20, 9505, 13145, 72800, 10 * MIN],
    ]);
    expect(roundTrips.reduce((s, r) => s + r.grossPnlPaise, 0)).toBe(86275);
    expect(new Set(merged.map((f) => f.orderId)).size).toBe(8);
  });
});

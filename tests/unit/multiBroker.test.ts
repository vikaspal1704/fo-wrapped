import { describe, expect, it } from 'vitest';
import { RATES, analyze, calculateCharges, mergeFills, prepareDateOnlyFills, buildRoundTrips } from '../../src/engine';
import type { ChargesBreakdown, Fill, IstDate, Paise } from '../../src/engine';
import { fill } from './helpers';

const SITE = 'x';
const charges = (total: number): ChargesBreakdown => ({
  brokerage: total as Paise, stt: 0 as Paise, exchangeTxn: 0 as Paise, sebi: 0 as Paise,
  stampDuty: 0 as Paise, gst: 0 as Paise, other: 0 as Paise, total: total as Paise,
});
/** A date-only fill (Angel One / Dhan style) on `day`. */
const dated = (side: 'BUY' | 'SELL', qty: number, price: string, day: string, broker: 'angelone' | 'dhan' = 'angelone', tradeId?: string) =>
  fill({ side, qty, price, at: `${day}T00:00:00`, broker, timePrecision: 'date', expiry: '2025-11-25', ...(tradeId ? { tradeId } : {}) });

describe('multi-broker engine', () => {
  it('positions_at_different_brokers_never_net', () => {
    const { roundTrips, unclosed } = buildRoundTrips(
      mergeFills([[fill({ side: 'BUY', qty: 10, price: '10', at: '2025-11-20T10:00:00', broker: 'zerodha' }), fill({ side: 'SELL', qty: 10, price: '12', at: '2025-11-20T10:05:00', broker: 'upstox' })]]).fills,
      '2025-11-20' as IstDate,
    );
    expect(roundTrips).toEqual([]);
    expect(unclosed.map((u) => [u.broker, u.side])).toEqual([['zerodha', 'LONG'], ['upstox', 'SHORT']]);
  });

  it('same_trade_id_at_different_brokers_is_not_a_duplicate', () => {
    const a = fill({ side: 'BUY', qty: 1, price: '10', at: '2025-11-20T10:00:00', tradeId: '7', broker: 'zerodha' });
    const b = fill({ side: 'BUY', qty: 1, price: '11', at: '2025-11-20T10:00:00', tradeId: '7', broker: 'upstox' });
    expect(mergeFills([[a], [b]]).fills).toHaveLength(2);
  });

  it('date_only_fills_aggregate_per_contract_day_side', () => {
    const out = prepareDateOnlyFills([dated('BUY', 65, '10', '2025-11-20'), dated('BUY', 65, '12', '2025-11-20'), dated('SELL', 130, '15', '2025-11-20')]);
    expect(out.map((f) => [f.side, f.qty, f.valuePaise])).toEqual([['BUY', 130, 65 * 1000 + 65 * 1200], ['SELL', 130, 130 * 1500]]);
  });

  it('date_only_reduces_carried_position_first', () => {
    // Day 1: buy 100 (carried long). Day 2: buy 50 and sell 100 → the sell closes day 1's lot first.
    const fills = prepareDateOnlyFills([dated('BUY', 100, '10', '2025-11-20'), dated('BUY', 50, '20', '2025-11-21'), dated('SELL', 100, '30', '2025-11-21')]);
    const sorted = mergeFills([fills]).fills;
    expect(sorted.map((f) => [f.tradeDate, f.side])).toEqual([['2025-11-20', 'BUY'], ['2025-11-21', 'SELL'], ['2025-11-21', 'BUY']]);
    const { roundTrips, unclosed } = buildRoundTrips(sorted, '2025-11-21' as IstDate);
    expect(roundTrips.map((r) => [r.grossPnlPaise, r.timePrecision])).toEqual([[100 * 2000, 'date']]);
    expect(unclosed[0]).toMatchObject({ qty: 50, side: 'LONG' });
  });

  it('date_only_totals_match_any_intraday_order', () => {
    // Real order: sell 65 @ 20, buy 65 @ 15 (short). Convention applies the buy first; the P&L is the same.
    const r = analyze({ tradebooks: [[dated('SELL', 65, '20', '2025-11-20'), dated('BUY', 65, '15', '2025-11-20')]], reportedCharges: [{ broker: 'angelone', records: [] }], rates: RATES, siteUrl: SITE });
    expect(r.totals.grossPnlPaise).toBe(65 * 500);
  });

  it('value_based_fifo_keeps_averaged_rows_exact', () => {
    // A daily-total row: 3 units for ₹100.00 in total (₹33.333… each), sold in 1 + 2 units.
    const buy = { ...dated('BUY', 3, '0', '2025-11-20', 'dhan'), valuePaise: 10_000 as Paise, pricePaise: 3333 as Paise };
    const sell1 = { ...fill({ side: 'SELL', qty: 1, price: '40', at: '2025-11-21T10:00:00', broker: 'dhan', expiry: '2025-11-25' }) };
    const sell2 = { ...fill({ side: 'SELL', qty: 2, price: '40', at: '2025-11-21T10:05:00', broker: 'dhan', expiry: '2025-11-25' }) };
    const { roundTrips } = buildRoundTrips(mergeFills([[buy, sell1, sell2]]).fills, '2025-11-21' as IstDate);
    expect(roundTrips[0]!.grossPnlPaise).toBe(12_000 - 10_000);
  });

  it('reported_charges_replace_estimates', () => {
    const tb: Fill[] = [dated('BUY', 65, '10', '2025-11-20'), dated('SELL', 65, '12', '2025-11-20')];
    const r = analyze({ tradebooks: [tb], reportedCharges: [{ broker: 'angelone', records: [{ broker: 'angelone', id: 'T1', date: '2025-11-20' as IstDate, charges: charges(4321) }] }], rates: RATES, siteUrl: SITE });
    expect(r.totals).toMatchObject({ source: 'BROKER', netPnlPaise: 65 * 200 - 4321 });
    expect(r.totals.charges!.total).toBe(4321);
    expect(r.cards.theNumber.status === 'OK' && r.cards.theNumber.data.estimated).toBe(false);
  });

  it('mixed_brokers_label_charges_mixed', () => {
    const z = [fill({ side: 'BUY', qty: 65, price: '10', at: '2025-11-20T10:00:00' }), fill({ side: 'SELL', qty: 65, price: '12', at: '2025-11-20T10:05:00' })];
    const a = [dated('BUY', 65, '10', '2025-11-20'), dated('SELL', 65, '12', '2025-11-20')];
    const r = analyze({ tradebooks: [z, a], reportedCharges: [{ broker: 'angelone', records: [{ broker: 'angelone', id: 'T1', date: '2025-11-20' as IstDate, charges: charges(1000) }] }], rates: RATES, siteUrl: SITE });
    expect(r.totals.source).toBe('MIXED');
    expect(r.totals.charges!.total).toBe(1000 + calculateCharges(z, RATES).total);
  });

  it('time_cards_hidden_without_trade_times', () => {
    const tb = Array.from({ length: 25 }, (_, i) => {
      const day = `2025-11-${String((i % 20) + 1).padStart(2, '0')}`;
      return [dated('BUY', 65, '10', day, 'angelone', `b${i}`), dated('SELL', 65, i % 3 ? '12' : '8', day, 'angelone', `s${i}`)];
    }).flat();
    const r = analyze({ tradebooks: [tb], reportedCharges: [{ broker: 'angelone', records: [] }], rates: RATES, siteUrl: SITE });
    for (const card of [r.cards.yourClock, r.cards.revengeTrades, r.cards.holdingTime, r.cards.busyDays, r.cards.buyerVsSeller]) {
      expect(card).toMatchObject({ status: 'INSUFFICIENT_DATA', code: 'NO_TRADE_TIMES' });
    }
    expect(r.cards.rightButBroke.status).toBe('OK');
    expect(r.warnings.join(' ')).toMatch(/no trade times/);
  });

  it('upstox_brokerage_groups_same_second_fills', () => {
    const at = '2026-09-22T10:00:00';
    const up = (price: string, when = at) => fill({ side: 'BUY', qty: 75, price, at: when, broker: 'upstox', orderId: null, symbol: 'NIFTY2692223600CE', expiry: '2026-09-22' });
    // Two fills in the same second = one order (₹20); a third a second later = another order.
    expect(calculateCharges([up('10'), up('10.05'), up('10', '2026-09-22T10:00:01')], RATES).brokerage).toBe(2 * 2000);
  });
});

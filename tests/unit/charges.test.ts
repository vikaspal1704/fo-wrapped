import { describe, expect, it } from 'vitest';
import { ChargesUnavailableError, RATES, calculateCharges } from '../../src/engine';
import { fill } from './helpers';

const opt = (side: 'BUY' | 'SELL', qty: number, price: string, at: string, orderId?: string) =>
  fill({ side, qty, price, at, symbol: 'NIFTY2692223600CE', expiry: '2026-09-22', ...(orderId ? { orderId } : {}) });
const fut = (side: 'BUY' | 'SELL', qty: number, price: string, at: string, orderId?: string) =>
  fill({ side, qty, price, at, symbol: 'NIFTY26SEPFUT', expiry: '2026-09-29', ...(orderId ? { orderId } : {}) });

describe('charges', () => {
  it('hand_worked_option_round_trip', () => {
    // Buy 65 @ ₹100, sell 65 @ ₹120 on 2026-09-22 (post-Budget-2026 STT):
    // brokerage 2 × ₹20 = 4000; STT 0.15% × 780000 = 1170;
    // txn 0.03503% × 1430000 = 500.93 → 501; SEBI 1.43 → 1;
    // stamp 0.003% × 650000 = 19.5 → 20; GST 18% × 4502 = 810.36 → 810.
    const c = calculateCharges([opt('BUY', 65, '100', '2026-09-22T10:00:00'), opt('SELL', 65, '120', '2026-09-22T10:30:00')], RATES);
    expect(c).toEqual({ brokerage: 4000, stt: 1170, exchangeTxn: 501, sebi: 1, stampDuty: 20, gst: 810, other: 0, total: 6502 });
  });

  it('brokerage_options_per_executed_order', () => {
    const fills = [
      opt('BUY', 150, '100', '2025-11-20T10:00:00', 'O1'),
      opt('BUY', 150, '110', '2025-11-20T10:05:00', 'O2'),
      opt('SELL', 120, '120', '2025-11-20T10:20:00', 'O3'),
      opt('SELL', 80, '120', '2025-11-20T10:20:00', 'O3'),
      opt('SELL', 250, '90', '2025-11-20T10:30:00', 'O4'),
      opt('BUY', 150, '80', '2025-11-20T10:40:00', 'O5'),
    ];
    expect(calculateCharges(fills, RATES).brokerage).toBe(5 * 2000);
  });

  it('brokerage_futures_capped', () => {
    // 75 × ₹100 = ₹7,500 → 0.03% = ₹2.25; 75 × ₹24,000 → ₹540, capped at ₹20.
    expect(calculateCharges([fut('BUY', 75, '100', '2026-09-22T10:00:00')], RATES).brokerage).toBe(225);
    expect(calculateCharges([fut('BUY', 75, '24000', '2026-09-22T10:00:00')], RATES).brokerage).toBe(2000);
  });

  it('brokerage_order_split_across_days_charged_per_day', () => {
    const c = calculateCharges([opt('BUY', 65, '10', '2026-09-21T15:00:00', 'X'), opt('BUY', 65, '10', '2026-09-22T09:20:00', 'X')], RATES);
    expect(c.brokerage).toBe(2 * 2000);
  });

  it('stt_on_sell_side_only', () => {
    expect(calculateCharges([opt('BUY', 100, '100', '2026-09-22T10:00:00')], RATES).stt).toBe(0);
    expect(calculateCharges([opt('SELL', 100, '100', '2026-09-22T10:00:00')], RATES).stt).toBe(1500);
  });

  it('stamp_duty_on_buy_side_only', () => {
    expect(calculateCharges([opt('SELL', 100, '100', '2026-09-22T10:00:00')], RATES).stampDuty).toBe(0);
    expect(calculateCharges([opt('BUY', 100, '100', '2026-09-22T10:00:00')], RATES).stampDuty).toBe(30);
  });

  it('gst_base_is_brokerage_exchange_sebi', () => {
    const c = calculateCharges([opt('SELL', 1000, '500', '2026-09-22T10:00:00')], RATES);
    expect(c.gst).toBe(Math.round(0.18 * (c.brokerage + c.exchangeTxn + c.sebi)));
    expect(c.total).toBe(c.brokerage + c.stt + c.exchangeTxn + c.sebi + c.stampDuty + c.gst);
  });

  it('uses_rate_window_for_trade_date', () => {
    // Premium ₹10,000 sold either side of the 2026-04-01 STT change.
    expect(calculateCharges([opt('SELL', 100, '100', '2026-03-31T10:00:00')], RATES).stt).toBe(1000);
    expect(calculateCharges([opt('SELL', 100, '100', '2026-04-01T10:00:00')], RATES).stt).toBe(1500);
    expect(calculateCharges([fut('SELL', 75, '20000', '2026-03-31T10:00:00')], RATES).stt).toBe(30000);
    expect(calculateCharges([fut('SELL', 75, '20000', '2026-04-01T10:00:00')], RATES).stt).toBe(75000);
  });

  it('uses_index_rate_for_bse_index_options', () => {
    const sensex = fill({ side: 'BUY', qty: 20, price: '100', at: '2026-09-10T10:00:00', symbol: 'SENSEX2691074900CE', exchange: 'BSE', expiry: '2026-09-10' });
    // 0.0325% × 200000 = 65
    expect(calculateCharges([sensex], RATES).exchangeTxn).toBe(65);
  });

  it('missing_rate_window_throws', () => {
    expect(() => calculateCharges([opt('BUY', 65, '10', '2024-09-30T10:00:00')], RATES)).toThrow(ChargesUnavailableError);
    const bseFut = fill({ side: 'BUY', qty: 20, price: '80000', at: '2026-09-10T10:00:00', symbol: 'SENSEX26SEPFUT', exchange: 'BSE', expiry: '2026-09-24' });
    expect(() => calculateCharges([bseFut], RATES)).toThrow(ChargesUnavailableError);
  });
});

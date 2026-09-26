import { describe, expect, it } from 'vitest';
import { RATES, computeExtraCards, parseIstDateTime, parseSymbol } from '../../src/engine';
import type { IstDate, Paise, RoundTrip, Totals } from '../../src/engine';
import { MIN } from './helpers';

let id = 0;
interface Spec {
  pnl: number; // rupees
  day?: string; // exit date (entered 10:00, held 10 min)
  symbol?: string;
  exchange?: 'NSE' | 'BSE';
  expiry?: string;
  side?: 'LONG' | 'SHORT';
  qty?: number;
  entry?: number; // rupees
}
function rt(s: Spec): RoundTrip {
  const day = s.day ?? '2025-11-20';
  const entryAt = parseIstDateTime(`${day}T10:00:00`)!;
  const qty = s.qty ?? 75;
  return {
    id: ++id,
    instrument: parseSymbol(s.symbol ?? 'NIFTY25NOV24000CE', s.exchange ?? 'NSE', (s.expiry ?? '2025-11-25') as IstDate),
    side: s.side ?? 'LONG',
    entryAt,
    exitAt: entryAt + 10 * MIN,
    exitDate: day as IstDate,
    exitKind: 'TRADE',
    qty,
    avgEntryPaise: (s.entry ?? 100) * 100,
    avgExitPaise: 0,
    grossPnlPaise: (s.pnl * 100) as Paise,
    holdingMs: 10 * MIN,
    fillIds: [],
  };
}
const totals = (chargesPaise: number | null): Totals => ({
  source: 'ESTIMATED',
  grossPnlPaise: 0 as Paise,
  charges:
    chargesPaise === null
      ? null
      : { brokerage: chargesPaise as Paise, stt: 0 as Paise, exchangeTxn: 0 as Paise, sebi: 0 as Paise, stampDuty: 0 as Paise, gst: 0 as Paise, total: chargesPaise as Paise },
  netPnlPaise: null,
  chargesUnavailableReason: chargesPaise === null ? 'no rates' : null,
  excludedUnclosedCount: 0,
});
const cards = (rts: RoundTrip[], charges: number | null = 0) => computeExtraCards({ roundTrips: rts, totals: totals(charges), indexUnderlyings: RATES.indexUnderlyings });
function data<T>(c: { status: string; data?: T }): T {
  expect(c.status).toBe('OK');
  return c.data as T;
}

describe('extra cards', () => {
  it('card_buyer_vs_seller', () => {
    const rts = [rt({ pnl: 100 }), rt({ pnl: -300 }), rt({ pnl: 50 }), rt({ pnl: 200, side: 'SHORT' }), rt({ pnl: -20, side: 'SHORT' }), rt({ pnl: 999, symbol: 'NIFTY25NOVFUT' })];
    expect(data(cards(rts).buyerVsSeller)).toEqual({ buyerPnlPaise: -15_000, buyerTrades: 3, sellerPnlPaise: 18_000, sellerTrades: 2 });
  });

  it('card_buyer_vs_seller_needs_both_sides', () => {
    const c = cards(Array.from({ length: 6 }, () => rt({ pnl: 10 }))).buyerVsSeller;
    expect(c).toMatchObject({ status: 'INSUFFICIENT_DATA', reason: 'All your option trades started with a buy.' });
  });

  it('card_underlyings_best_worst_and_split', () => {
    const rts = [
      rt({ pnl: 500 }),
      rt({ pnl: -100 }),
      rt({ pnl: -800, symbol: 'SENSEX25N2080000CE', exchange: 'BSE', expiry: '2025-11-20' }),
      rt({ pnl: 300, symbol: 'RELIANCE25NOV1500CE' }),
    ];
    expect(data(cards(rts).underlyings)).toEqual({
      best: { underlying: 'NIFTY', trades: 2, pnlPaise: 40_000 },
      worst: { underlying: 'SENSEX', trades: 1, pnlPaise: -80_000 },
      split: { indexPnlPaise: -40_000, indexTrades: 3, stockPnlPaise: 30_000, stockTrades: 1 },
    });
  });

  it('card_underlyings_single_underlying_insufficient', () => {
    expect(cards([rt({ pnl: 1 }), rt({ pnl: 2 })]).underlyings.status).toBe('INSUFFICIENT_DATA');
  });

  it('card_busy_days_split_by_median', () => {
    // Daily trade counts: 1,1,1,1,2,2,3,3 → median 1.5 → rounded half up to 2; busy = 3-trade days.
    const counts = [1, 1, 1, 1, 2, 2, 3, 3];
    const rts = counts.flatMap((n, d) => Array.from({ length: n }, () => rt({ pnl: n === 3 ? -100 : 50, day: `2025-11-${String(d + 3).padStart(2, '0')}` })));
    const d = data(cards(rts).busyDays);
    expect(d).toMatchObject({ busyThreshold: 2, busyDays: 2, otherDays: 6 });
    expect(d.busyAvgPnlPaise).toBe(-30_000);
    expect(d.otherAvgPnlPaise).toBe((4 * 5000 + 2 * 10_000) / 6);
  });

  it('card_weekday_best_worst_min_trades', () => {
    // 2025-11-17 is a Monday.
    const rts = [
      ...Array.from({ length: 3 }, () => rt({ pnl: 100, day: '2025-11-17' })), // Mon +300
      ...Array.from({ length: 4 }, () => rt({ pnl: -50, day: '2025-11-18' })), // Tue −200
      ...Array.from({ length: 3 }, () => rt({ pnl: 20, day: '2025-11-19' })), //  Wed +60
      rt({ pnl: 5000, day: '2025-11-21' }), //                                 Fri, only 1 trade
    ];
    const d = data(cards(rts).weekday);
    expect(d.days.map((x) => x.weekday)).toEqual(['Mon', 'Tue', 'Wed', 'Fri']);
    expect(d.best?.weekday).toBe('Mon'); // Friday is higher but has < 3 trades
    expect(d.worst?.weekday).toBe('Tue');
  });

  it('card_position_size_split_by_median_entry_value', () => {
    const small = Array.from({ length: 5 }, (_, i) => rt({ pnl: i < 4 ? 50 : -50, qty: 75, entry: 100 }));
    const big = Array.from({ length: 5 }, (_, i) => rt({ pnl: i < 1 ? 500 : -400, qty: 300, entry: 100 }));
    const d = data(cards([...small, ...big]).positionSize);
    expect(d.small).toEqual({ trades: 5, avgPnlPaise: 3000, winRate: 0.8 });
    expect(d.big).toEqual({ trades: 5, avgPnlPaise: -22_000, winRate: 0.2 });
  });

  it('card_charges_drag_wins_to_cover', () => {
    const rts = [rt({ pnl: 1000 }), rt({ pnl: 3000 }), rt({ pnl: -500 }), rt({ pnl: -500 })];
    // Charges ₹6,000; average win ₹2,000 → 3 average wins; ₹1,500 per trade.
    expect(data(cards(rts, 600_000).chargesDrag)).toEqual({ chargesPaise: 600_000, avgWinPaise: 200_000, winsToCover: 3, chargesPerTradePaise: 150_000 });
  });

  it('card_charges_drag_needs_charges', () => {
    expect(cards([rt({ pnl: 10 })], null).chargesDrag).toMatchObject({ status: 'INSUFFICIENT_DATA', reason: 'no rates' });
  });
});

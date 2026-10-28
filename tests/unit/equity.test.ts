/** Equity in the Trade Journal (docs/SPEC.md US-3.1). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConflictingDuplicateError,
  EQUITY_RATES,
  RowValidationError,
  UnsupportedSegmentError,
  analyzeEquity,
  parseEquityTradebookRows,
  planEquityImport,
  readBrokerFile,
  withLocaleSync,
  type EquityFill,
  type EquityRateTable,
} from '../../src/engine';
import { violations } from './noAdviceList';

const FIXTURE = join(__dirname, '../fixtures/zerodha-eq-tradebook.synthetic.csv');
const GOLDEN = join(__dirname, '../golden/zerodha-eq-tradebook.synthetic.csv.json');
const HEADER = 'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const rows = (...lines: string[]) => lines.map((l) => l.split(','));

let seq = 0;
/** A row: symbol, side, qty, price, date, time, plus optional exchange/series/ids. */
function row(o: { sym?: string; isin?: string; side: 'buy' | 'sell'; qty: number; price: string; date: string; time: string; exchange?: string; series?: string; tradeId?: string; orderId?: string }): string {
  const n = ++seq;
  return [o.sym ?? 'TESTA', o.isin ?? 'INE0TESTA001', o.date, o.exchange ?? 'NSE', 'EQ', o.series ?? 'EQ', o.side, 'false', String(o.qty), o.price, o.tradeId ?? String(9_000_000 + n), o.orderId ?? String(1_300_000_000_000_000 + n), `${o.date}T${o.time}`].join(',');
}
const fills = (...lines: string[]): EquityFill[] => parseEquityTradebookRows('eq.csv', rows(HEADER, ...lines));

describe('equity tradebook parsing (AC-3.1.1, AC-3.1.2)', () => {
  it('equity_tradebook_parses', async () => {
    const got = await readBrokerFile('eq.csv', bytes(readFileSync(FIXTURE, 'utf8')), { equity: true });
    expect(got.kind).toBe('equity');
    if (got.kind !== 'equity') return;
    expect(got.fills).toHaveLength(10);
    expect(got.fills[5]).toMatchObject({ symbol: 'TESTA', isin: 'INE0TESTA001', exchange: 'BSE', series: 'A', side: 'BUY', qty: 3, pricePaise: 10500, valuePaise: 31500, tradeDate: '2026-10-07', orderId: '1700000000000000106', sourceRow: 7 });
    expect(got.fills[5]!.executedAt).toBe(Date.UTC(2026, 9, 7, 4, 30, 0));
  });

  it('equity_tradebook_rejects_bad_rows', () => {
    const bad = (field: string, line: string) => {
      try {
        fills(row({ side: 'buy', qty: 1, price: '1', date: '2026-10-05', time: '09:30:00' }), line);
      } catch (e) {
        expect(e).toBeInstanceOf(RowValidationError);
        expect((e as RowValidationError).row).toBe(3);
        expect((e as RowValidationError).field).toBe(field);
        return;
      }
      throw new Error(`expected ${field} to be rejected`);
    };
    bad('isin', row({ isin: 'US0378331005', side: 'buy', qty: 1, price: '1', date: '2026-10-05', time: '09:30:00' }));
    bad('isin', row({ isin: '', side: 'buy', qty: 1, price: '1', date: '2026-10-05', time: '09:30:00' }));
    bad('quantity', row({ side: 'buy', qty: 1.5, price: '1', date: '2026-10-05', time: '09:30:00' }));
    bad('price', row({ side: 'buy', qty: 1, price: '1.005', date: '2026-10-05', time: '09:30:00' }));
    bad('trade_id', row({ side: 'buy', qty: 1, price: '1', date: '2026-10-05', time: '09:30:00', tradeId: 'X1' }));
    bad('order_execution_time', row({ side: 'buy', qty: 1, price: '1', date: '2026-10-05', time: '9:30' }));
  });

  it('wrapped_still_refuses_equity', async () => {
    await expect(readBrokerFile('eq.csv', bytes(readFileSync(FIXTURE, 'utf8')))).rejects.toThrow(UnsupportedSegmentError);
  });

  it('rejects_currency_and_commodity_tradebooks', async () => {
    const fo = `${HEADER},expiry_date`;
    for (const [segment, label] of [
      ['CDS', /Currency/],
      ['MCX', /Commodity/],
    ] as const) {
      const text = `${fo}\nUSDINR26OCTFUT,,2026-10-05,NSE,${segment},,buy,false,1.000000,84.000000,1,2,2026-10-05T10:00:00,2026-10-29\n`;
      for (const opts of [{}, { equity: true }]) {
        await expect(readBrokerFile('x.csv', bytes(text), opts)).rejects.toThrow(UnsupportedSegmentError);
        await expect(readBrokerFile('x.csv', bytes(text), opts)).rejects.toMatchObject({ userMessage: expect.stringMatching(label) });
      }
    }
  });
});

describe('equity P&L (AC-3.1.3 to AC-3.1.6)', () => {
  it('equity_splits_intraday_and_delivery', () => {
    // Buys 10 then 5, sells 8 the same day: the first 8 bought are intraday; 2 + 5 stay held.
    const s = analyzeEquity(
      fills(
        row({ side: 'buy', qty: 10, price: '100', date: '2026-10-05', time: '09:30:00' }),
        row({ side: 'buy', qty: 5, price: '102', date: '2026-10-05', time: '10:00:00' }),
        row({ side: 'sell', qty: 8, price: '101', date: '2026-10-05', time: '11:00:00' }),
      ),
      EQUITY_RATES,
    )!;
    expect(s.intraday).toEqual([{ isin: 'INE0TESTA001', symbol: 'TESTA', date: '2026-10-05', qty: 8, buyValuePaise: 80000, sellValuePaise: 80800, pnlPaise: 800 }]);
    expect(s.sales).toEqual([]);
    expect(s.holdings).toEqual([{ isin: 'INE0TESTA001', symbol: 'TESTA', qty: 7, costPaise: 71000, avgPricePaise: 71000 / 7, firstBought: '2026-10-05' }]);
    expect(s.dpStockDays).toBe(0);
  });

  it('equity_intraday_short_first', () => {
    const s = analyzeEquity(
      fills(
        row({ side: 'sell', qty: 4, price: '200', date: '2026-10-08', time: '09:45:00' }),
        row({ side: 'buy', qty: 4, price: '190', date: '2026-10-08', time: '10:15:00' }),
      ),
      EQUITY_RATES,
    )!;
    expect(s.intradayPnlPaise).toBe(4000);
    expect(s.unmatched).toEqual([]);
    expect(s.holdings).toEqual([]);
  });

  it('equity_delivery_fifo_realises_on_sale_date', () => {
    const s = analyzeEquity(
      fills(
        row({ side: 'buy', qty: 10, price: '100', date: '2026-01-05', time: '09:30:00' }),
        row({ side: 'buy', qty: 10, price: '120', date: '2026-03-05', time: '09:30:00', exchange: 'BSE', series: 'A' }),
        row({ side: 'sell', qty: 5, price: '130', date: '2026-04-01', time: '10:00:00' }),
        row({ side: 'sell', qty: 10, price: '90', date: '2026-06-01', time: '10:00:00' }),
      ),
      EQUITY_RATES,
    )!;
    expect(s.sales).toEqual([
      { isin: 'INE0TESTA001', symbol: 'TESTA', date: '2026-04-01', qty: 5, costPaise: 50000, proceedsPaise: 65000, pnlPaise: 15000, boughtFrom: '2026-01-05', boughtTo: '2026-01-05' },
      { isin: 'INE0TESTA001', symbol: 'TESTA', date: '2026-06-01', qty: 10, costPaise: 110000, proceedsPaise: 90000, pnlPaise: -20000, boughtFrom: '2026-01-05', boughtTo: '2026-03-05' },
    ]);
    expect(s.deliveryPnlPaise).toBe(-5000);
    // NSE and BSE share the holding: 5 left from the BSE buy.
    expect(s.holdings).toMatchObject([{ qty: 5, costPaise: 60000, firstBought: '2026-03-05' }]);
    expect(s.dpStockDays).toBe(2);
  });

  it('equity_unmatched_sales_are_shown_not_guessed', () => {
    const s = analyzeEquity(
      fills(
        row({ side: 'buy', qty: 3, price: '100', date: '2026-10-05', time: '09:30:00' }),
        row({ side: 'sell', qty: 5, price: '110', date: '2026-10-06', time: '09:30:00' }),
      ),
      EQUITY_RATES,
    )!;
    // Only the 3 shares the file shows bought are in P&L; the other 2 are listed, never priced.
    expect(s.sales).toMatchObject([{ qty: 3, costPaise: 30000, proceedsPaise: 33000, pnlPaise: 3000 }]);
    expect(s.unmatched).toEqual([{ isin: 'INE0TESTA001', symbol: 'TESTA', date: '2026-10-06', qty: 2 }]);
    expect(s.deliveryPnlPaise).toBe(3000);
  });

  it('equity_holdings_at_cost', () => {
    const s = analyzeEquity(fills(row({ side: 'buy', qty: 3, price: '33.35', date: '2026-10-05', time: '09:30:00' })), EQUITY_RATES)!;
    expect(s.holdings).toEqual([{ isin: 'INE0TESTA001', symbol: 'TESTA', qty: 3, costPaise: 10005, avgPricePaise: 3335, firstBought: '2026-10-05' }]);
    expect(Object.keys(s.holdings[0]!)).not.toContain('marketValuePaise');
  });
});

describe('equity charges (AC-3.1.7 to AC-3.1.9)', () => {
  it('equity_charges_follow_dated_rates', () => {
    // One delivery buy of ₹1,00,000 on NSE: STT 100, exchange 2.97, stamp 15, GST on exchange.
    const s = analyzeEquity(fills(row({ side: 'buy', qty: 1000, price: '100', date: '2026-10-05', time: '09:30:00' })), EQUITY_RATES)!;
    expect(s.charges).toEqual({
      available: true,
      breakdown: { brokerage: 0, stt: 10000, exchangeTxn: 297, sebi: 10, stampDuty: 1500, gst: 55, other: 0, total: 11862 },
      intradayBrokerageWithGstPaise: 0,
    });
  });

  it('equity_charges_unavailable_outside_windows', () => {
    const before = analyzeEquity(fills(row({ side: 'buy', qty: 1, price: '100', date: '2024-09-30', time: '09:30:00' })), EQUITY_RATES)!;
    expect(before.charges).toMatchObject({ available: false, reason: expect.stringContaining('2024-09-30') });
    const groupT = analyzeEquity(fills(row({ side: 'buy', qty: 1, price: '100', date: '2026-10-05', time: '09:30:00', exchange: 'BSE', series: 'T' })), EQUITY_RATES)!;
    expect(groupT.charges).toMatchObject({ available: false, reason: expect.stringContaining('BSE group T') });
    // P&L is still there.
    expect(groupT.holdings).toHaveLength(1);
  });

  it('equity_intraday_brokerage_gap_is_stated', () => {
    // ₹1,00,000 bought and sold the same day, in two orders: brokerage ₹20 each (cap), GST on it.
    const s = analyzeEquity(
      fills(
        row({ side: 'buy', qty: 1000, price: '100', date: '2026-10-05', time: '09:30:00' }),
        row({ side: 'sell', qty: 1000, price: '100', date: '2026-10-05', time: '10:30:00' }),
      ),
      EQUITY_RATES,
    )!;
    if (!s.charges.available) throw new Error('expected charges');
    expect(s.charges.breakdown.brokerage).toBe(4000);
    // GST on (4000 + 594 + 20) = 830.52 → 831; without brokerage 110.52 → 111; so 4000 + 720.
    expect(s.charges.intradayBrokerageWithGstPaise).toBe(4720);
  });

  it('equity_dp_charges_shown_as_gap', () => {
    const s = analyzeEquity(
      fills(
        row({ side: 'buy', qty: 10, price: '100', date: '2026-10-05', time: '09:30:00' }),
        row({ side: 'sell', qty: 4, price: '100', date: '2026-10-06', time: '09:30:00' }),
        row({ side: 'sell', qty: 4, price: '100', date: '2026-10-06', time: '11:30:00' }),
        row({ side: 'sell', qty: 2, price: '100', date: '2026-10-07', time: '09:30:00' }),
      ),
      EQUITY_RATES,
    )!;
    // Two sale days of one stock: two DP charges, never priced, and none in the total.
    expect(s.dpStockDays).toBe(2);
    if (!s.charges.available) throw new Error('expected charges');
    expect(s.charges.breakdown.other).toBe(0);
  });

  it('equity_golden_totals_match', async () => {
    const got = await readBrokerFile('eq.csv', bytes(readFileSync(FIXTURE, 'utf8')), { equity: true });
    if (got.kind !== 'equity') throw new Error('expected equity');
    const s = analyzeEquity(got.fills, EQUITY_RATES)!;
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    expect(s.trades).toBe(golden.trades);
    expect(s.intradayPnlPaise).toBe(golden.intradayPnlPaise);
    expect(s.deliveryPnlPaise).toBe(golden.deliveryPnlPaise);
    expect(s.unmatched.map(({ symbol, date, qty }) => ({ symbol, date, qty }))).toEqual(golden.unmatched);
    expect(s.holdings.map(({ symbol, qty, costPaise }) => ({ symbol, qty, costPaise }))).toEqual(golden.holdings);
    expect(s.dpStockDays).toBe(golden.dpStockDays);
    if (!s.charges.available) throw new Error(s.charges.reason);
    expect(s.charges.breakdown).toEqual(golden.charges);
    expect(s.charges.intradayBrokerageWithGstPaise).toBe(golden.intradayBrokerageWithGstPaise);
  });

  it('every equity rate window is dated and sourced', () => {
    const t: EquityRateTable = EQUITY_RATES;
    const windows = [t.intradayBrokerage, t.stt.intradaySell, t.stt.delivery, t.exchangeTxn.NSE, t.exchangeTxn.BSE, t.sebi, t.stampDutyBuy.intraday, t.stampDutyBuy.delivery, t.gst].flat();
    for (const w of windows) expect(w).toMatchObject({ effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), source: expect.any(String) });
  });
});

describe('equity imports (AC-3.1.10)', () => {
  const base = fills(row({ side: 'buy', qty: 1, price: '100', date: '2026-10-05', time: '09:30:00', tradeId: '77' }));

  it('equity_import_dedupes', () => {
    const again = planEquityImport(base, [...base, ...fills(row({ side: 'sell', qty: 1, price: '101', date: '2026-10-06', time: '09:30:00', tradeId: '78' }))]);
    expect(again.duplicates).toBe(1);
    expect(again.added.map((f) => f.tradeId)).toEqual(['78']);
    // Same trade ID on the other exchange is a different trade.
    const bse = fills(row({ side: 'buy', qty: 1, price: '100', date: '2026-10-05', time: '09:30:00', tradeId: '77', exchange: 'BSE', series: 'A' }));
    expect(planEquityImport(base, bse).added).toHaveLength(1);
  });

  it('equity_import_rejects_conflicts', () => {
    const changed = fills(row({ side: 'buy', qty: 2, price: '100', date: '2026-10-05', time: '09:30:00', tradeId: '77' }));
    expect(() => planEquityImport(base, changed)).toThrow(ConflictingDuplicateError);
  });
});

describe('equity copy (AC-3.1.13)', () => {
  it('equity_copy_passes_no_advice_check', () => {
    const groupT = fills(row({ side: 'buy', qty: 1, price: '100', date: '2024-09-30', time: '09:30:00', exchange: 'BSE', series: 'T' }));
    for (const l of ['en', 'hi'] as const) {
      const charges = withLocaleSync(l, () => analyzeEquity(groupT, EQUITY_RATES)!.charges);
      if (charges.available) throw new Error('expected a reason');
      expect(violations(charges.reason)).toEqual([]);
    }
  });
});

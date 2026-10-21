/**
 * Phase 0 edge cases (docs/SPEC.md US-0.4). Each test is named after its
 * acceptance criterion's test column.
 */
import { describe, expect, it } from 'vitest';
import { analyze, buildRoundTrips, calculateCharges, RATES, samvatLabel } from '../../src/engine';
import type { ChargeRateTable, IstDate, Paise, PnlStatement, Rational, RateWindow } from '../../src/engine';
import { fill } from './helpers';

const SITE = 'https://example.invalid/';

describe('edge cases (SPEC US-0.4)', () => {
  it('exercised_option_is_excluded_not_valued', () => {
    // AC-0.4.2: bought, never sold, expired (exercised or lapsed): no closing trade.
    const exercised = fill({ side: 'BUY', qty: 75, price: '100.00', at: '2025-11-20T10:00:00' });
    // A later trade moves "as of" past the option's expiry (2025-11-25).
    const later = [
      fill({ side: 'BUY', qty: 75, price: '50.00', at: '2025-11-27T10:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
      fill({ side: 'SELL', qty: 75, price: '60.00', at: '2025-11-27T11:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
    ];
    const r = analyze({ tradebooks: [[exercised, ...later]], rates: RATES, siteUrl: SITE });
    expect(r.unclosed.map((u) => [u.instrument.tradingSymbol, u.status])).toEqual([['NIFTY25NOV24000CE', 'SETTLED_AT_EXPIRY']]);
    expect(r.totals.excludedUnclosedCount).toBe(1);
    // Only the closed December trade is in P&L; nothing is invented for the exercised option.
    expect(r.totals.grossPnlPaise).toBe(75 * 1000);
    expect(r.warnings.join(' ')).toContain('1 position expired without a closing trade and isn’t counted in P&L');
  });

  it('carry_forward_round_trip_counts_on_exit_day', () => {
    // AC-0.4.4: bought on Monday, sold on Tuesday.
    const buy = fill({ side: 'BUY', qty: 65, price: '100.00', at: '2026-05-04T14:00:00', symbol: 'NIFTY26MAY24000CE', expiry: '2026-05-26' });
    const sell = fill({ side: 'SELL', qty: 65, price: '110.00', at: '2026-05-05T10:00:00', symbol: 'NIFTY26MAY24000CE', expiry: '2026-05-26' });
    const { roundTrips } = buildRoundTrips([buy, sell], '2026-05-05' as IstDate);
    expect(roundTrips).toHaveLength(1);
    expect(roundTrips[0]!.exitDate).toBe('2026-05-05');
    expect(roundTrips[0]!.grossPnlPaise).toBe(65 * 1000);
    // Buy-side charges fall on the buy day, sell-side charges on the sell day.
    const day1 = calculateCharges([buy], RATES);
    const day2 = calculateCharges([sell], RATES);
    expect(day1.stampDuty).toBeGreaterThan(0);
    expect(day1.stt).toBe(0);
    expect(day2.stt).toBeGreaterThan(0);
    expect(day2.stampDuty).toBe(0);
    // Charges are rounded per day, so the two days add up to the whole.
    expect(day1.total + day2.total).toBe(calculateCharges([buy, sell], RATES).total);
  });

  it('intraday_and_carry_forward_share_one_fifo_queue', () => {
    // AC-0.4.5: no MIS/NRML column, so one FIFO queue per contract.
    const s = { symbol: 'NIFTY26MAY24000CE', expiry: '2026-05-26' };
    const carried = fill({ side: 'BUY', qty: 65, price: '100.00', at: '2026-05-04T14:00:00', ...s });
    const intradayBuy = fill({ side: 'BUY', qty: 65, price: '110.00', at: '2026-05-05T09:20:00', ...s });
    const sell = fill({ side: 'SELL', qty: 65, price: '120.00', at: '2026-05-05T09:40:00', ...s });
    const { roundTrips, unclosed } = buildRoundTrips([carried, intradayBuy, sell], '2026-05-05' as IstDate);
    // The sell closed the older (carried) lot: ₹20 × 65 realised, as a partial round trip.
    expect(roundTrips.map((r) => [r.partial, r.qty, r.avgEntryPaise, r.grossPnlPaise])).toEqual([[true, 65, 10_000, 130_000]]);
    // The newer lot at ₹110 is what stays open.
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]!.qty).toBe(65);
    expect(unclosed[0]!.avgEntryPaise).toBe(11_000);
    expect(unclosed[0]!.status).toBe('OPEN');
  });

  it('samvat_boundary_on_muhurat_day', () => {
    // AC-0.4.8: Muhurat trading on 8 Nov 2026 starts Samvat 2083.
    expect(samvatLabel(['2026-11-07' as IstDate])).toBe('2082');
    expect(samvatLabel(['2026-11-08' as IstDate])).toBe('2083');
    expect(samvatLabel(['2026-11-07' as IstDate, '2026-11-08' as IstDate])).toBe('2082–83');
  });

  it('partly_closed_position_counts_realised_part', () => {
    // AC-0.4.10: 150 bought in two lots, 75 sold, never back to flat.
    const fills = [
      fill({ side: 'BUY', qty: 75, price: '100.00', at: '2025-11-20T10:00:00' }),
      fill({ side: 'BUY', qty: 75, price: '110.00', at: '2025-11-20T10:30:00' }),
      fill({ side: 'SELL', qty: 75, price: '120.00', at: '2025-11-20T11:00:00' }),
    ];
    const { roundTrips, unclosed } = buildRoundTrips(fills, '2025-11-20' as IstDate);
    expect(roundTrips).toHaveLength(1);
    expect(roundTrips[0]).toMatchObject({
      partial: true,
      side: 'LONG',
      qty: 75,
      avgEntryPaise: 10_000,
      avgExitPaise: 12_000,
      grossPnlPaise: 150_000,
      holdingMs: 3_600_000,
      exitDate: '2025-11-20',
      exitKind: 'TRADE',
    });
    // The rest stays open, dated from its own buy.
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]).toMatchObject({ qty: 75, avgEntryPaise: 11_000, openedAt: fills[1]!.executedAt, status: 'OPEN' });

    const r = analyze({ tradebooks: [fills], rates: RATES, siteUrl: SITE });
    expect(r.totals.grossPnlPaise).toBe(150_000);
    expect(r.warnings.join(' ')).toContain('1 position was partly closed: the closed part is counted, the rest isn’t.');
  });

  it('settled_remainder_plus_partial_equals_statement_row', () => {
    // AC-0.4.11: the remaining 75 expire worthless; the statement says −₹6,000 for the contract.
    const fills = [
      fill({ side: 'BUY', qty: 150, price: '100.00', at: '2025-11-20T10:00:00' }),
      fill({ side: 'SELL', qty: 75, price: '120.00', at: '2025-11-20T11:00:00' }),
      fill({ side: 'BUY', qty: 75, price: '50.00', at: '2025-11-27T10:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
      fill({ side: 'SELL', qty: 75, price: '60.00', at: '2025-11-27T11:00:00', symbol: 'NIFTY25DEC24000CE', expiry: '2025-12-30' }),
    ];
    const zero = 0 as Paise;
    const statement: PnlStatement = {
      broker: 'zerodha',
      periodFrom: '2025-11-01' as IstDate,
      periodTo: '2025-11-30' as IstDate,
      realizedPnlPaise: -525_000 as Paise,
      charges: { brokerage: zero, stt: zero, exchangeTxn: zero, sebi: zero, stampDuty: zero, gst: zero, other: zero, total: zero },
      otherCreditDebitPaise: zero,
      perSymbol: [
        { tradingSymbol: 'NIFTY25NOV24000CE', realizedPnlPaise: -600_000 as Paise, openQuantity: 0 },
        { tradingSymbol: 'NIFTY25DEC24000CE', realizedPnlPaise: 75_000 as Paise, openQuantity: 0 },
      ],
      unmappedHeads: [],
    };
    const r = analyze({ tradebooks: [fills], pnlStatements: [statement], rates: RATES, siteUrl: SITE });
    const nov = r.roundTrips.filter((t) => t.instrument.tradingSymbol === 'NIFTY25NOV24000CE');
    expect(nov.map((t) => [t.exitKind, t.partial, t.qty, t.grossPnlPaise])).toEqual([
      ['TRADE', true, 75, 150_000],
      ['EXPIRY', false, 75, -750_000],
    ]);
    expect(nov.reduce((sum, t) => sum + t.grossPnlPaise, 0)).toBe(-600_000);
    expect(r.unclosed).toEqual([]);
    expect(r.totals.grossPnlPaise).toBe(-525_000);
  });

  it('adjusted_contract_is_not_netted_with_original', () => {
    // AC-0.4.9: after a split the closing trade is in a different contract.
    const original = fill({ side: 'BUY', qty: 500, price: '20.00', at: '2025-11-03T10:00:00', symbol: 'RELIANCE25NOV1400CE', expiry: '2025-11-25' });
    const adjusted = fill({ side: 'SELL', qty: 1000, price: '10.50', at: '2025-11-10T10:00:00', symbol: 'RELIANCE25NOV700CE', expiry: '2025-11-25' });
    const { roundTrips, unclosed } = buildRoundTrips([original, adjusted], '2025-11-10' as IstDate);
    expect(roundTrips).toHaveLength(0);
    expect(unclosed.map((u) => [u.instrument.tradingSymbol, u.side]).sort()).toEqual([
      ['RELIANCE25NOV1400CE', 'LONG'],
      ['RELIANCE25NOV700CE', 'SHORT'],
    ]);
  });
});

describe('dated charge config (SPEC US-0.3)', () => {
  it('new_rate_window_applies_without_code_change', () => {
    // AC-0.3.3: a new SEBI fee from 2026-06-01 is a data change only.
    const rates = structuredClone(RATES) as ChargeRateTable;
    const sebi = rates.sebi as RateWindow<Rational>[];
    const current = sebi[sebi.length - 1]!;
    current.effectiveTo = '2026-05-31' as IstDate;
    sebi.push({ ...current, effectiveFrom: '2026-06-01' as IstDate, effectiveTo: undefined, value: { num: 2, den: 1_000_000 } });
    delete sebi[sebi.length - 1]!.effectiveTo;

    const s = { symbol: 'NIFTY26JUN24000CE', expiry: '2026-06-30' };
    const before = fill({ side: 'BUY', qty: 6500, price: '100.00', at: '2026-05-29T10:00:00', ...s });
    const after = fill({ side: 'BUY', qty: 6500, price: '100.00', at: '2026-06-02T10:00:00', ...s });
    expect(calculateCharges([before], rates).sebi).toBe(calculateCharges([before], RATES).sebi);
    expect(calculateCharges([after], rates).sebi).toBe(2 * calculateCharges([after], RATES).sebi);
  });
});

import { describe, expect, it } from 'vitest';
import {
  RowValidationError,
  UnknownInstrumentError,
  UnrecognizedFileError,
  UnsupportedSegmentError,
  decimalToPaise,
  parseSymbol,
  parseTradebook,
} from '../../src/engine';
import type { IstDate } from '../../src/engine';
import { HEADER, csv, csvRow } from './helpers';

function expectRowError(fn: () => unknown, row: number, field: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RowValidationError);
    expect((e as RowValidationError).row).toBe(row);
    expect((e as RowValidationError).field).toBe(field);
    return;
  }
  throw new Error('expected RowValidationError');
}

describe('tradebook parsing & validation', () => {
  it('parses_zerodha_csv_tradebook', () => {
    const fills = parseTradebook('tb.csv', csv(HEADER, csvRow(), csvRow({ trade_type: 'sell', trade_id: '2', price: '12.200000' })));
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({
      tradeId: '5200001',
      orderId: '1100000099000001',
      exchange: 'NSE',
      side: 'BUY',
      auction: false,
      qty: 65,
      pricePaise: 3125,
      tradeDate: '2026-09-22',
      executedAt: Date.UTC(2026, 8, 22, 4, 42, 0), // 10:12:00 IST
      sourceRow: 2,
    });
    expect(fills[0]!.instrument).toMatchObject({ underlying: 'NIFTY', kind: 'CE', strikePaise: 2360000 });
    expect(fills[1]!.side).toBe('SELL');
  });

  it('rejects_unrecognized_file', () => {
    expect(() => parseTradebook('x.csv', csv('name,amount', 'a,1'))).toThrow(UnrecognizedFileError);
  });

  it('rejects_equity_tradebook', () => {
    expect(() => parseTradebook('eq.csv', csv(HEADER, csvRow({ segment: 'EQ' })))).toThrow(UnsupportedSegmentError);
  });

  it('rejects_invalid_row_with_location', () => {
    const lines = [HEADER, ...Array.from({ length: 5 }, (_, i) => csvRow({ trade_id: String(i + 1) }))];
    lines.push(csvRow({ trade_id: '99', quantity: '-5' })); // line 7
    expectRowError(() => parseTradebook('tb.csv', csv(...lines)), 7, 'quantity');
  });

  it('parses_six_decimal_quantity_and_price', () => {
    const [f] = parseTradebook('tb.csv', csv(HEADER, csvRow({ quantity: '20.000000', price: '152.350000' })));
    expect(f).toMatchObject({ qty: 20, pricePaise: 15235 });
  });

  it('rejects_price_not_in_whole_paise', () => {
    expectRowError(() => parseTradebook('tb.csv', csv(HEADER, csvRow({ price: '10.123000' }))), 2, 'price');
  });

  it('rejects_fractional_quantity', () => {
    expectRowError(() => parseTradebook('tb.csv', csv(HEADER, csvRow({ quantity: '20.500000' }))), 2, 'quantity');
  });

  it('keeps_19_digit_order_id_exact', () => {
    const [f] = parseTradebook('tb.csv', csv(HEADER, csvRow({ order_id: '1799000000000000123' })));
    expect(f!.orderId).toBe('1799000000000000123');
  });

  it('ignores_trailing_blank_line', () => {
    expect(parseTradebook('tb.csv', csv(HEADER, csvRow(), ''))).toHaveLength(1);
  });

  it('parses_file_with_byte_order_mark', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new Uint8Array(csv(HEADER, csvRow()))]);
    expect(parseTradebook('tb.csv', bom.buffer)).toHaveLength(1);
  });

  it('rejects_blank_line_between_rows', () => {
    expectRowError(() => parseTradebook('tb.csv', csv(HEADER, csvRow(), '', csvRow({ trade_id: '2' }))), 3, 'row');
  });

  it('parses_price_to_paise_exactly', () => {
    expect(decimalToPaise('0.05')).toBe(5);
    expect(decimalToPaise('123.45')).toBe(12345);
    expect(decimalToPaise('19999.95')).toBe(1999995);
    expect(decimalToPaise('0.29')).toBe(29); // 0.29 * 100 = 28.999… in floating point
  });

  it('parses_times_as_ist_regardless_of_tz', () => {
    // The same assertion runs under TZ=America/New_York via `npm run test:tz`.
    const [f] = parseTradebook('tb.csv', csv(HEADER, csvRow({ order_execution_time: '2026-09-22T09:15:00' })));
    expect(f!.executedAt).toBe(Date.UTC(2026, 8, 22, 3, 45, 0));
  });
});

describe('symbols', () => {
  const d = (s: string) => s as IstDate;

  it('parses_weekly_option_symbol', () => {
    expect(parseSymbol('NIFTY24N2124000CE', 'NSE', d('2024-11-21'))).toMatchObject({
      underlying: 'NIFTY',
      kind: 'CE',
      strikePaise: 2400000,
      expiry: '2024-11-21',
    });
  });

  it('parses_bse_sensex_weekly_symbol', () => {
    expect(parseSymbol('SENSEX2691074900CE', 'BSE', d('2026-09-10'))).toMatchObject({
      key: 'BSE:SENSEX2691074900CE',
      underlying: 'SENSEX',
      kind: 'CE',
      strikePaise: 7490000,
      expiry: '2026-09-10',
    });
  });

  it('parses_monthly_option_symbol_with_expiry_column', () => {
    expect(parseSymbol('BANKNIFTY24NOV51000PE', 'NSE', d('2024-11-27'))).toMatchObject({
      underlying: 'BANKNIFTY',
      kind: 'PE',
      strikePaise: 5100000,
    });
  });

  it('parses_future_symbol', () => {
    expect(parseSymbol('NIFTY24NOVFUT', 'NSE', d('2024-11-28'))).toMatchObject({
      underlying: 'NIFTY',
      kind: 'FUT',
      strikePaise: null,
    });
  });

  it('parses_underlying_containing_digits', () => {
    expect(parseSymbol('NIFTYNXT5026O0668000CE', 'NSE', d('2026-10-06'))).toMatchObject({
      underlying: 'NIFTYNXT50',
      strikePaise: 6800000,
    });
  });

  it('rejects_monthly_symbol_without_expiry_source', () => {
    expect(() => parseTradebook('tb.csv', csv(HEADER, csvRow({ expiry_date: '' })))).toThrow(RowValidationError);
  });

  it('rejects_symbol_expiry_mismatch', () => {
    expect(() => parseSymbol('SENSEX2691074900CE', 'BSE', d('2026-09-17'))).toThrow(UnknownInstrumentError);
  });

  it('rejects_unknown_symbol_shape', () => {
    expect(() => parseSymbol('FOO123', 'NSE', d('2026-09-22'))).toThrow(UnknownInstrumentError);
  });
});

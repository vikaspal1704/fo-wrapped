import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIstDateTime, parseSymbol } from '../../src/engine';
import type { BrokerId, Exchange, Fill, IstDate, Paise } from '../../src/engine';

let seq = 0;

export interface FillSpec {
  side: 'BUY' | 'SELL';
  qty: number;
  /** Rupees as a decimal string, e.g. "120.50". */
  price: string;
  /** 'YYYY-MM-DDTHH:mm:ss' IST. */
  at: string;
  symbol?: string;
  exchange?: Exchange;
  expiry?: string;
  tradeId?: string;
  orderId?: string | null;
  broker?: BrokerId;
  timePrecision?: 'second' | 'date';
}

/** Builds a Fill directly (bypassing CSV) for engine tests. */
export function fill(spec: FillSpec): Fill {
  const n = ++seq;
  const exchange = spec.exchange ?? 'NSE';
  const expiry = (spec.expiry ?? '2025-11-25') as IstDate;
  const [rupees = '0', paise = ''] = spec.price.split('.');
  const qty = spec.qty;
  const pricePaise = (Number(rupees) * 100 + Number(paise.padEnd(2, '0'))) as Paise;
  return {
    broker: spec.broker ?? 'zerodha',
    tradeId: spec.tradeId ?? String(1000 + n),
    orderId: spec.orderId === undefined ? String(9000 + n) : spec.orderId,
    instrument: parseSymbol(spec.symbol ?? 'NIFTY25NOV24000CE', exchange, expiry),
    exchange,
    side: spec.side,
    auction: false,
    qty,
    pricePaise,
    valuePaise: (qty * pricePaise) as Paise,
    tradeDate: spec.at.slice(0, 10) as IstDate,
    executedAt: parseIstDateTime(spec.at)!,
    timePrecision: spec.timePrecision ?? 'second',
    sourceFile: 'test.csv',
    sourceRow: n,
  };
}

export const HEADER =
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date';

/** Builds a Console-format CSV row; overrides replace individual columns. */
export function csvRow(overrides: Record<string, string> = {}): string {
  const row: Record<string, string> = {
    symbol: 'NIFTY2692223600CE',
    isin: '',
    trade_date: '2026-09-22',
    exchange: 'NSE',
    segment: 'FO',
    series: '',
    trade_type: 'buy',
    auction: 'false',
    quantity: '65.000000',
    price: '31.250000',
    trade_id: '5200001',
    order_id: '1100000099000001',
    order_execution_time: '2026-09-22T10:12:00',
    expiry_date: '2026-09-22',
    ...overrides,
  };
  return HEADER.split(',')
    .map((h) => row[h])
    .join(',');
}

export function csv(...lines: string[]): ArrayBuffer {
  return new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer;
}

export function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export const MIN = 60_000;

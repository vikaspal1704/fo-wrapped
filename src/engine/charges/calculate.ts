import { ChargesUnavailableError } from '../errors';
import { safeMul } from '../money';
import type { Fill, IstDate, Paise } from '../types';
import type { ChargeRateTable, ChargesBreakdown, Rational, RateWindow } from './types';

type Component = 'stt' | 'exchangeTxn' | 'sebi' | 'stampDuty';

/**
 * Estimates charges from fills (ARCHITECTURE §6). Brokerage is per executed
 * order per day; every other charge is value × rate. Each charge is summed per
 * trading day and rounded once to the nearest paise (half up), then the days
 * are added. Throws ChargesUnavailableError for a date with no rate window.
 */
export function calculateCharges(fills: readonly Fill[], rates: ChargeRateTable): ChargesBreakdown {
  const byDay = new Map<IstDate, Fill[]>();
  for (const f of fills) {
    const day = byDay.get(f.tradeDate);
    if (day) day.push(f);
    else byDay.set(f.tradeDate, [f]);
  }

  const total = { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, gst: 0 };
  for (const [date, dayFills] of byDay) {
    const day = chargesForDay(date, dayFills, rates);
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += day[k];
  }
  const sum = total.brokerage + total.stt + total.exchangeTxn + total.sebi + total.stampDuty + total.gst;
  return { ...(total as Record<keyof typeof total, Paise>), total: sum as Paise };
}

function chargesForDay(date: IstDate, fills: readonly Fill[], rates: ChargeRateTable) {
  // Values are summed per (component, rate) and multiplied once, so rounding
  // happens once per charge per day.
  const buckets = new Map<string, { component: Component; rate: Rational; value: bigint }>();
  const add = (component: Component, rate: Rational, value: number) => {
    const key = `${component}:${rate.num}/${rate.den}`;
    const b = buckets.get(key);
    if (b) b.value += BigInt(value);
    else buckets.set(key, { component, rate, value: BigInt(value) });
  };

  const orders = new Map<string, { isFuture: boolean; value: number }>();
  for (const f of fills) {
    const value = safeMul(f.qty, f.pricePaise);
    const isFuture = f.instrument.kind === 'FUT';
    const isIndex = rates.indexUnderlyings[f.exchange].includes(f.instrument.underlying);
    const txn = rates.exchangeTxn[f.exchange];

    add('exchangeTxn', pick(isFuture ? txn.futures : isIndex ? txn.indexOptions : txn.stockOptions, date, `${f.exchange} transaction charges`), value);
    add('sebi', pick(rates.sebi, date, 'SEBI fees'), value);
    if (f.side === 'SELL') {
      add('stt', pick(isFuture ? rates.stt.futuresSell : rates.stt.optionsSellOnPremium, date, 'STT'), value);
    } else {
      add('stampDuty', pick(isFuture ? rates.stampDutyBuy.futures : rates.stampDutyBuy.options, date, 'stamp duty'), value);
    }

    const order = orders.get(f.orderId) ?? { isFuture, value: 0 };
    order.value += value;
    orders.set(f.orderId, order);
  }

  const day = { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, gst: 0 };
  for (const b of buckets.values()) day[b.component] += applyRate(b.value, b.rate);

  for (const order of orders.values()) {
    if (order.isFuture) {
      const { capPaise, pct } = pick(rates.brokerage.futuresPerOrder, date, 'brokerage');
      day.brokerage += Math.min(capPaise, applyRate(BigInt(order.value), pct));
    } else {
      day.brokerage += pick(rates.brokerage.optionsPerOrderPaise, date, 'brokerage');
    }
  }

  day.gst = applyRate(BigInt(day.brokerage + day.exchangeTxn + day.sebi), pick(rates.gst, date, 'GST'));
  return day;
}

/** value × num / den, rounded to the nearest paise (half up). */
function applyRate(value: bigint, rate: Rational): number {
  const num = value * BigInt(rate.num);
  const den = BigInt(rate.den);
  return Number((2n * num + den) / (2n * den));
}

function pick<T>(windows: readonly RateWindow<T>[], date: IstDate, what: string): T {
  const w = windows.find((x) => x.effectiveFrom <= date && (!x.effectiveTo || date <= x.effectiveTo));
  if (!w) throw new ChargesUnavailableError(date, what);
  return w.value;
}

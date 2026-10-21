import { applyRate, pick } from '../charges/calculate';
import type { ChargesBreakdown, EquityRateTable, Rational } from '../charges/types';
import { ChargesUnavailableError } from '../errors';
import { m } from '../i18n';
import type { IstDate, Paise } from '../types';
import type { DeliverySale, EquityCharges, EquityFill, EquitySummary, Holding, IntradayResult, UnmatchedSale } from './types';

/** A fill split into its intraday and delivery units (AC-3.1.3). */
interface Split {
  fill: EquityFill;
  intradayQty: number;
  intradayValue: number;
  deliveryQty: number;
  deliveryValue: number;
}

interface Lot {
  qty: number;
  value: number;
  date: IstDate;
}

/** The exact share of `value` that `q` of `qty` units carry; the parts of a split add up. */
const take = (value: number, qty: number, q: number) => (q === qty ? value : Math.round((value * q) / qty));

const byTime = (a: EquityFill, b: EquityFill) =>
  a.executedAt - b.executedAt || a.tradeId.length - b.tradeId.length || (a.tradeId < b.tradeId ? -1 : a.tradeId > b.tradeId ? 1 : 0);

/**
 * Equity P&L the way the tradebook supports it (docs/SPEC.md US-3.1): per stock
 * and day, matched buys and sells are intraday; the rest is delivery, matched
 * FIFO across days. Nothing is priced at market and nothing is guessed: sales
 * the file can't match are listed, holdings are at cost, and charges the
 * tradebook can't show are named as gaps.
 */
export function analyzeEquity(fills: readonly EquityFill[], rates: EquityRateTable): EquitySummary | null {
  if (fills.length === 0) return null;
  const sorted = [...fills].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0) || byTime(a, b));
  const symbolOf = new Map<string, string>();
  for (const f of sorted) symbolOf.set(f.isin, f.symbol); // the latest symbol wins (renames)

  // Group by stock and day, in date order.
  const groups = new Map<string, EquityFill[]>();
  for (const f of sorted) {
    const k = `${f.tradeDate}|${f.isin}`;
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }

  const splits: Split[] = [];
  const intraday: IntradayResult[] = [];
  const sales: DeliverySale[] = [];
  const unmatched: UnmatchedSale[] = [];
  const lots = new Map<string, Lot[]>();
  let dpStockDays = 0;

  for (const dayFills of groups.values()) {
    const { isin, tradeDate: date } = dayFills[0]!;
    const symbol = symbolOf.get(isin)!;
    const bought = dayFills.filter((f) => f.side === 'BUY').reduce((n, f) => n + f.qty, 0);
    const sold = dayFills.filter((f) => f.side === 'SELL').reduce((n, f) => n + f.qty, 0);
    const matched = Math.min(bought, sold);

    // The earliest units of each side that day are the intraday ones.
    const left = { BUY: matched, SELL: matched };
    const daySplits = dayFills.map((fill): Split => {
      const q = Math.min(fill.qty, left[fill.side]);
      left[fill.side] -= q;
      const iv = take(fill.valuePaise, fill.qty, q);
      return { fill, intradayQty: q, intradayValue: iv, deliveryQty: fill.qty - q, deliveryValue: fill.valuePaise - iv };
    });
    splits.push(...daySplits);

    if (matched > 0) {
      const buyValue = sum(daySplits.filter((s) => s.fill.side === 'BUY').map((s) => s.intradayValue));
      const sellValue = sum(daySplits.filter((s) => s.fill.side === 'SELL').map((s) => s.intradayValue));
      intraday.push({ isin, symbol, date, qty: matched, buyValuePaise: buyValue as Paise, sellValuePaise: sellValue as Paise, pnlPaise: (sellValue - buyValue) as Paise });
    }

    // After the intraday match only one side has delivery units left.
    const held = lots.get(isin) ?? [];
    lots.set(isin, held);
    for (const s of daySplits) {
      if (s.fill.side === 'BUY' && s.deliveryQty > 0) held.push({ qty: s.deliveryQty, value: s.deliveryValue, date });
    }
    const sells = daySplits.filter((s) => s.fill.side === 'SELL' && s.deliveryQty > 0);
    if (sells.length === 0) continue;
    dpStockDays++;
    const sellQty = sum(sells.map((s) => s.deliveryQty));
    const sellValue = sum(sells.map((s) => s.deliveryValue));
    let need = sellQty;
    let cost = 0;
    let from: IstDate | null = null;
    let to: IstDate | null = null;
    while (need > 0 && held.length > 0) {
      const lot = held[0]!;
      const q = Math.min(lot.qty, need);
      const c = take(lot.value, lot.qty, q);
      cost += c;
      from ??= lot.date;
      to = lot.date;
      lot.qty -= q;
      lot.value -= c;
      need -= q;
      if (lot.qty === 0) held.shift();
    }
    const used = sellQty - need;
    if (used > 0) {
      const proceeds = take(sellValue, sellQty, used);
      sales.push({ isin, symbol, date, qty: used, costPaise: cost as Paise, proceedsPaise: proceeds as Paise, pnlPaise: (proceeds - cost) as Paise, boughtFrom: from!, boughtTo: to! });
    }
    if (need > 0) unmatched.push({ isin, symbol, date, qty: need });
  }

  const holdings: Holding[] = [...lots.entries()]
    .filter(([, held]) => held.length > 0)
    .map(([isin, held]) => {
      const qty = sum(held.map((l) => l.qty));
      const cost = sum(held.map((l) => l.value));
      return { isin, symbol: symbolOf.get(isin)!, qty, costPaise: cost as Paise, avgPricePaise: cost / qty, firstBought: held[0]!.date };
    })
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

  return {
    from: sorted[0]!.tradeDate,
    to: sorted[sorted.length - 1]!.tradeDate,
    trades: fills.length,
    intraday,
    sales,
    unmatched,
    holdings,
    intradayPnlPaise: sum(intraday.map((i) => i.pnlPaise)) as Paise,
    deliveryPnlPaise: sum(sales.map((s) => s.pnlPaise)) as Paise,
    charges: equityCharges(splits, rates),
    dpStockDays,
  };
}

function sum(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  if (!Number.isSafeInteger(t)) throw new RangeError('Value out of safe integer range');
  return t;
}

/**
 * Estimated charges (AC-3.1.7, AC-3.1.8). Each charge is summed per day and
 * rounded once, as for F&O. DP charges are never included (AC-3.1.9).
 */
export function equityCharges(splits: readonly Split[], rates: EquityRateTable): EquityCharges {
  const byDay = new Map<IstDate, Split[]>();
  for (const s of splits) {
    const d = byDay.get(s.fill.tradeDate);
    if (d) d.push(s);
    else byDay.set(s.fill.tradeDate, [s]);
  }
  const total = { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, gst: 0, other: 0 };
  let gap = 0;
  try {
    for (const [date, day] of byDay) {
      const d = chargesForDay(date, day, rates);
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += d.charges[k];
      gap += d.intradayBrokerageWithGst;
    }
  } catch (e) {
    if (e instanceof ChargesUnavailableError) return { available: false, reason: m().equityChargesUnavailable(e.date, e.what) };
    throw e;
  }
  const all = total.brokerage + total.stt + total.exchangeTxn + total.sebi + total.stampDuty + total.gst + total.other;
  const breakdown = { ...(total as Record<keyof typeof total, Paise>), total: all as Paise } satisfies ChargesBreakdown;
  return { available: true, breakdown, intradayBrokerageWithGstPaise: gap as Paise };
}

function chargesForDay(date: IstDate, day: readonly Split[], rates: EquityRateTable) {
  const buckets = new Map<string, { component: 'stt' | 'exchangeTxn' | 'sebi' | 'stampDuty'; rate: Rational; value: bigint }>();
  const add = (component: 'stt' | 'exchangeTxn' | 'sebi' | 'stampDuty', rate: Rational, value: number) => {
    if (value === 0) return;
    const key = `${component}:${rate.num}/${rate.den}`;
    const b = buckets.get(key);
    if (b) b.value += BigInt(value);
    else buckets.set(key, { component, rate, value: BigInt(value) });
  };
  const orders = new Map<string, number>();

  for (const { fill, intradayValue, deliveryValue } of day) {
    const value = fill.valuePaise as number;
    if (fill.exchange === 'BSE' && !rates.bseGroups.includes(fill.series)) {
      throw new ChargesUnavailableError(date, m().bseGroupNotChecked(fill.series));
    }
    add('exchangeTxn', pick(rates.exchangeTxn[fill.exchange], date, m().chargeTxn(fill.exchange)), value);
    add('sebi', pick(rates.sebi, date, m().chargeSebi), value);
    add('stt', pick(rates.stt.delivery, date, m().chargeStt), deliveryValue);
    if (fill.side === 'SELL') {
      add('stt', pick(rates.stt.intradaySell, date, m().chargeStt), intradayValue);
    } else {
      add('stampDuty', pick(rates.stampDutyBuy.intraday, date, m().chargeStamp), intradayValue);
      add('stampDuty', pick(rates.stampDutyBuy.delivery, date, m().chargeStamp), deliveryValue);
    }
    if (intradayValue > 0) orders.set(fill.orderId, (orders.get(fill.orderId) ?? 0) + intradayValue);
  }

  const charges = { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, gst: 0, other: 0 };
  for (const b of buckets.values()) charges[b.component] += applyRate(b.value, b.rate);
  for (const value of orders.values()) {
    const { capPaise, pct } = pick(rates.intradayBrokerage, date, m().chargeBrokerage);
    charges.brokerage += Math.min(capPaise, applyRate(BigInt(value), pct));
  }
  const gst = pick(rates.gst, date, m().chargeGst);
  charges.gst = applyRate(BigInt(charges.brokerage + charges.exchangeTxn + charges.sebi), gst);
  // What brokerage adds, GST included, if every intraday order was MIS.
  const intradayBrokerageWithGst = charges.brokerage + charges.gst - applyRate(BigInt(charges.exchangeTxn + charges.sebi), gst);
  return { charges, intradayBrokerageWithGst };
}

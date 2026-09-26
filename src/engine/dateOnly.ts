import type { Fill, IstDate, Paise } from './types';
import { parseIstDateTime } from './time';

/**
 * Prepares fills from exports without trade times (Angel One, Dhan) for FIFO
 * (docs/BROKERS.md §3):
 *
 * 1. All of a contract's buys on a day become one BUY fill, and all its sells
 *    one SELL fill (quantities and exact values summed).
 * 2. Within a day, the side that reduces the position carried in is applied
 *    first; when the contract starts the day flat, buys go before sells.
 *
 * Realised P&L of a position that goes flat doesn't depend on fill order, so
 * totals are unaffected; a "trade" becomes one contract's activity on a day.
 * Fills with times pass through untouched.
 */
export function prepareDateOnlyFills(fills: readonly Fill[]): Fill[] {
  const timed = fills.filter((f) => f.timePrecision === 'second');
  const dated = fills.filter((f) => f.timePrecision === 'date');
  if (dated.length === 0) return [...fills];

  // broker|instrument → date → side → aggregate
  const groups = new Map<string, Map<IstDate, { BUY?: Fill; SELL?: Fill }>>();
  for (const f of dated) {
    const key = `${f.broker}|${f.instrument.key}`;
    const days = groups.get(key) ?? new Map();
    groups.set(key, days);
    const day = days.get(f.tradeDate) ?? {};
    days.set(f.tradeDate, day);
    const prev = day[f.side];
    day[f.side] = prev
      ? {
          ...prev,
          qty: prev.qty + f.qty,
          valuePaise: (prev.valuePaise + f.valuePaise) as Paise,
          pricePaise: Math.round((prev.valuePaise + f.valuePaise) / (prev.qty + f.qty)) as Paise,
        }
      : { ...f, tradeId: `${f.tradeDate}|${f.instrument.key}|${f.side}` };
  }

  const out: Fill[] = [...timed];
  for (const days of groups.values()) {
    let position = 0;
    for (const date of [...days.keys()].sort()) {
      const { BUY: buy, SELL: sell } = days.get(date)!;
      const midnight = parseIstDateTime(`${date}T00:00:00`)!;
      // Reduce first: a long position is reduced by the sell, a short one by the buy.
      const order = position > 0 ? [sell, buy] : [buy, sell];
      order
        .filter((f): f is Fill => !!f)
        .forEach((f, i) => {
          // 1 ms apart keeps this order through the global sort.
          out.push({ ...f, executedAt: midnight + i });
          position += f.side === 'BUY' ? f.qty : -f.qty;
        });
    }
  }
  return out;
}

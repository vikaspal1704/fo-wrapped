import { ConflictingDuplicateError } from './errors';
import type { Fill } from './types';

/**
 * Merges fills from several tradebook files. Duplicates are keyed on
 * `exchange + trade_id` (PRD D-14): identical ones are dropped and counted,
 * and ones that differ in any field raise ConflictingDuplicateError.
 * Output is sorted by (executedAt, exchange, tradeId).
 */
export function mergeFills(files: readonly (readonly Fill[])[]): { fills: Fill[]; duplicatesDropped: number } {
  const byKey = new Map<string, Fill>();
  let duplicatesDropped = 0;

  for (const file of files) {
    for (const fill of file) {
      const key = `${fill.exchange}:${fill.tradeId}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, fill);
      } else if (sameTrade(existing, fill)) {
        duplicatesDropped++;
      } else {
        throw new ConflictingDuplicateError(fill.tradeId);
      }
    }
  }

  const fills = [...byKey.values()].sort(compareFills);
  return { fills, duplicatesDropped };
}

export function compareFills(a: Fill, b: Fill): number {
  return (
    a.executedAt - b.executedAt ||
    compareStrings(a.exchange, b.exchange) ||
    compareNumericStrings(a.tradeId, b.tradeId)
  );
}

function sameTrade(a: Fill, b: Fill): boolean {
  return (
    a.orderId === b.orderId &&
    a.instrument.key === b.instrument.key &&
    a.instrument.expiry === b.instrument.expiry &&
    a.side === b.side &&
    a.auction === b.auction &&
    a.qty === b.qty &&
    a.pricePaise === b.pricePaise &&
    a.tradeDate === b.tradeDate &&
    a.executedAt === b.executedAt
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orders digit strings numerically without converting to number. */
function compareNumericStrings(a: string, b: string): number {
  return a.length - b.length || compareStrings(a, b);
}

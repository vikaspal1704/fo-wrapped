/** Incremental import (docs/SPEC.md US-2.4): what a new file adds to saved history. */
import { ConflictingDuplicateError } from '../errors';
import { fillKey, sameTrade } from '../merge';
import type { EquityFill } from '../equity/types';
import type { Fill } from '../types';

/**
 * New fills from `incoming` that history doesn't have yet. Duplicates (same
 * broker, exchange and trade ID, same details) are counted and dropped; a
 * duplicate with different details throws, as a merge would (PRD F-IN-2).
 */
export function planImport(existing: readonly Fill[], incoming: readonly Fill[]): { added: Fill[]; duplicates: number } {
  return planBy(existing, incoming, fillKey, sameTrade);
}

/** The equity version (AC-3.1.10): segment is part of the key, as equity and F&O trade IDs are separate series. */
export function planEquityImport(existing: readonly EquityFill[], incoming: readonly EquityFill[]): { added: EquityFill[]; duplicates: number } {
  return planBy(existing, incoming, equityFillKey, sameEquityTrade);
}

export const equityFillKey = (f: EquityFill) => `${f.broker}:EQ:${f.exchange}:${f.tradeId}`;

function sameEquityTrade(a: EquityFill, b: EquityFill): boolean {
  return (
    a.orderId === b.orderId &&
    a.isin === b.isin &&
    a.series === b.series &&
    a.side === b.side &&
    a.auction === b.auction &&
    a.qty === b.qty &&
    a.pricePaise === b.pricePaise &&
    a.tradeDate === b.tradeDate &&
    a.executedAt === b.executedAt
  );
}

function planBy<T extends { tradeId: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  fillKey: (f: T) => string,
  sameTrade: (a: T, b: T) => boolean,
): { added: T[]; duplicates: number } {
  const seen = new Map(existing.map((f) => [fillKey(f), f]));
  const added: T[] = [];
  let duplicates = 0;
  for (const f of incoming) {
    const key = fillKey(f);
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, f);
      added.push(f);
    } else if (sameTrade(prior, f)) {
      duplicates++;
    } else {
      throw new ConflictingDuplicateError(f.tradeId);
    }
  }
  return { added, duplicates };
}

/**
 * A file name safe to keep in history (PV-3): any token that mixes letters and
 * digits (client IDs such as AB1234) is masked. Dates and plain words stay.
 */
export function fileLabel(name: string): string {
  return name.replace(/[A-Za-z0-9]+/g, (token) => (/[A-Za-z]/.test(token) && /\d/.test(token) && token.length >= 4 ? '•••' : token));
}

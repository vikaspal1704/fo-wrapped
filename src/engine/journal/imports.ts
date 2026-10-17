/** Incremental import (docs/SPEC.md US-2.4): what a new file adds to saved history. */
import { ConflictingDuplicateError } from '../errors';
import { fillKey, sameTrade } from '../merge';
import type { Fill } from '../types';

/**
 * New fills from `incoming` that history doesn't have yet. Duplicates (same
 * broker, exchange and trade ID, same details) are counted and dropped; a
 * duplicate with different details throws, as a merge would (PRD F-IN-2).
 */
export function planImport(existing: readonly Fill[], incoming: readonly Fill[]): { added: Fill[]; duplicates: number } {
  const seen = new Map(existing.map((f) => [fillKey(f), f]));
  const added: Fill[] = [];
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

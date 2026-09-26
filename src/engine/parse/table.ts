import type { ChargeRecord } from '../charges/types';
import type { ChargesBreakdown } from '../charges/types';
import { RowValidationError } from '../errors';
import { cellToPaise, decimalToPaiseRounded, decimalToWholeNumber } from '../money';
import type { BrokerId, Fill, Paise } from '../types';

/** What one broker file gives the engine. */
export interface BrokerFills {
  broker: BrokerId;
  fills: Fill[];
  /** The broker's own charges, when the file reports them; null = estimate. */
  charges: ChargeRecord[] | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Finds the first row, within `maxRows`, that holds every header in
 * `required` (case-insensitive). Returns its index and a column lookup.
 */
export function findHeader(
  rows: readonly (readonly string[])[],
  required: readonly string[],
  maxRows: number,
): { at: number; col: (h: string) => number } | null {
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const index = new Map(rows[r]!.map((h, i) => [norm(h), i] as const));
    if (required.every((h) => index.has(norm(h)))) {
      return { at: r, col: (h) => index.get(norm(h)) ?? -1 };
    }
  }
  return null;
}

export const isBlankRow = (cells: readonly string[]) => cells.every((c) => c.trim() === '');

/** Cell reader for one data row that throws RowValidationError with the file position. */
export function rowReader(fileName: string, line: number, cells: readonly string[], col: (h: string) => number) {
  const get = (h: string) => (cells[col(h)] ?? '').trim();
  const fail = (h: string, reason: string): never => {
    throw new RowValidationError(fileName, line, h, get(h), reason);
  };
  return {
    get,
    fail,
    /** A positive whole number. */
    qty(h: string, allowZero = false): number {
      const n = decimalToWholeNumber(get(h));
      if (n === null || (n === 0 && !allowZero)) return fail(h, 'expected a whole number');
      return n;
    },
    /** A positive price in paise (float noise from XLSX removed). */
    price(h: string): Paise {
      const p = cellToPaise(get(h));
      if (p === null || p <= 0) return fail(h, 'expected a positive price');
      return p;
    },
    /** A money amount, rounded to paise; blank = 0. */
    money(h: string): Paise {
      const v = decimalToPaiseRounded(get(h) || '0');
      if (v === null) return fail(h, 'expected an amount');
      return v;
    },
  };
}

export function chargesOf(parts: Omit<ChargesBreakdown, 'total'>): ChargesBreakdown {
  const total = parts.brokerage + parts.stt + parts.exchangeTxn + parts.sebi + parts.stampDuty + parts.gst + parts.other;
  return { ...parts, total: total as Paise };
}

/** Adds records with the same id together (one file can split a charge over rows). */
export function mergeRecords(records: readonly ChargeRecord[]): ChargeRecord[] {
  const byId = new Map<string, ChargeRecord>();
  for (const r of records) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      continue;
    }
    const keys = ['brokerage', 'stt', 'exchangeTxn', 'sebi', 'stampDuty', 'gst', 'other'] as const;
    const sum = Object.fromEntries(keys.map((k) => [k, prev.charges[k] + r.charges[k]])) as Omit<ChargesBreakdown, 'total'>;
    byId.set(r.id, { ...prev, charges: chargesOf(sum) });
  }
  return [...byId.values()];
}

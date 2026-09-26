import { SAMVAT_YEARS } from './config/samvat';
import type { IstDate } from './types';

export type PeriodKind = 'ALL' | 'SAMVAT' | 'CALENDAR' | 'FY';

export interface Period {
  /** Stable id, e.g. 'all', 'samvat-2082', 'cy-2026', 'fy-2025'. */
  id: string;
  kind: PeriodKind;
  /** e.g. 'Samvat 2082', '2026', 'FY 2025-26', 'All trades'. */
  label: string;
  from: IstDate;
  to: IstDate;
}

const d = (s: string) => s as IstDate;

/**
 * Periods that contain at least one of `dates` (ARCHITECTURE §7.2): all
 * data, each Samvat year, each calendar year and each financial year
 * (1 Apr – 31 Mar), newest first within each kind.
 */
export function periodsFor(dates: readonly IstDate[]): Period[] {
  if (dates.length === 0) return [];
  const from = dates.reduce((a, b) => (b < a ? b : a));
  const to = dates.reduce((a, b) => (b > a ? b : a));
  const has = (p: { from: IstDate; to: IstDate }) => dates.some((x) => p.from <= x && x <= p.to);

  const out: Period[] = [{ id: 'all', kind: 'ALL', label: 'All trades', from, to }];

  for (const s of [...SAMVAT_YEARS].reverse()) {
    const p = { from: s.from, to: s.to ?? d('9999-12-31') };
    if (has(p)) out.push({ id: `samvat-${s.year}`, kind: 'SAMVAT', label: `Samvat ${s.year}`, ...p });
  }

  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  for (let y = lastYear; y >= firstYear; y--) {
    const p = { from: d(`${y}-01-01`), to: d(`${y}-12-31`) };
    if (has(p)) out.push({ id: `cy-${y}`, kind: 'CALENDAR', label: String(y), ...p });
  }

  // FY y-(y+1) runs 1 Apr y – 31 Mar y+1.
  for (let y = lastYear; y >= firstYear - 1; y--) {
    const p = { from: d(`${y}-04-01`), to: d(`${y + 1}-03-31`) };
    if (has(p)) out.push({ id: `fy-${y}`, kind: 'FY', label: `FY ${y}-${String(y + 1).slice(2)}`, ...p });
  }
  return out;
}

export function inPeriod(date: IstDate, p: Period): boolean {
  return p.from <= date && date <= p.to;
}

/** The period of the same kind that ends just before `p` starts, if present in `all`. */
export function previousPeriod(p: Period, all: readonly Period[]): Period | null {
  if (p.kind === 'ALL') return null;
  return all.filter((x) => x.kind === p.kind && x.to < p.from).sort((a, b) => (a.to < b.to ? 1 : -1))[0] ?? null;
}

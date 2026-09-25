import type { IstDate } from '../types';

/**
 * Samvat years, each starting on its Diwali Muhurat-trading day (ARCHITECTURE
 * §7.1). Muhurat 2026 (8 Nov) is the announced date; re-check before launch.
 */
export const SAMVAT_YEARS: readonly { year: number; from: IstDate; to?: IstDate }[] = [
  { year: 2080, from: '2023-11-12' as IstDate, to: '2024-10-31' as IstDate },
  { year: 2081, from: '2024-11-01' as IstDate, to: '2025-10-20' as IstDate },
  { year: 2082, from: '2025-10-21' as IstDate, to: '2026-11-07' as IstDate },
  { year: 2083, from: '2026-11-08' as IstDate },
];

export function samvatYearOf(date: IstDate): number | null {
  const s = SAMVAT_YEARS.find((y) => y.from <= date && (!y.to || date <= y.to));
  return s ? s.year : null;
}

/**
 * '2081' for one year, '2081–82' for a span. null when any date falls outside
 * the table; the UI then shows the calendar date range instead.
 */
export function samvatLabel(dates: readonly IstDate[]): string | null {
  if (dates.length === 0) return null;
  const years = dates.map(samvatYearOf);
  if (years.some((y) => y === null)) return null;
  const min = Math.min(...(years as number[]));
  const max = Math.max(...(years as number[]));
  return min === max ? String(min) : `${min}–${String(max).slice(-2)}`;
}

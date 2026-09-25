import type { Paise } from './types';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,23,456 or −₹1,23,456 (rounded to whole rupees, for display only). */
export function formatInr(paise: Paise | number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  return `${paise < 0 && rupees !== 0 ? '−' : ''}₹${inr.format(rupees)}`;
}

/** 0.6667 → '67%'. */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** 1_250_000 ms → '20m 50s'; ≥ 1 day → '2d 3h'. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

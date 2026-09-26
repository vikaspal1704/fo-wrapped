import { formatInr } from '../engine/format';
import type { IstDate, Paise } from '../engine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-22' → '22 Sep 2026' (no Date parsing, so no time-zone drift). */
export function formatDate(d: IstDate, months: readonly string[] = MONTHS): string {
  const [y, m, day] = d.split('-');
  return `${Number(day)} ${months[Number(m) - 1]} ${y}`;
}

/** Signed rupees: +₹1,712 / −₹923 / ₹0. */
export function signedInr(paise: Paise | number): string {
  const s = formatInr(paise);
  return Math.round(paise / 100) > 0 ? `+${s}` : s;
}

export function tone(paise: number): 'profit' | 'loss' | 'flat' {
  const r = Math.round(paise / 100);
  return r > 0 ? 'profit' : r < 0 ? 'loss' : 'flat';
}

/** 555 → '09:15'. */
export function minuteLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

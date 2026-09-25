import type { EpochMs, IstDate } from './types';

/** IST is UTC+05:30 with no daylight saving. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Validates 'YYYY-MM-DD' as a real calendar date. */
export function parseIstDate(value: string): IstDate | null {
  const m = DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  return value as IstDate;
}

/**
 * Parses an IST wall-clock timestamp 'YYYY-MM-DDTHH:mm:ss' (no offset) to epoch
 * ms. Independent of the device time zone.
 */
export function parseIstDateTime(value: string): EpochMs | null {
  const m = DATE_TIME.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59 || s > 59) return null;
  if (!parseIstDate(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MS;
}

/** The IST calendar date of an instant. */
export function istDateOf(at: EpochMs): IstDate {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10) as IstDate;
}

/** Minutes since IST midnight (0..1439). */
export function istMinuteOfDay(at: EpochMs): number {
  const shifted = new Date(at + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

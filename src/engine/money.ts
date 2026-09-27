import type { Paise } from './types';

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parses a non-negative decimal string (e.g. "152.350000") into integer paise
 * without floating point. Digits after the 2nd decimal place must all be 0.
 * Returns null when the string is not exact paise.
 */
export function decimalToPaise(value: string): Paise | null {
  const m = DECIMAL.exec(value.trim());
  if (!m) return null;
  const [, whole = '', frac = ''] = m;
  if (/[1-9]/.test(frac.slice(2))) return null;
  const paise = Number(whole) * 100 + Number(frac.slice(0, 2).padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? (paise as Paise) : null;
}

/**
 * Parses a decimal string that must hold a whole number (e.g. "20.000000").
 * Returns null otherwise.
 */
export function decimalToWholeNumber(value: string): number | null {
  const m = DECIMAL.exec(value.trim());
  if (!m) return null;
  const [, whole = '', frac = ''] = m;
  if (/[1-9]/.test(frac)) return null;
  const n = Number(whole);
  return Number.isSafeInteger(n) ? n : null;
}

/** Multiplies and asserts the result is still exact (TRD §4). */
export function safeMul(a: number, b: number): number {
  const r = a * b;
  if (!Number.isSafeInteger(r)) throw new RangeError(`Value out of safe integer range: ${a} × ${b}`);
  return r;
}

const SIGNED_DECIMAL = /^([-+]?)(\d+)(?:\.(\d+))?$/;

/**
 * Parses a signed decimal that may carry more than 2 decimals (broker
 * statements print values like "20099.9999") and rounds it to the nearest
 * paise, halves away from zero. Returns null if it isn't a plain decimal.
 */
export function decimalToPaiseRounded(value: string): Paise | null {
  const m = SIGNED_DECIMAL.exec(value.trim().replace(/,/g, ''));
  if (!m) return null;
  const [, sign = '', whole = '', frac = ''] = m;
  const f = frac.padEnd(3, '0');
  let paise = Number(whole) * 100 + Number(f.slice(0, 2));
  if (Number(f[2]) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) return null;
  return (sign === '-' && paise !== 0 ? -paise : paise) as Paise;
}

/**
 * Parses a price read from an XLSX number cell. The cell text can carry
 * binary float noise (e.g. "2.2000000000000002" or "44.199999999999996");
 * that noise is removed, but anything else past whole paise is rejected.
 */
export function cellToPaise(value: string): Paise | null {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const extra = (match[2] ?? '').slice(2);
  if (extra !== '' && !/^0*$/.test(extra) && !/^(?:0{6,}|9{6,})\d*$/.test(extra)) return null;
  return decimalToPaiseRounded(value);
}

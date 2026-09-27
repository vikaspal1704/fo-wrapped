import { UnknownInstrumentError } from '../errors';
import { m } from '../i18n';
import type { Exchange, Instrument, InstrumentKind, IstDate, Paise } from '../types';

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** An exchange F&O underlying: capitals, digits, & and -. */
export const UNDERLYING = /^[A-Z][A-Z0-9&-]*$/;

/**
 * Builds an instrument for brokers whose files name contracts by parts
 * (underlying, expiry, strike) instead of an exchange trading symbol. The
 * display symbol is `NIFTY 25AUG26 24150 PE` / `WIPRO 28APR26 FUT`.
 */
export function makeInstrument(
  raw: string,
  parts: { exchange: Exchange; underlying: string; kind: InstrumentKind; strikePaise: Paise | null; expiry: IstDate },
): Instrument {
  const { exchange, underlying, kind, strikePaise, expiry } = parts;
  if (!UNDERLYING.test(underlying)) throw new UnknownInstrumentError(raw, m().contractNotRecognised);
  if ((kind === 'FUT') !== (strikePaise === null) || (strikePaise !== null && strikePaise <= 0)) {
    throw new UnknownInstrumentError(raw, m().contractNotRecognised);
  }
  const [yyyy, mm, dd] = expiry.split('-');
  const date = `${dd}${MONTHS[Number(mm) - 1]}${yyyy!.slice(2)}`;
  const tail = kind === 'FUT' ? 'FUT' : `${formatStrike(strikePaise!)} ${kind}`;
  const tradingSymbol = `${underlying} ${date} ${tail}`;
  return { key: `${exchange}:${tradingSymbol}`, tradingSymbol, underlying, kind, strikePaise, expiry };
}

function formatStrike(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(rupees) : `${rupees}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** 'Aug' / 'AUG' → 1-based month number, or null. */
export function monthNumber(mon: string): number | null {
  const i = MONTHS.indexOf(mon.toUpperCase());
  return i === -1 ? null : i + 1;
}

/** Year, month, day → an IstDate if it is a real calendar date. */
export function ymd(year: number, month: number, day: number): IstDate | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as IstDate;
}

/** 'dd-mm-yyyy' (optionally followed by ' 00:00') → IstDate, or null. */
export function dayFirstDate(s: string): IstDate | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})(?: 00:00)?$/.exec(s.trim());
  return match ? ymd(Number(match[3]), Number(match[2]), Number(match[1])) : null;
}

import { UnknownInstrumentError } from '../errors';
import { m } from '../i18n';
import { decimalToPaise } from '../money';
import type { Exchange, Instrument, InstrumentKind, IstDate } from '../types';

const WEEKLY_MONTH_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'O', 'N', 'D'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const OPTION_TAIL = /^(\d+(?:\.\d+)?)(CE|PE)$/;
const UNDERLYING = /^[A-Z][A-Z0-9&-]*$/;

interface Candidate {
  underlying: string;
  kind: InstrumentKind;
  strike: string | null;
}

/**
 * Parses a Zerodha F&O trading symbol. `expiry` (the export's `expiry_date`)
 * is authoritative: the symbol must contain the date token it implies —
 * weekly `YY` + month code + `DD`, or monthly `YY` + `MMM`. Rejects rather
 * than guesses when the symbol does not match or is ambiguous.
 */
export function parseSymbol(tradingSymbol: string, exchange: Exchange, expiry: IstDate): Instrument {
  const symbol = tradingSymbol.trim().toUpperCase();
  const [yyyy, mm, dd] = expiry.split('-');
  const yy = yyyy!.slice(2);
  const monthIndex = Number(mm) - 1;
  const tokens = [`${yy}${WEEKLY_MONTH_CODES[monthIndex]}${dd}`, `${yy}${MONTHS[monthIndex]}`];

  const candidates: Candidate[] = [];
  for (const token of tokens) {
    for (let i = symbol.indexOf(token, 1); i !== -1; i = symbol.indexOf(token, i + 1)) {
      const underlying = symbol.slice(0, i);
      const tail = symbol.slice(i + token.length);
      if (!UNDERLYING.test(underlying)) continue;
      if (tail === 'FUT') {
        candidates.push({ underlying, kind: 'FUT', strike: null });
        continue;
      }
      const match = OPTION_TAIL.exec(tail);
      if (match) candidates.push({ underlying, kind: match[2] as InstrumentKind, strike: match[1]! });
    }
  }

  if (candidates.length === 0) {
    throw new UnknownInstrumentError(tradingSymbol, m().symbolExpiryMismatch(expiry));
  }
  if (candidates.length > 1) {
    throw new UnknownInstrumentError(tradingSymbol, m().symbolAmbiguous);
  }

  const { underlying, kind, strike } = candidates[0]!;
  let strikePaise = null;
  if (strike !== null) {
    strikePaise = decimalToPaise(strike);
    if (strikePaise === null || strikePaise <= 0) {
      throw new UnknownInstrumentError(tradingSymbol, m().symbolBadStrike(strike));
    }
  }

  return {
    key: `${exchange}:${symbol}`,
    tradingSymbol: symbol,
    underlying,
    kind,
    strikePaise,
    expiry,
  };
}

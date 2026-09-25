import { UnknownInstrumentError } from '../errors';
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
      const m = OPTION_TAIL.exec(tail);
      if (m) candidates.push({ underlying, kind: m[2] as InstrumentKind, strike: m[1]! });
    }
  }

  if (candidates.length === 0) {
    throw new UnknownInstrumentError(tradingSymbol, `It doesn’t match its expiry date ${expiry}.`);
  }
  if (candidates.length > 1) {
    throw new UnknownInstrumentError(tradingSymbol, 'The symbol can be read in more than one way.');
  }

  const { underlying, kind, strike } = candidates[0]!;
  let strikePaise = null;
  if (strike !== null) {
    strikePaise = decimalToPaise(strike);
    if (strikePaise === null || strikePaise <= 0) {
      throw new UnknownInstrumentError(tradingSymbol, `Strike “${strike}” isn’t valid.`);
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

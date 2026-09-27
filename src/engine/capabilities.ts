import type { CardResult } from './cards';
import { m } from './i18n';
import type { RoundTrip } from './types';

/**
 * Cards that need trade times use only round trips built from files that have
 * them. With none, the card is hidden (code NO_TRADE_TIMES; PRD D-22).
 */
export function withTimes<T>(rts: readonly RoundTrip[], compute: (timed: readonly RoundTrip[]) => CardResult<T>): CardResult<T> {
  const timed = rts.filter((r) => r.timePrecision === 'second');
  if (timed.length === 0 && rts.length > 0) {
    return { status: 'INSUFFICIENT_DATA', reason: m().noTradeTimes, code: 'NO_TRADE_TIMES' };
  }
  const result = compute(timed);
  if (result.status === 'OK' && timed.length < rts.length) result.notes.push(m().onlyTimedTrades);
  return result;
}


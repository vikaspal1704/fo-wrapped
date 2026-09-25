import type { Instrument, IstDate, UnclosedStatus } from './types';

/**
 * A position left open after all fills is settled at expiry if its contract
 * expired on or before the last trade date in the data; otherwise it is still
 * open. `asOf` is never "today" (PRD F-EN-6).
 */
export function classifyUnclosed(instrument: Instrument, asOf: IstDate): UnclosedStatus {
  return instrument.expiry <= asOf ? 'SETTLED_AT_EXPIRY' : 'OPEN';
}

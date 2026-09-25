/** Integer number of paise. ₹1 = 100. Never fractional. */
export type Paise = number & { readonly __brand: 'Paise' };

/** Calendar date in IST, 'YYYY-MM-DD'. */
export type IstDate = string & { readonly __brand: 'IstDate' };

/** Epoch milliseconds. Always derived from an IST wall-clock string. */
export type EpochMs = number;

export type Side = 'BUY' | 'SELL';
export type Exchange = 'NSE' | 'BSE';
export type InstrumentKind = 'FUT' | 'CE' | 'PE';

export interface Instrument {
  /** Canonical FIFO grouping key: `${exchange}:${tradingSymbol}`. */
  key: string;
  tradingSymbol: string;
  underlying: string;
  kind: InstrumentKind;
  /** null for futures. */
  strikePaise: Paise | null;
  expiry: IstDate;
}

export interface Fill {
  tradeId: string;
  orderId: string;
  instrument: Instrument;
  exchange: Exchange;
  side: Side;
  auction: boolean;
  /** Positive integer, units. */
  qty: number;
  pricePaise: Paise;
  tradeDate: IstDate;
  executedAt: EpochMs;
  /** File name, for error messages only. */
  sourceFile: string;
  /** 1-based line in that file. */
  sourceRow: number;
}

export type PositionSide = 'LONG' | 'SHORT';

export interface RoundTrip {
  /** 1..n, ordered by exitAt then instrument key. */
  id: number;
  instrument: Instrument;
  side: PositionSide;
  entryAt: EpochMs;
  exitAt: EpochMs;
  exitDate: IstDate;
  exitKind: 'TRADE' | 'EXPIRY';
  qty: number;
  /** Qty-weighted; may be fractional — display only. */
  avgEntryPaise: number;
  /** Qty-weighted; may be fractional — display only. */
  avgExitPaise: number;
  /** Exact: Σ FIFO chunk P&L. */
  grossPnlPaise: Paise;
  /** Qty-weighted mean FIFO lot holding time, rounded to the nearest ms. */
  holdingMs: number;
  fillIds: string[];
}

export type UnclosedStatus = 'OPEN' | 'SETTLED_AT_EXPIRY';

export interface UnclosedPosition {
  instrument: Instrument;
  side: PositionSide;
  qty: number;
  avgEntryPaise: number;
  openedAt: EpochMs;
  status: UnclosedStatus;
}

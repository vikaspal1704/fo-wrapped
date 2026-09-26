/** Integer number of paise. ₹1 = 100. Never fractional. */
export type Paise = number & { readonly __brand: 'Paise' };

/** Calendar date in IST, 'YYYY-MM-DD'. */
export type IstDate = string & { readonly __brand: 'IstDate' };

/** Epoch milliseconds. Always derived from an IST wall-clock string. */
export type EpochMs = number;

export type Side = 'BUY' | 'SELL';
/** Brokers whose exports are supported (docs/BROKERS.md). */
export type BrokerId = 'zerodha' | 'angelone' | 'upstox' | 'dhan';
/** 'second': the file has execution times; 'date': dates only (Angel One, Dhan). */
export type TimePrecision = 'second' | 'date';
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
  broker: BrokerId;
  tradeId: string;
  /** null when the export has no order IDs (Upstox). */
  orderId: string | null;
  instrument: Instrument;
  exchange: Exchange;
  side: Side;
  auction: boolean;
  /** Positive integer, units. */
  qty: number;
  /** Per-unit price. For rows that are daily totals it is the average, rounded (display only). */
  pricePaise: Paise;
  /** Exact traded value (qty × price, or the reported total). The engine computes with this. */
  valuePaise: Paise;
  tradeDate: IstDate;
  /** For TimePrecision 'date', midnight IST of the trade date (ordering is set by the engine). */
  executedAt: EpochMs;
  timePrecision: TimePrecision;
  /** File name, for error messages only. */
  sourceFile: string;
  /** 1-based line in that file. */
  sourceRow: number;
}

export type PositionSide = 'LONG' | 'SHORT';

export interface RoundTrip {
  /** 1..n, ordered by exitAt then instrument key. */
  id: number;
  broker: BrokerId;
  /** 'date' when built from a file without trade times: one contract's activity on one day. */
  timePrecision: TimePrecision;
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
  broker: BrokerId;
  instrument: Instrument;
  side: PositionSide;
  qty: number;
  avgEntryPaise: number;
  openedAt: EpochMs;
  status: UnclosedStatus;
}

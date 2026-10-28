import type { BrokerId, Exchange, IstDate, Paise } from '../types';

export interface ChargesBreakdown {
  brokerage: Paise;
  stt: Paise;
  exchangeTxn: Paise;
  sebi: Paise;
  stampDuty: Paise;
  gst: Paise;
  /** IPFT, clearing and other charges; only brokers' own statements report these. */
  other: Paise;
  /** Sum of the above. */
  total: Paise;
}

export interface BrokerageRates {
  optionsPerOrderPaise: RateWindow<Paise>[];
  /** min(capPaise, pct × order value) per executed order. */
  futuresPerOrder: RateWindow<{ capPaise: Paise; pct: Rational }>[];
}

/** An exact rate: value × num / den. 0.03% = { num: 3, den: 10_000 }. */
export interface Rational {
  num: number;
  den: number;
}

export interface RateWindow<T> {
  /** Inclusive IST date. */
  effectiveFrom: IstDate;
  /** Inclusive; absent = open-ended. */
  effectiveTo?: IstDate;
  value: T;
  /** Where the value comes from. */
  source: string;
  /**
   * 'primary' = checked against the broker / exchange / government source;
   * 'secondary' = checked against news or third-party summaries only. Launch
   * requires every window to be 'primary' (ACCEPTANCE_CRITERIA §A).
   */
  checked: 'primary' | 'secondary';
  checkedOn: IstDate;
}

export interface ExchangeTxnRates {
  indexOptions: RateWindow<Rational>[];
  stockOptions: RateWindow<Rational>[];
  futures: RateWindow<Rational>[];
}

export interface ChargeRateTable {
  /** Bump on any change. */
  version: string;
  /** Underlyings charged at index-option exchange rates. */
  indexUnderlyings: Record<Exchange, readonly string[]>;
  /** Per broker. Brokers whose exports carry their own charges (Angel One, Dhan) need none. */
  brokerage: Partial<Record<BrokerId, BrokerageRates>>;
  stt: {
    optionsSellOnPremium: RateWindow<Rational>[];
    futuresSell: RateWindow<Rational>[];
  };
  exchangeTxn: Record<Exchange, ExchangeTxnRates>;
  sebi: RateWindow<Rational>[];
  stampDutyBuy: {
    options: RateWindow<Rational>[];
    futures: RateWindow<Rational>[];
  };
  /** Applied to brokerage + exchange transaction charges + SEBI fees. */
  gst: RateWindow<Rational>[];
}

/** Charges a broker's own file reports, for one day (Angel One, Dhan). */
export interface ChargeRecord {
  broker: BrokerId;
  /**
   * Stable within the broker's exports (e.g. a trade or bill number), so a
   * record in two overlapping files is counted once.
   */
  id: string;
  date: IstDate;
  charges: ChargesBreakdown;
}

/** A broker whose export carries its own charges; its fills are never estimated. */
export interface ReportedCharges {
  broker: BrokerId;
  records: ChargeRecord[];
}

/** Zerodha equity (cash market) charges (docs/SPEC.md §5, AC-3.1.7). */
export interface EquityRateTable {
  version: string;
  /** Intraday units: min(capPaise, pct × the order's intraday value) per executed order. Delivery is free. */
  intradayBrokerage: RateWindow<{ capPaise: Paise; pct: Rational }>[];
  stt: { intradaySell: RateWindow<Rational>[]; delivery: RateWindow<Rational>[] };
  exchangeTxn: Record<Exchange, RateWindow<Rational>[]>;
  /** BSE groups charged at the BSE rate above; other groups have rates we haven't checked. */
  bseGroups: readonly string[];
  sebi: RateWindow<Rational>[];
  stampDutyBuy: { intraday: RateWindow<Rational>[]; delivery: RateWindow<Rational>[] };
  gst: RateWindow<Rational>[];
}

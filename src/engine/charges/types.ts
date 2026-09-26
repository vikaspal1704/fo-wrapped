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

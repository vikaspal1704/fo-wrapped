/** Equity (cash market) trades for the Trade Journal (docs/SPEC.md US-3.1). */
import type { ChargesBreakdown } from '../charges/types';
import type { EpochMs, Exchange, IstDate, Paise, Side } from '../types';

/** One executed equity trade from a Zerodha Console equity tradebook. */
export interface EquityFill {
  broker: 'zerodha';
  tradeId: string;
  orderId: string;
  /** Exchange symbol at the time of the trade (it can change; the ISIN doesn't). */
  symbol: string;
  /** Holdings are kept per ISIN, so NSE and BSE trades of one stock share them. */
  isin: string;
  exchange: Exchange;
  /** NSE series (EQ, BE, …) or BSE group (A, B, …); BSE charges depend on it. */
  series: string;
  side: Side;
  auction: boolean;
  /** Positive whole number of shares. */
  qty: number;
  pricePaise: Paise;
  /** Exact: qty × price. */
  valuePaise: Paise;
  tradeDate: IstDate;
  executedAt: EpochMs;
  sourceFile: string;
  sourceRow: number;
}

/** One stock's same-day buys and sells that matched (AC-3.1.3). */
export interface IntradayResult {
  isin: string;
  symbol: string;
  date: IstDate;
  qty: number;
  buyValuePaise: Paise;
  sellValuePaise: Paise;
  pnlPaise: Paise;
}

/** One stock's delivery sale on one day, matched FIFO to earlier buys (AC-3.1.4). */
export interface DeliverySale {
  isin: string;
  symbol: string;
  date: IstDate;
  qty: number;
  costPaise: Paise;
  proceedsPaise: Paise;
  pnlPaise: Paise;
  /** Dates of the oldest and newest buy this sale used. */
  boughtFrom: IstDate;
  boughtTo: IstDate;
}

/** Shares sold that the file doesn't show being bought (AC-3.1.5). Left out of P&L. */
export interface UnmatchedSale {
  isin: string;
  symbol: string;
  date: IstDate;
  qty: number;
}

/** Shares still held at the end of the file, at cost (AC-3.1.6). */
export interface Holding {
  isin: string;
  symbol: string;
  qty: number;
  costPaise: Paise;
  /** costPaise / qty; may be fractional, display only. */
  avgPricePaise: number;
  firstBought: IstDate;
}

export type EquityCharges =
  | {
      available: true;
      breakdown: ChargesBreakdown;
      /** Brokerage and its GST estimated on intraday units: the most it overstates if they were CNC orders (AC-3.1.8). */
      intradayBrokerageWithGstPaise: Paise;
    }
  | { available: false; reason: string };

export interface EquitySummary {
  from: IstDate;
  to: IstDate;
  trades: number;
  intraday: IntradayResult[];
  sales: DeliverySale[];
  unmatched: UnmatchedSale[];
  holdings: Holding[];
  intradayPnlPaise: Paise;
  deliveryPnlPaise: Paise;
  charges: EquityCharges;
  /** Stock-days with a delivery sale: each is one DP charge the tradebook doesn't show (AC-3.1.9). */
  dpStockDays: number;
}

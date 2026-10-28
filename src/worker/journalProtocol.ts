import type { ChargeRecord, EquityFill, EquitySummary, Fill, IstDate, Locale, PnlStatement, RuleBreach, RuleGap, Rules, WeeklyReport } from '../engine';
import type { Localized } from './protocol';

/** One saved import as the worker needs it. */
export interface ImportData {
  fills: Fill[];
  charges: ChargeRecord[];
  statements: PnlStatement[];
  equity: EquityFill[];
}

/** A closed trade, for attaching notes. */
export interface TradeRow {
  key: string;
  exitDate: IstDate;
  symbol: string;
  grossPnlPaise: number;
}

export interface JournalReport {
  weekly: WeeklyReport | null;
  breaches: RuleBreach[];
  gaps: RuleGap[];
  trades: TradeRow[];
  /** Equity results (US-3.1), or null without equity trades. */
  equity: EquitySummary | null;
}

export type JournalRequest =
  | { type: 'read'; files: { name: string; bytes: ArrayBuffer }[] }
  | { type: 'report'; imports: ImportData[]; rules: Rules; week: IstDate | null };

export interface ReadResult {
  name: string;
  ok: boolean;
  broker?: string;
  fills?: Fill[];
  charges?: ChargeRecord[];
  statement?: PnlStatement;
  equity?: EquityFill[];
  message?: Localized;
}

export type JournalResponse =
  | { type: 'read'; results: ReadResult[] }
  | { type: 'report'; reports: Record<Locale, JournalReport> }
  | { type: 'error'; message: Localized };

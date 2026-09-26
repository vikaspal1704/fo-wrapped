import type { AnalysisResult, BrokerId, IstDate, Locale } from '../engine';

export type Stage = 'reading' | 'validating' | 'matching' | 'cards';

/** A message in every supported language, so the UI can switch instantly. */
export type Localized = Record<Locale, string>;

export type WorkerRequest = { type: 'analyze'; files: { name: string; bytes: ArrayBuffer }[] };

export type WorkerResponse =
  | { type: 'progress'; stage: Stage; pct: number }
  /** `statement` is set for a Zerodha P&L statement (rows is then 0). */
  | { type: 'fileAccepted'; name: string; broker: BrokerId; rows: number; statement?: { from: IstDate; to: IstDate } }
  | { type: 'fileRejected'; name: string; message: Localized }
  | { type: 'result'; results: Record<Locale, AnalysisResult> }
  | { type: 'error'; message: Localized };

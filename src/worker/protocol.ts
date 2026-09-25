import type { AnalysisResult } from '../engine';

export type Stage = 'reading' | 'validating' | 'matching' | 'cards';

export type WorkerRequest = { type: 'analyze'; files: { name: string; bytes: ArrayBuffer }[] };

export type WorkerResponse =
  | { type: 'progress'; stage: Stage; pct: number }
  | { type: 'fileAccepted'; name: string; rows: number }
  | { type: 'fileRejected'; name: string; message: string }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string };

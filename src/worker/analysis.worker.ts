/// <reference lib="webworker" />
import { FoWrappedError, RATES, analyze, parseTradebookFile, type Fill } from '../engine';
import { SITE_URL } from '../config';
import type { WorkerRequest, WorkerResponse } from './protocol';

// All user data lives in this worker while it is analysed. Only progress,
// per-file status and the final AnalysisResult are posted back.
const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { files } = event.data;
  try {
    post({ type: 'progress', stage: 'validating', pct: 10 });
    const tradebooks: Fill[][] = [];
    for (const [i, file] of files.entries()) {
      try {
        const fills = await parseTradebookFile(file.name, file.bytes);
        tradebooks.push(fills);
        post({ type: 'fileAccepted', name: file.name, rows: fills.length });
      } catch (e) {
        post({ type: 'fileRejected', name: file.name, message: messageOf(e) });
      }
      post({ type: 'progress', stage: 'validating', pct: 10 + Math.round((50 * (i + 1)) / files.length) });
    }

    if (tradebooks.length === 0) {
      post({ type: 'error', message: 'None of the files could be read. See the details above.' });
      return;
    }

    post({ type: 'progress', stage: 'matching', pct: 70 });
    const result = analyze({ tradebooks, rates: RATES, siteUrl: SITE_URL });
    post({ type: 'progress', stage: 'cards', pct: 100 });
    post({ type: 'result', result });
  } catch (e) {
    post({ type: 'error', message: messageOf(e) });
  }
};

function messageOf(e: unknown): string {
  if (e instanceof FoWrappedError) return e.userMessage;
  return 'Something went wrong while reading your files. Please try again with a fresh download.';
}

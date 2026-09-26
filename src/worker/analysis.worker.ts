/// <reference lib="webworker" />
import { FoWrappedError, RATES, analyze, engineMessages, parseTradebookFile, withLocale, type Fill, type Locale } from '../engine';
import { SITE_URL } from '../config';
import type { Localized, WorkerRequest, WorkerResponse } from './protocol';

// All user data lives in this worker while it is analysed. Only progress,
// per-file status and the final results (in each language) are posted back.
const LOCALES: Locale[] = ['en', 'hi'];
const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

async function localized(make: () => string | Promise<string>): Promise<Localized> {
  const out = {} as Localized;
  for (const l of LOCALES) out[l] = await withLocale(l, make);
  return out;
}

async function messageOf(e: unknown, file?: { name: string; bytes: ArrayBuffer }): Promise<Localized> {
  if (e instanceof FoWrappedError && file) {
    // Re-run the (cheap) parse in each language to get the same error translated.
    return localized(async () => {
      try {
        await parseTradebookFile(file.name, file.bytes);
      } catch (err) {
        if (err instanceof FoWrappedError) return err.userMessage;
      }
      return (e as FoWrappedError).userMessage;
    });
  }
  return localized(() => engineMessages().genericFailure);
}

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
        post({ type: 'fileRejected', name: file.name, message: await messageOf(e, file) });
      }
      post({ type: 'progress', stage: 'validating', pct: 10 + Math.round((50 * (i + 1)) / files.length) });
    }

    if (tradebooks.length === 0) {
      post({ type: 'error', message: await localized(() => engineMessages().noFilesRead) });
      return;
    }

    post({ type: 'progress', stage: 'matching', pct: 70 });
    const results = {} as Record<Locale, ReturnType<typeof analyze>>;
    for (const l of LOCALES) results[l] = await withLocale(l, () => analyze({ tradebooks, rates: RATES, siteUrl: SITE_URL }));
    post({ type: 'progress', stage: 'cards', pct: 100 });
    post({ type: 'result', results });
  } catch (e) {
    post({ type: 'error', message: await messageOf(e) });
  }
};

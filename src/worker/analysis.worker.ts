/// <reference lib="webworker" />
import {
  FoWrappedError,
  RATES,
  analyze,
  checkStatementCoverage,
  engineMessages,
  readBrokerFile,
  withLocale,
  type Fill,
  type Locale,
  type PnlStatement,
  type ReportedCharges,
} from '../engine';
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

/**
 * The error `attempt` throws, in every language. Engine errors are built in
 * the current locale, so the (cheap) step is re-run once per language.
 */
async function errorMessage(e: unknown, attempt?: () => unknown): Promise<Localized> {
  if (!(e instanceof FoWrappedError) || !attempt) return localized(() => engineMessages().genericFailure);
  return localized(async () => {
    try {
      await attempt();
    } catch (err) {
      if (err instanceof FoWrappedError) return err.userMessage;
    }
    return e.userMessage;
  });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { files } = event.data;
  const tradebooks: Fill[][] = [];
  const reportedCharges: ReportedCharges[] = [];
  const pnlStatements: PnlStatement[] = [];
  const run = () => analyze({ tradebooks, reportedCharges, pnlStatements, rates: RATES, siteUrl: SITE_URL });
  try {
    post({ type: 'progress', stage: 'validating', pct: 10 });
    const statements: { name: string; statement: PnlStatement }[] = [];
    for (const [i, file] of files.entries()) {
      const read = () => readBrokerFile(file.name, file.bytes);
      try {
        const got = await read();
        if (got.kind === 'pnlStatement') {
          // Accepted once the tradebooks are known (below).
          statements.push({ name: file.name, statement: got.statement });
        } else {
          tradebooks.push(got.fills);
          if (got.charges) reportedCharges.push({ broker: got.broker, records: got.charges });
          post({ type: 'fileAccepted', name: file.name, broker: got.broker, rows: got.fills.length });
        }
      } catch (e) {
        post({ type: 'fileRejected', name: file.name, message: await errorMessage(e, read) });
      }
      post({ type: 'progress', stage: 'validating', pct: 10 + Math.round((50 * (i + 1)) / files.length) });
    }

    const zerodhaDates = tradebooks.flat().filter((f) => f.broker === 'zerodha').map((f) => f.tradeDate);
    for (const { name, statement } of statements) {
      const check = () => checkStatementCoverage(name, statement, zerodhaDates);
      try {
        check();
        pnlStatements.push(statement);
        post({ type: 'fileAccepted', name, broker: 'zerodha', rows: 0, statement: { from: statement.periodFrom, to: statement.periodTo } });
      } catch (e) {
        post({ type: 'fileRejected', name, message: await errorMessage(e, check) });
      }
    }

    if (tradebooks.length === 0) {
      post({ type: 'error', message: await localized(() => engineMessages().noFilesRead) });
      return;
    }

    post({ type: 'progress', stage: 'matching', pct: 70 });
    const results = {} as Record<Locale, ReturnType<typeof analyze>>;
    for (const l of LOCALES) {
      results[l] = await withLocale(l, run);
    }
    post({ type: 'progress', stage: 'cards', pct: 100 });
    post({ type: 'result', results });
  } catch (e) {
    // Errors across files (e.g. the same trade with different details).
    post({ type: 'error', message: await errorMessage(e, run) });
  }
};

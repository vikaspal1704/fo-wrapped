/// <reference lib="webworker" />
// The Journal's analysis worker: reads files and builds reports. Like the
// Wrapped worker it never touches storage or the network; the page stores
// what it returns, on the device only (ADR-0003).
import {
  EQUITY_RATES,
  FoWrappedError,
  RATES,
  analyze,
  analyzeEquity,
  checkRules,
  engineMessages,
  readBrokerFile,
  tradeKey,
  weeklyReport,
  withLocale,
  type Locale,
  type ReportedCharges,
} from '../engine';
import { SITE_URL } from '../config';
import type { JournalReport, JournalRequest, JournalResponse, ReadResult } from './journalProtocol';
import type { Localized } from './protocol';

const LOCALES: Locale[] = ['en', 'hi'];
const post = (msg: JournalResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

async function localized(make: () => string | Promise<string>): Promise<Localized> {
  const out = {} as Localized;
  for (const l of LOCALES) out[l] = await withLocale(l, make);
  return out;
}

async function messageFor(e: unknown, retry: () => unknown): Promise<Localized> {
  if (!(e instanceof FoWrappedError)) return localized(() => engineMessages().genericFailure);
  return localized(async () => {
    try {
      await retry();
    } catch (err) {
      if (err instanceof FoWrappedError) return err.userMessage;
    }
    return e.userMessage;
  });
}

async function read(files: { name: string; bytes: ArrayBuffer }[]): Promise<ReadResult[]> {
  const out: ReadResult[] = [];
  for (const f of files) {
    const attempt = () => readBrokerFile(f.name, f.bytes, { equity: true });
    try {
      const got = await attempt();
      if (got.kind === 'pnlStatement') out.push({ name: f.name, ok: true, broker: 'zerodha', statement: got.statement });
      else if (got.kind === 'equity') out.push({ name: f.name, ok: true, broker: got.broker, equity: got.fills });
      else out.push({ name: f.name, ok: true, broker: got.broker, fills: got.fills, charges: got.charges ?? [] });
    } catch (e) {
      out.push({ name: f.name, ok: false, message: await messageFor(e, attempt) });
    }
  }
  return out;
}

function report(req: Extract<JournalRequest, { type: 'report' }>): JournalReport {
  const equity = analyzeEquity(req.imports.flatMap((i) => i.equity), EQUITY_RATES);
  const tradebooks = req.imports.map((i) => i.fills).filter((f) => f.length > 0);
  if (tradebooks.length === 0) return { weekly: null, breaches: [], gaps: [], trades: [], equity };
  const byBroker = new Map<string, ReportedCharges>();
  for (const rec of req.imports.flatMap((i) => i.charges)) {
    const r = byBroker.get(rec.broker) ?? { broker: rec.broker, records: [] };
    r.records.push(rec);
    byBroker.set(rec.broker, r);
  }
  const reportedCharges = [...byBroker.values()];
  const pnlStatements = req.imports.flatMap((i) => i.statements);
  const all = analyze({ tradebooks, reportedCharges, pnlStatements, rates: RATES, siteUrl: SITE_URL });
  const { breaches, gaps } = checkRules(all.roundTrips, req.rules);
  const weekly = weeklyReport({ tradebooks, reportedCharges, pnlStatements, rates: RATES, rules: req.rules, siteUrl: SITE_URL, week: req.week ?? undefined });
  const trades = all.roundTrips
    .slice(-200)
    .reverse()
    .map((rt) => ({ key: tradeKey(rt), exitDate: rt.exitDate, symbol: rt.instrument.tradingSymbol, grossPnlPaise: rt.grossPnlPaise }));
  return { weekly, breaches, gaps, trades, equity };
}

self.onmessage = async (event: MessageEvent<JournalRequest>) => {
  const req = event.data;
  try {
    if (req.type === 'read') {
      post({ type: 'read', results: await read(req.files) });
      return;
    }
    const reports = {} as Record<Locale, JournalReport>;
    for (const l of LOCALES) reports[l] = await withLocale(l, () => report(req));
    post({ type: 'report', reports });
  } catch (e) {
    post({ type: 'error', message: await messageFor(e, () => (req.type === 'report' ? report(req) : undefined)) });
  }
};

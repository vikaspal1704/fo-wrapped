/**
 * Trade Journal screens (docs/SPEC.md §4, §5). Lazy-loaded at #journal so Wrapped's
 * bundle and storage rules are unchanged (ADR-0001).
 */
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LanguageToggle, useLocale } from '../../app/i18n';
import { formatInr } from '../../engine/format';
import { normalizeTags, searchNotes, type Note } from '../../engine/journal/notes';
import type { Rules } from '../../engine/journal/rules';
import type { IstDate } from '../../engine/types';
import { SITE_LABEL } from '../../config';
import { download, renderPng } from '../../share/exportImage';
import type { JournalReport } from '../../worker/journalProtocol';
import { planPrices } from '../cloud/config';
import { useJt, type JournalMessages } from './i18n';
import { useCloud } from './useCloud';
import { useJournal, type JournalState, type Notice } from './useJournal';

type Tab = 'history' | 'equity' | 'rules' | 'report' | 'notes' | 'account';

export function JournalApp({ onBack }: { onBack: () => void }) {
  const t = useJt();
  const journal = useJournal();
  const { state } = journal;
  const cloud = useCloud(journal.db, state.status === 'ready', journal.reload);
  // Coming back from Google sign-in lands on the Account tab.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('code') ? 'account' : 'history'));
  const tabs: Tab[] = ['history', 'equity', 'rules', 'report', 'notes', ...(cloud.cloud.enabled ? (['account'] as const) : [])];
  const locked = cloud.cloud.enabled && !cloud.cloud.unlocked && tab !== 'account';

  return (
    <main className="landing page journal">
      <div className="top-row">
        <button type="button" className="link" onClick={onBack}>
          {t.back}
        </button>
        <LanguageToggle />
      </div>
      <h1>{t.title}</h1>
      <p className="tagline">{t.tagline}</p>
      <NoticeBanner notice={state.notice} t={t} />

      {state.status === 'checking' && <p className="muted">…</p>}
      {state.status === 'off' && (
        <section className="journal-panel" aria-labelledby="enable">
          <h2 id="enable">{t.enableTitle}</h2>
          <p>{t.enableBody}</p>
          <button type="button" className="primary" onClick={() => void journal.enable()}>
            {t.enable}
          </button>
        </section>
      )}
      {state.status === 'ready' && (
        <>
          <p className="muted">🔒 {t.localOnly}</p>
          <nav className="journal-tabs" aria-label={t.title}>
            {tabs.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={tab === id} onClick={() => setTab(id)}>
                {t.tabs[id]}
              </button>
            ))}
          </nav>
          {locked ? (
            <>
              <p className="alert small">{t.locked}</p>
              {/* Your own data is never held hostage (AC-2.10.5). */}
              <Confirm label={t.deleteAll} warn={t.deleteWarn} confirm={t.deleteConfirm} onConfirm={() => void journal.removeEverything()} />
            </>
          ) : (
            <>
              {tab === 'history' && <History journal={journal} />}
              {tab === 'equity' && <EquityTab state={state} />}
              {tab === 'rules' && <RulesTab journal={journal} />}
              {tab === 'report' && <ReportTab state={state} />}
              {tab === 'notes' && <NotesTab journal={journal} />}
              {tab === 'account' && <AccountTab cloud={cloud} />}
            </>
          )}
        </>
      )}
    </main>
  );
}

type Journal = ReturnType<typeof useJournal>;

function NoticeBanner({ notice, t }: { notice: Notice | null; t: JournalMessages }) {
  const { locale } = useLocale();
  if (!notice) return null;
  const text =
    notice.kind === 'error'
      ? notice.text[locale]
      : notice.code === 'imported'
        ? t.imported(notice.added, notice.duplicates)
        : notice.code === 'deleted'
          ? t.deleted
          : t.nothingNew;
  return (
    <p className={notice.kind === 'error' ? 'alert' : 'notice'} role={notice.kind === 'error' ? 'alert' : 'status'}>
      {text}
    </p>
  );
}

const dateOf = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

function History({ journal }: { journal: Journal }) {
  const t = useJt();
  const input = useRef<HTMLInputElement>(null);
  const { imports, busy } = journal.state;
  return (
    <section aria-labelledby="history">
      <h2 id="history">{t.tabs.history}</h2>
      <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t.importing : t.addFiles}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        data-testid="journal-file-input"
        onChange={(e) => {
          void journal.addFiles(e.target.files ? [...e.target.files] : []);
          e.target.value = '';
        }}
      />
      {imports.length === 0 ? (
        <p className="muted">{t.historyEmpty}</p>
      ) : (
        <ul className="files" aria-label={t.tabs.history}>
          {[...imports].reverse().map((i) => (
            <li key={i.id} className="ok">
              {t.importRow(i.label, dateOf(i.at), i.counts.added, i.counts.duplicates)}{' '}
              <button type="button" className="link" aria-label={t.undoLabel(i.label)} onClick={() => void journal.undoImport(i.id)}>
                {t.undo}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Confirm label={t.deleteAll} warn={t.deleteWarn} confirm={t.deleteConfirm} onConfirm={() => void journal.removeEverything()} />
    </section>
  );
}

const RULE_FIELDS: { key: keyof Rules; label: keyof JournalMessages }[] = [
  { key: 'maxLossPerDayRupees', label: 'ruleMaxLoss' },
  { key: 'maxTradesPerDay', label: 'ruleMaxTrades' },
  { key: 'stopAfterLosses', label: 'ruleStreak' },
  { key: 'noTradesFirstMinutes', label: 'ruleOpening' },
];

function RulesTab({ journal }: { journal: Journal }) {
  const t = useJt();
  const { locale } = useLocale();
  const [draft, setDraft] = useState<Record<keyof Rules, string>>(() => {
    const r = journal.state.rules;
    return {
      maxLossPerDayRupees: r.maxLossPerDayRupees?.toString() ?? '',
      maxTradesPerDay: r.maxTradesPerDay?.toString() ?? '',
      stopAfterLosses: r.stopAfterLosses?.toString() ?? '',
      noTradesFirstMinutes: r.noTradesFirstMinutes?.toString() ?? '',
    };
  });
  const [status, setStatus] = useState<string | null>(null);
  const report = journal.state.reports?.[locale];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]));
    setStatus((await journal.saveRules(parsed)) ? t.rulesSaved : t.rulesInvalid);
  };
  return (
    <section aria-labelledby="rules">
      <h2 id="rules">{t.tabs.rules}</h2>
      <p className="muted">{t.rulesIntro}</p>
      <FoOnlyNote state={journal.state} />
      <form className="journal-form" onSubmit={(e) => void submit(e)}>
        {RULE_FIELDS.map((f) => (
          <label key={f.key}>
            {t[f.label] as string}
            <input inputMode="numeric" value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
          </label>
        ))}
        <button type="submit" className="primary">
          {t.saveRules}
        </button>
        {status && <p role="status">{status}</p>}
      </form>
      {report && (
        <>
          <h3>{t.breachesTitle}</h3>
          {report.breaches.length === 0 ? (
            <p className="muted">{t.noBreaches}</p>
          ) : (
            <ul className="notes" data-testid="breaches">
              {report.breaches.map((b) => (
                <li key={`${b.rule}-${b.date}`}>{b.message}</li>
              ))}
            </ul>
          )}
          {report.gaps.length > 0 && (
            <>
              <h3>{t.gapsTitle}</h3>
              <ul className="notes">
                {report.gaps.map((g) => (
                  <li key={`${g.rule}-${g.date}`}>{g.message}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ReportTab({ state }: { state: JournalState }) {
  const t = useJt();
  const { locale } = useLocale();
  const imageRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const weekly = state.reports?.[locale]?.weekly ?? null;
  if (!weekly)
    return (
      <>
        <p className="muted">{t.reportEmpty}</p>
        <FoOnlyNote state={state} />
      </>
    );
  const headline = weekly.netPnlPaise !== null ? { label: t.net, value: formatInr(weekly.netPnlPaise) } : { label: t.gross, value: formatInr(weekly.grossPnlPaise) };
  const save = async () => {
    if (!imageRef.current) return;
    download(await renderPng(imageRef.current), `fo-journal-${weekly.period.id}.png`);
    setStatus(t.imageSaved);
  };
  return (
    <section aria-labelledby="report">
      <h2 id="report">{t.reportTitle(weekly.period.label)}</h2>
      <dl className="headlines">
        <div>
          <dt>{headline.label}</dt>
          <dd>{headline.value}</dd>
        </div>
        <div>
          <dt>{t.trades}</dt>
          <dd>{weekly.trades}</dd>
        </div>
      </dl>
      {weekly.chargesEstimated && <p className="muted">{t.estimated}</p>}
      <FoOnlyNote state={state} />
      {weekly.breaches.length > 0 && (
        <>
          <h3>{t.breachesTitle}</h3>
          <ul className="notes">
            {weekly.breaches.map((b) => (
              <li key={`${b.rule}-${b.date}`}>{b.message}</li>
            ))}
          </ul>
        </>
      )}
      {weekly.insights.length > 0 && (
        <>
          <h3>{t.insightsTitle}</h3>
          <ul className="notes" data-testid="insights">
            {weekly.insights.map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="primary" onClick={() => void save()}>
        {t.downloadReport}
      </button>
      {status && <p role="status">{status}</p>}
      <p className="muted disclaimer">{t.disclaimer}</p>
      {/* Off-screen 1080×1920 source for the image: the week's headline numbers, the URL and the disclaimer only. */}
      <div className="share-image" ref={imageRef} aria-hidden="true" data-testid="journal-share-image">
        <p className="si-eyebrow">{t.title}</p>
        <p className="si-year">{weekly.period.label}</p>
        <div className="si-stats">
          <div>
            <p className="si-label">{headline.label}</p>
            <p className="si-value">{headline.value}</p>
          </div>
          <div>
            <p className="si-label">{t.trades}</p>
            <p className="si-value">{weekly.trades}</p>
          </div>
        </div>
        <p className="si-url">{SITE_LABEL}</p>
        <p className="si-disclaimer">{t.disclaimer}</p>
      </div>
    </section>
  );
}

/** Rules and the weekly report don't cover equity yet (AC-3.1.15); say so where it matters. */
function FoOnlyNote({ state }: { state: JournalState }) {
  const t = useJt();
  if (!state.imports.some((i) => (i.equity?.length ?? 0) > 0)) return null;
  return <p className="muted">{t.foOnly}</p>;
}

/** The latest rows of a list, newest first. */
const LIST_LIMIT = 100;
const latest = <T,>(xs: readonly T[]) => xs.slice(-LIST_LIMIT).reverse();

/** Equity results (docs/SPEC.md AC-3.1.11): what happened, at cost, with every gap in words. */
function EquityTab({ state }: { state: JournalState }) {
  const t = useJt();
  const { locale } = useLocale();
  const eq = state.reports?.[locale]?.equity ?? null;
  if (!eq) return <p className="muted">{t.eqEmpty}</p>;
  const gross = eq.intradayPnlPaise + eq.deliveryPnlPaise;
  return (
    <section aria-labelledby="equity">
      <h2 id="equity">{t.tabs.equity}</h2>
      <p className="muted">{t.eqPeriod(eq.from, eq.to, eq.trades)}</p>
      <dl className="headlines" data-testid="equity-headlines">
        <div>
          <dt>{t.eqIntraday}</dt>
          <dd>{formatInr(eq.intradayPnlPaise)}</dd>
        </div>
        <div>
          <dt>{t.eqDelivery}</dt>
          <dd>{formatInr(eq.deliveryPnlPaise)}</dd>
        </div>
        {eq.charges.available && (
          <>
            <div>
              <dt>{t.eqCharges}</dt>
              <dd>{formatInr(eq.charges.breakdown.total)}</dd>
            </div>
            <div>
              <dt>{t.eqNet}</dt>
              <dd>{formatInr(gross - eq.charges.breakdown.total)}</dd>
            </div>
          </>
        )}
      </dl>
      <ul className="notes" data-testid="equity-gaps">
        <li>{t.eqBeforeCharges}</li>
        <li>{t.eqMethod}</li>
        {eq.charges.available ? (
          eq.charges.intradayBrokerageWithGstPaise > 0 && <li>{t.eqBrokerageGap(formatInr(eq.charges.intradayBrokerageWithGstPaise))}</li>
        ) : (
          <li>{eq.charges.reason}</li>
        )}
        {eq.dpStockDays > 0 && <li>{t.eqDpGap(eq.dpStockDays)}</li>}
      </ul>
      {eq.unmatched.length > 0 && (
        <>
          <h3>{t.eqUnmatchedTitle}</h3>
          <p className="muted">{t.eqUnmatchedIntro}</p>
          <ul className="notes" data-testid="equity-unmatched">
            {latest(eq.unmatched).map((u) => (
              <li key={`${u.date}-${u.isin}`}>{t.eqUnmatchedRow(u.date, u.symbol, u.qty)}</li>
            ))}
          </ul>
        </>
      )}
      {eq.holdings.length > 0 && (
        <>
          <h3>{t.eqHoldingsTitle}</h3>
          <ul className="notes" data-testid="equity-holdings">
            {eq.holdings.map((h) => (
              <li key={h.isin}>{t.eqHoldingRow(h.symbol, h.qty, formatInr(Math.round(h.avgPricePaise)), formatInr(h.costPaise))}</li>
            ))}
          </ul>
          <p className="muted">{t.eqHoldingsNote}</p>
        </>
      )}
      <EquityList title={t.eqSalesTitle} total={eq.sales.length} testId="equity-sales">
        {latest(eq.sales).map((s) => (
          <li key={`${s.date}-${s.isin}`}>{t.eqSaleRow(s.date, s.symbol, s.qty, formatInr(s.pnlPaise), s.boughtFrom, s.boughtTo)}</li>
        ))}
      </EquityList>
      <EquityList title={t.eqIntradayTitle} total={eq.intraday.length} testId="equity-intraday">
        {latest(eq.intraday).map((d) => (
          <li key={`${d.date}-${d.isin}`}>{t.eqIntradayRow(d.date, d.symbol, d.qty, formatInr(d.pnlPaise))}</li>
        ))}
      </EquityList>
      <p className="muted disclaimer">{t.disclaimer}</p>
    </section>
  );
}

function EquityList({ title, total, testId, children }: { title: string; total: number; testId: string; children: ReactNode }) {
  const t = useJt();
  if (total === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="notes" data-testid={testId}>
        {children}
      </ul>
      {total > LIST_LIMIT && <p className="muted">{t.eqShowing(LIST_LIMIT, total)}</p>}
    </>
  );
}

function NotesTab({ journal }: { journal: Journal }) {
  const t = useJt();
  const { locale } = useLocale();
  const trades = journal.state.reports?.[locale]?.trades ?? [];
  const [kind, setKind] = useState<'day' | 'trade'>('day');
  const [date, setDate] = useState('');
  const [tradeKey, setTradeKey] = useState('');
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchNotes(journal.state.notes, query), [journal.state.notes, query]);
  const label = (n: Note) => (n.target.kind === 'day' ? n.target.date : (trades.find((x: JournalReport['trades'][number]) => x.key === (n.target as { key: string }).key)?.symbol ?? t.noteTrade));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = kind === 'day' ? (date ? { kind: 'day' as const, date: date as IstDate } : null) : tradeKey ? { kind: 'trade' as const, key: tradeKey } : null;
    if (!target || text.trim() === '') return;
    await journal.saveNote({ id: `note-${Date.now().toString(36)}`, target, text: text.trim(), tags: normalizeTags(tags), updatedAt: Date.now() });
    setText('');
    setTags('');
  };
  return (
    <section aria-labelledby="notes-h">
      <h2 id="notes-h">{t.tabs.notes}</h2>
      <p className="muted">{t.notesIntro}</p>
      <form className="journal-form" onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>{t.noteFor}</legend>
          <label>
            <input type="radio" name="note-kind" checked={kind === 'day'} onChange={() => setKind('day')} /> {t.noteDay}
          </label>
          <label>
            <input type="radio" name="note-kind" checked={kind === 'trade'} onChange={() => setKind('trade')} disabled={trades.length === 0} /> {t.noteTrade}
          </label>
        </fieldset>
        {kind === 'day' ? (
          <label>
            {t.noteDate}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        ) : (
          <label>
            {t.noteTradePick}
            <select value={tradeKey} onChange={(e) => setTradeKey(e.target.value)}>
              <option value="" />
              {trades.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.exitDate} · {x.symbol} · {formatInr(x.grossPnlPaise)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t.noteText}
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
        </label>
        <label>
          {t.noteTags}
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <button type="submit" className="primary">
          {t.saveNote}
        </button>
      </form>
      <label className="search">
        {t.search}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {journal.state.notes.length === 0 ? (
        <p className="muted">{t.noNotes}</p>
      ) : shown.length === 0 ? (
        <p className="muted">{t.noMatches}</p>
      ) : (
        <ul className="notes" data-testid="note-list">
          {shown.map((n) => (
            <li key={n.id}>
              <strong>{label(n)}</strong>: {n.text} {n.tags.map((tag) => `#${tag}`).join(' ')}{' '}
              <button type="button" className="link" onClick={() => void journal.deleteNote(n.id)}>
                {t.deleteNote}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A destructive action behind a second, explicit button. */
function Confirm({ label, warn, confirm, onConfirm, disabled = false }: { label: string; warn: string; confirm: string; onConfirm: () => void; disabled?: boolean }) {
  const t = useJt();
  const [open, setOpen] = useState(false);
  return (
    <div className="danger">
      {!open ? (
        <button type="button" className="link" disabled={disabled} onClick={() => setOpen(true)}>
          {label}
        </button>
      ) : (
        <>
          <p>{warn}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirm}
          </button>{' '}
          <button type="button" className="link" onClick={() => setOpen(false)}>
            {t.deleteCancel}
          </button>
        </>
      )}
    </div>
  );
}

function AccountTab({ cloud }: { cloud: ReturnType<typeof useCloud> }) {
  const t = useJt();
  const prices = planPrices();
  const [passphrase, setPassphrase] = useState('');
  const { session, entitlement, busy, error, synced, reminders, accountDeleted, syncedCopyDeleted } = cloud.cloud;
  const until = (entitlement?.periodEnd ?? '').slice(0, 10);
  return (
    <section aria-labelledby="account">
      <h2 id="account">{t.accountTitle}</h2>
      {error && (
        <p className="alert" role="alert">
          {error === 'passphrase' ? t.wrongPassphrase : t.error}
        </p>
      )}
      {accountDeleted && <p role="status">{t.accountDeletedNote}</p>}
      {!session ? (
        <button type="button" className="primary" onClick={() => void cloud.signIn()}>
          {t.signIn}
        </button>
      ) : (
        <>
          <p>
            {t.signedInAs(session.email ?? '')}{' '}
            <button type="button" className="link" onClick={() => void cloud.signOut()}>
              {t.signOut}
            </button>
          </p>
          {entitlement?.active ? (
            <p role="status">{entitlement.cancelAtPeriodEnd ? t.planEnds(until) : t.planActive(entitlement.plan === 'annual' ? t.planAnnual : t.planMonthly, until)}</p>
          ) : (
            <>
              <p>{t.planNone}</p>
              <button type="button" className="primary" disabled={busy} onClick={() => void cloud.subscribe('monthly')}>
                {t.subscribe(t.planMonthly, prices.monthly)}
              </button>{' '}
              <button type="button" className="secondary" disabled={busy} onClick={() => void cloud.subscribe('annual')}>
                {t.subscribe(t.planAnnual, prices.annual)}
              </button>
            </>
          )}
          {entitlement?.active && (
            <>
              <h3>{t.syncTitle}</h3>
              <p className="muted">{t.syncBody}</p>
              <p className="alert small" data-testid="key-loss-warning">
                {t.keyLoss}
              </p>
              <form
                className="journal-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void cloud.sync(passphrase);
                }}
              >
                <label>
                  {t.passphrase}
                  <input type="password" autoComplete="new-password" minLength={12} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                </label>
                <button type="submit" className="primary" disabled={busy || passphrase.length < 12}>
                  {t.syncNow}
                </button>
              </form>
              {synced && <p role="status">{t.synced(synced.up, synced.down)}</p>}
              <details>
                <summary>{t.forgot}</summary>
                <p>{t.forgotBody}</p>
              </details>
              <label className="check">
                <input type="checkbox" checked={reminders} onChange={(e) => void cloud.setReminders(e.target.checked)} /> {t.reminders}
              </label>
              {!entitlement.cancelAtPeriodEnd && (
                <Confirm label={t.cancelSub} warn={t.cancelWarn(until)} confirm={t.cancelConfirm} disabled={busy} onConfirm={() => void cloud.cancel()} />
              )}
            </>
          )}
          {syncedCopyDeleted && <p role="status">{t.syncedDeleted}</p>}
          <Confirm label={t.deleteSynced} warn={t.deleteSyncedWarn} confirm={t.deleteSyncedConfirm} disabled={busy} onConfirm={() => void cloud.removeSyncedCopy()} />
          <Confirm label={t.deleteAccount} warn={t.deleteAccountWarn} confirm={t.deleteAccountConfirm} disabled={busy} onConfirm={() => void cloud.removeAccount()} />
        </>
      )}
    </section>
  );
}

/**
 * The Journal's state: the on-device store, the analysis worker and the
 * report. Nothing is written anywhere until the user turns on "Save on this
 * device" (docs/SPEC.md AC-2.2.1, AC-2.2.2).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FoWrappedError } from '../../engine/errors';
import { m, withLocaleSync, type Locale } from '../../engine/i18n';
import { fileLabel, planEquityImport, planImport } from '../../engine/journal/imports';
import { parseRules, type Rules } from '../../engine/journal/rules';
import type { Note } from '../../engine/journal/notes';
import type { EquityFill } from '../../engine/equity/types';
import type { Fill } from '../../engine/types';
import type { JournalReport, JournalRequest, JournalResponse } from '../../worker/journalProtocol';
import type { Localized } from '../../worker/protocol';
import { deleteEverything, JOURNAL_DB, openJournal, type ImportRecord, type JournalDb } from '../store/db';

export const NO_RULES: Rules = { maxLossPerDayRupees: null, maxTradesPerDay: null, stopAfterLosses: null, noTradesFirstMinutes: null };

export type Notice =
  | { kind: 'error'; text: Localized }
  | { kind: 'ok'; code: 'nothingNew' | 'deleted' }
  | { kind: 'ok'; code: 'imported'; added: number; duplicates: number };

export interface JournalState {
  status: 'checking' | 'off' | 'ready';
  imports: ImportRecord[];
  rules: Rules;
  notes: Note[];
  reports: Record<Locale, JournalReport> | null;
  busy: boolean;
  notice: Notice | null;
}

const both = (make: () => string): Localized => ({ en: withLocaleSync('en', make), hi: withLocaleSync('hi', make) });

function newWorker(): Worker {
  return new Worker(new URL('../../worker/journal.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * A long-lived worker answering one request at a time. Requests are queued, so
 * a report started on load can't take the answer meant for a file read.
 */
function useWorker() {
  const ref = useRef<Worker | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(
    () => () => {
      ref.current?.terminate();
      ref.current = null;
    },
    [],
  );
  return useCallback((req: JournalRequest, transfer: Transferable[] = []) => {
    const run = () => {
      ref.current ??= newWorker();
      const w = ref.current;
      return new Promise<JournalResponse>((resolve) => {
        w.onmessage = (e: MessageEvent<JournalResponse>) => resolve(e.data);
        w.onerror = () => resolve({ type: 'error', message: both(() => m().genericFailure) });
        w.postMessage(req, transfer);
      });
    };
    const next = queue.current.then(run, run);
    queue.current = next;
    return next;
  }, []);
}

/** The id used for an import: unique, and the same on every device after sync. */
const importId = () => `imp-${Date.now().toString(36)}-${globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;

export function useJournal(factory: IDBFactory = indexedDB) {
  const [state, setState] = useState<JournalState>({ status: 'checking', imports: [], rules: NO_RULES, notes: [], reports: null, busy: false, notice: null });
  const dbRef = useRef<JournalDb | null>(null);
  const call = useWorker();
  const patch = (p: Partial<JournalState>) => setState((s) => ({ ...s, ...p }));

  const recompute = useCallback(
    async (imports: ImportRecord[], rules: Rules) => {
      if (imports.length === 0) return patch({ reports: null });
      const res = await call({ type: 'report', imports: imports.map(({ fills, charges, statements, equity }) => ({ fills, charges, statements, equity: equity ?? [] })), rules, week: null });
      if (res.type === 'report') patch({ reports: res.reports });
      else if (res.type === 'error') patch({ notice: { kind: 'error', text: res.message } });
    },
    [call],
  );

  const load = useCallback(
    async (db: JournalDb) => {
      dbRef.current = db;
      const [imports, rules, notes] = await Promise.all([db.listImports(), db.getRules(), db.listNotes()]);
      patch({ status: 'ready', imports, rules: rules ?? NO_RULES, notes });
      await recompute(imports, rules ?? NO_RULES);
    },
    [recompute],
  );

  // Open the store only if the user turned saving on earlier; never create it here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const exists = (await factory.databases()).some((d) => d.name === JOURNAL_DB);
      if (cancelled) return;
      if (exists) await load(await openJournal(factory));
      else patch({ status: 'off' });
    })().catch(() => patch({ status: 'off', notice: { kind: 'error', text: both(() => m().genericFailure) } }));
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [factory, load]);

  const enable = useCallback(async () => load(await openJournal(factory)), [factory, load]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const db = dbRef.current;
      if (!db || files.length === 0) return;
      patch({ busy: true, notice: null });
      try {
        const payload = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
        const res = await call({ type: 'read', files: payload }, payload.map((p) => p.bytes));
        if (res.type !== 'read') {
          patch({ notice: { kind: 'error', text: res.type === 'error' ? res.message : both(() => m().genericFailure) } });
          return;
        }
        const ok = res.results.filter((r) => r.ok);
        const failed = res.results.filter((r) => !r.ok);
        const existing: Fill[] = state.imports.flatMap((i) => i.fills);
        const incoming = ok.flatMap((r) => r.fills ?? []);
        const existingEquity: EquityFill[] = state.imports.flatMap((i) => i.equity ?? []);
        const incomingEquity = ok.flatMap((r) => r.equity ?? []);
        const plans = () => ({ fo: planImport(existing, incoming), eq: planEquityImport(existingEquity, incomingEquity) });
        let fo: { added: Fill[]; duplicates: number };
        let eq: { added: EquityFill[]; duplicates: number };
        try {
          ({ fo, eq } = plans());
        } catch (e) {
          if (!(e instanceof FoWrappedError)) throw e;
          // Engine errors are worded in the current locale; rebuild the message in each language.
          const reword = () => {
            try {
              plans();
            } catch (err) {
              if (err instanceof FoWrappedError) return err.userMessage;
            }
            return e.userMessage;
          };
          patch({ notice: { kind: 'error', text: both(reword) } });
          return;
        }
        const statements = ok.flatMap((r) => (r.statement ? [r.statement] : []));
        if (failed.length > 0 && ok.length === 0) {
          patch({ notice: { kind: 'error', text: failed[0]!.message! } });
          return;
        }
        const added = fo.added.length + eq.added.length;
        const duplicates = fo.duplicates + eq.duplicates;
        if (added === 0 && statements.length === 0) {
          patch({ notice: { kind: 'ok', code: 'nothingNew' } });
          return;
        }
        const rec: ImportRecord = {
          id: importId(),
          at: Date.now(),
          label: ok.map((r) => fileLabel(r.name)).join(', '),
          broker: [...new Set(ok.map((r) => r.broker ?? ''))].join(', '),
          counts: { added, duplicates, rejected: failed.length },
          fills: fo.added,
          charges: ok.flatMap((r) => r.charges ?? []),
          statements,
          ...(eq.added.length > 0 ? { equity: eq.added } : {}),
        };
        await db.saveImport(rec);
        const imports = await db.listImports();
        patch({ imports, notice: { kind: 'ok', code: 'imported', added, duplicates } });
        await recompute(imports, state.rules);
      } finally {
        patch({ busy: false });
      }
    },
    [call, recompute, state.imports, state.rules],
  );

  const undoImport = useCallback(
    async (id: string) => {
      const db = dbRef.current;
      if (!db) return;
      await db.deleteImport(id);
      await db.putSync({ localId: `imports:${id}`, dirty: true, deleted: true, updatedAt: Date.now() });
      const imports = await db.listImports();
      patch({ imports });
      await recompute(imports, state.rules);
    },
    [recompute, state.rules],
  );

  const saveRules = useCallback(
    async (input: unknown) => {
      const db = dbRef.current;
      if (!db) return false;
      let rules: Rules;
      try {
        rules = parseRules(input);
      } catch {
        return false;
      }
      await db.saveRules(rules);
      patch({ rules });
      await recompute(state.imports, rules);
      return true;
    },
    [recompute, state.imports],
  );

  const saveNote = useCallback(async (note: Note) => {
    const db = dbRef.current;
    if (!db) return;
    await db.saveNote(note);
    patch({ notes: await db.listNotes() });
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    const db = dbRef.current;
    if (!db) return;
    await db.deleteNote(id);
    await db.putSync({ localId: `notes:${id}`, dirty: true, deleted: true, updatedAt: Date.now() });
    patch({ notes: await db.listNotes() });
  }, []);

  const removeEverything = useCallback(async () => {
    dbRef.current?.close();
    dbRef.current = null;
    const gone = await deleteEverything(factory);
    setState({ status: 'off', imports: [], rules: NO_RULES, notes: [], reports: null, busy: false, notice: gone ? { kind: 'ok', code: 'deleted' } : null });
  }, [factory]);

  /** Reloads everything from the store, e.g. after a sync wrote to it. */
  const reload = useCallback(async () => {
    if (dbRef.current) await load(dbRef.current);
  }, [load]);

  return { state, db: dbRef, enable, addFiles, undoImport, saveRules, saveNote, deleteNote, removeEverything, reload };
}

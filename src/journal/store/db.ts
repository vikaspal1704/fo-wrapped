/**
 * The Journal's on-device store (ADR-0003, docs/SPEC.md US-2.2). Opened only
 * after the user turns on "Save on this device". The IndexedDB factory is
 * injected so tests can use an in-memory one.
 */
import { z } from 'zod';
import { parseNote, parseRules, type ChargeRecord, type EquityFill, type Fill, type Note, type PnlStatement, type Rules } from '../../engine';

export const JOURNAL_DB = 'fo-journal';

/** One import, with its fills, so undo is one delete (AC-2.4.3). */
export interface ImportRecord {
  id: string;
  /** Epoch ms when it was imported. */
  at: number;
  /** File names with the client ID masked (PV-3). */
  label: string;
  broker: string;
  counts: { added: number; duplicates: number; rejected: number };
  fills: Fill[];
  charges: ChargeRecord[];
  statements: PnlStatement[];
  /** Equity trades (docs/SPEC.md US-3.1). Absent on imports saved before equity support. */
  equity?: EquityFill[];
}

const ImportShape = z.object({
  id: z.string().min(1),
  at: z.number().int(),
  label: z.string(),
  broker: z.string(),
  counts: z.object({ added: z.number().int(), duplicates: z.number().int(), rejected: z.number().int() }),
  fills: z.array(z.object({ tradeId: z.string(), broker: z.string() }).passthrough()),
  charges: z.array(z.unknown()),
  statements: z.array(z.unknown()),
  equity: z.array(z.object({ tradeId: z.string(), isin: z.string() }).passthrough()).optional(),
});

/** One step per schema version: MIGRATIONS[n] upgrades version n to n + 1. */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

export const MIGRATIONS: readonly Migration[] = [
  // v1: the first layout.
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('imports', { keyPath: 'id' }).createIndex('at', 'at');
    db.createObjectStore('rules', { keyPath: 'id' });
    db.createObjectStore('notes', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    db.createObjectStore('session', { keyPath: 'key' });
  },
  // v2: sync state per local record (dirty flag, last pushed hash).
  (db) => {
    db.createObjectStore('sync', { keyPath: 'localId' });
  },
];

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

export interface SyncState {
  localId: string;
  dirty: boolean;
  deleted: boolean;
  updatedAt: number;
}

export interface JournalDb {
  version: number;
  close(): void;
  saveImport(rec: ImportRecord): Promise<void>;
  listImports(): Promise<ImportRecord[]>;
  deleteImport(id: string): Promise<void>;
  getRules(): Promise<Rules | null>;
  saveRules(rules: Rules): Promise<void>;
  listNotes(): Promise<Note[]>;
  saveNote(note: Note): Promise<void>;
  deleteNote(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
  getSession<T>(key: string): Promise<T | null>;
  setSession(key: string, value: unknown): Promise<void>;
  clearSession(): Promise<void>;
  listSync(): Promise<SyncState[]>;
  putSync(state: SyncState): Promise<void>;
}

/** Opens (and if needed upgrades) the store. A failing migration aborts and leaves the old version untouched. */
export function openJournal(factory: IDBFactory, migrations: readonly Migration[] = MIGRATIONS): Promise<JournalDb> {
  return new Promise((resolve, reject) => {
    const open = factory.open(JOURNAL_DB, migrations.length);
    open.onupgradeneeded = (e) => {
      const db = open.result;
      const tx = open.transaction!;
      try {
        for (let v = e.oldVersion; v < migrations.length; v++) migrations[v]!(db, tx);
      } catch (err) {
        tx.abort();
        reject(err);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(wrap(open.result));
  });
}

function wrap(db: IDBDatabase): JournalDb {
  const store = (name: string, mode: IDBTransactionMode = 'readonly') => {
    const tx = db.transaction(name, mode);
    return { s: tx.objectStore(name), tx };
  };
  const put = async (name: string, value: unknown) => {
    const { s, tx } = store(name, 'readwrite');
    s.put(value);
    await done(tx);
  };
  const del = async (name: string, key: string) => {
    const { s, tx } = store(name, 'readwrite');
    s.delete(key);
    await done(tx);
  };
  const getAll = <T>(name: string) => req(store(name).s.getAll() as IDBRequest<T[]>);
  const get = <T>(name: string, key: string) => req(store(name).s.get(key) as IDBRequest<T | undefined>);

  return {
    version: db.version,
    close: () => db.close(),
    saveImport: async (rec) => put('imports', ImportShape.parse(rec)),
    async listImports() {
      const all = (await getAll<unknown>('imports')).map((r) => ImportShape.parse(r) as unknown as ImportRecord);
      return all.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    },
    deleteImport: (id) => del('imports', id),
    async getRules() {
      const row = await get<Record<string, unknown>>('rules', 'rules');
      if (!row) return null;
      const { id: _id, ...rules } = row;
      return parseRules(rules);
    },
    saveRules: (rules) => put('rules', { id: 'rules', ...parseRules(rules) }),
    async listNotes() {
      return (await getAll<unknown>('notes')).map(parseNote);
    },
    saveNote: (note) => put('notes', parseNote(note)),
    deleteNote: (id) => del('notes', id),
    async getMeta<T>(key: string) {
      const row = await get<{ value: T }>('meta', key);
      return row ? row.value : null;
    },
    setMeta: (key, value) => put('meta', { key, value }),
    deleteMeta: (key) => del('meta', key),
    async getSession<T>(key: string) {
      const row = await get<{ value: T }>('session', key);
      return row ? row.value : null;
    },
    setSession: (key, value) => put('session', { key, value }),
    async clearSession() {
      const { s, tx } = store('session', 'readwrite');
      s.clear();
      await done(tx);
    },
    listSync: () => getAll<SyncState>('sync'),
    putSync: (state) => put('sync', state),
  };
}

/** Deletes the whole database, then reads back to confirm it is gone (AC-2.2.4). */
export async function deleteEverything(factory: IDBFactory): Promise<boolean> {
  await new Promise<void>((resolve, reject) => {
    const r = factory.deleteDatabase(JOURNAL_DB);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Close other tabs of the Journal, then try again.'));
  });
  const dbs = await factory.databases();
  return !dbs.some((d) => d.name === JOURNAL_DB);
}

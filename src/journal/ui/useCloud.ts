/**
 * Account, plan and sync for cloud builds (ADR-0001). Does nothing, and makes
 * no network calls, when the build has no Supabase settings.
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { fetchEntitlement, setWeeklyReminder, startSubscription, type Entitlement } from '../cloud/api';
import { completeSignIn, refreshSession, signInUrl, signOut, type Session } from '../cloud/auth';
import { cloudConfig } from '../cloud/config';
import { pull, push, unlock, type Collection, type LocalRecord } from '../cloud/sync';
import type { ImportRecord, JournalDb } from '../store/db';
import { parseNote } from '../../engine/journal/notes';
import { parseRules } from '../../engine/journal/rules';

/** How long a confirmed plan keeps the Journal open offline (ADR-0001). */
const OFFLINE_GRACE_MS = 7 * 86_400_000;
const VERIFIER_KEY = 'fo-journal-pkce';

interface CachedEntitlement {
  value: Entitlement;
  checkedAt: number;
}

export interface CloudState {
  enabled: boolean;
  session: Session | null;
  entitlement: Entitlement | null;
  /** In a cloud build, the Journal opens only with a plan (or a recent confirmation of one). */
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  synced: { up: number; down: number } | null;
}

const returnUrl = () => `${window.location.origin}${window.location.pathname}?journal=1`;

export function useCloud(db: RefObject<JournalDb | null>, dbReady: boolean, reload: () => Promise<void>) {
  const cfg = useMemo(cloudConfig, []);
  const [state, setState] = useState<CloudState>({ enabled: cfg !== null, session: null, entitlement: null, unlocked: cfg === null, busy: false, error: null, synced: null });
  const patch = (p: Partial<CloudState>) => setState((s) => ({ ...s, ...p }));

  const checkPlan = useCallback(
    async (session: Session) => {
      if (!cfg || !db.current) return;
      const cached = await db.current.getSession<CachedEntitlement>('entitlement');
      try {
        const live = session.expiresAt < Date.now() + 60_000 ? await refreshSession(cfg, session) : session;
        if (live !== session) await db.current.setSession('auth', live);
        const value = await fetchEntitlement(cfg, live);
        await db.current.setSession('entitlement', { value, checkedAt: Date.now() } satisfies CachedEntitlement);
        patch({ session: live, entitlement: value, unlocked: value.active });
      } catch {
        // Offline or the server is down: a recently confirmed plan still counts.
        const fresh = cached && cached.value.active && Date.now() - cached.checkedAt < OFFLINE_GRACE_MS;
        patch({ entitlement: cached?.value ?? null, unlocked: Boolean(fresh) });
      }
    },
    [cfg, db],
  );

  // Finish a sign-in redirect, or restore the saved session.
  useEffect(() => {
    if (!cfg || !dbReady || !db.current) return;
    const store = db.current;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const verifier = sessionStorage.getItem(VERIFIER_KEY);
      let session = await store.getSession<Session>('auth');
      if (code && verifier) {
        sessionStorage.removeItem(VERIFIER_KEY);
        session = await completeSignIn(cfg, code, verifier);
        await store.setSession('auth', session);
        window.history.replaceState(null, '', `${window.location.pathname}#journal`);
      }
      if (session) {
        patch({ session });
        await checkPlan(session);
      }
    })().catch(() => patch({ error: 'signin' }));
  }, [cfg, db, dbReady, checkPlan]);

  const signIn = useCallback(async () => {
    if (!cfg) return;
    const { url, verifier } = await signInUrl(cfg, returnUrl());
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    window.location.assign(url);
  }, [cfg]);

  const doSignOut = useCallback(async () => {
    if (!cfg || !state.session) return;
    await signOut(cfg, state.session);
    await db.current?.clearSession();
    patch({ session: null, entitlement: null, unlocked: false, synced: null });
  }, [cfg, db, state.session]);

  const subscribe = useCallback(
    async (plan: 'monthly' | 'annual') => {
      if (!cfg || !state.session) return;
      patch({ busy: true, error: null });
      try {
        window.location.assign(await startSubscription(cfg, state.session, plan));
      } catch {
        patch({ error: 'subscribe' });
      } finally {
        patch({ busy: false });
      }
    },
    [cfg, state.session],
  );

  const sync = useCallback(
    async (passphrase: string) => {
      const store = db.current;
      if (!cfg || !state.session || !store) return;
      patch({ busy: true, error: null });
      try {
        const keys = await unlock(cfg, state.session, passphrase);
        const imports = await store.listImports();
        const notes = await store.listNotes();
        const rules = await store.getRules();
        const tombstones = (await store.listSync()).filter((x) => x.dirty && x.deleted);
        const outgoing: LocalRecord[] = [
          ...imports.map((i) => ({ collection: 'imports' as const, localId: i.id, value: i })),
          ...notes.map((n) => ({ collection: 'notes' as const, localId: n.id, value: n })),
          ...(rules ? [{ collection: 'rules' as const, localId: 'rules', value: rules }] : []),
          ...tombstones.map((t) => {
            const [collection, ...rest] = t.localId.split(':');
            return { collection: collection as Collection, localId: rest.join(':'), value: null };
          }),
        ];
        const up = await push(cfg, state.session, keys, outgoing);
        for (const t of tombstones) await store.putSync({ ...t, dirty: false });
        const since = await store.getMeta<string>('syncCursor');
        const { records, cursor } = await pull(cfg, state.session, keys, since);
        for (const r of records) await applyRemote(store, r);
        if (cursor) await store.setMeta('syncCursor', cursor);
        patch({ synced: { up, down: records.length } });
        await reload();
      } catch (e) {
        patch({ error: e instanceof Error && e.name === 'WrongPassphraseError' ? 'passphrase' : 'sync' });
      } finally {
        patch({ busy: false });
      }
    },
    [cfg, db, reload, state.session],
  );

  const setReminders = useCallback(
    async (weekly: boolean) => {
      if (!cfg || !state.session) return;
      try {
        await setWeeklyReminder(cfg, state.session, weekly);
      } catch {
        patch({ error: 'reminders' });
      }
    },
    [cfg, state.session],
  );

  return { cloud: state, signIn, signOut: doSignOut, subscribe, sync, setReminders };
}

/** Writes one decrypted record into the local store; remote data is validated like local data. */
async function applyRemote(store: JournalDb, r: LocalRecord): Promise<void> {
  if (r.collection === 'imports') {
    if (r.value === null) await store.deleteImport(r.localId);
    else await store.saveImport(r.value as ImportRecord);
  } else if (r.collection === 'notes') {
    if (r.value === null) await store.deleteNote(r.localId);
    else await store.saveNote(parseNote(r.value));
  } else if (r.collection === 'rules' && r.value !== null) {
    await store.saveRules(parseRules(r.value));
  }
}

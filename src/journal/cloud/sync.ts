/**
 * End-to-end encrypted sync (ADR-0002, docs/SPEC.md US-2.3). Everything is
 * encrypted before it leaves the device; the server sees opaque IDs and
 * ciphertext. Conflicts resolve last-write-wins per record.
 */
import { decryptRecord, deriveKeys, encryptRecord, fromBase64, KDF_ITERATIONS, makeKeyCheck, randomSalt, recordId, toBase64, verifyKeyCheck, type JournalKeys } from '../crypto';
import { rest } from './api';
import type { Session } from './auth';
import type { CloudConfig } from './config';

export type Collection = 'imports' | 'notes' | 'rules';

export interface LocalRecord {
  collection: Collection;
  localId: string;
  /** null for a deletion. */
  value: unknown;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase doesn’t open your synced Journal.');
    this.name = 'WrongPassphraseError';
  }
}

interface Profile {
  kdf_salt: string;
  kdf_iterations: number;
  key_check_iv: string;
  key_check: string;
}

/**
 * Derives this user's keys. The first device creates the profile (salt and
 * check value); later devices must give the same passphrase.
 */
export async function unlock(cfg: CloudConfig, s: Session, passphrase: string, iterations = KDF_ITERATIONS): Promise<JournalKeys> {
  const rows = (await (await rest(cfg, s, 'journal_profiles?select=kdf_salt,kdf_iterations,key_check_iv,key_check')).json()) as Profile[];
  const existing = rows[0];
  if (existing) {
    const keys = await deriveKeys(passphrase, fromBase64(existing.kdf_salt), existing.kdf_iterations);
    if (!(await verifyKeyCheck(keys, s.userId, { iv: existing.key_check_iv, ciphertext: existing.key_check }))) throw new WrongPassphraseError();
    return keys;
  }
  const salt = randomSalt();
  const keys = await deriveKeys(passphrase, salt, iterations);
  const check = await makeKeyCheck(keys, s.userId);
  await rest(cfg, s, 'journal_profiles', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: s.userId, kdf_salt: toBase64(salt), kdf_iterations: iterations, key_check_iv: check.iv, key_check: check.ciphertext }),
  });
  return keys;
}

export async function push(cfg: CloudConfig, s: Session, keys: JournalKeys, records: readonly LocalRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const rows = await Promise.all(
    records.map(async (r) => {
      const id = await recordId(keys, `${r.collection}:${r.localId}`);
      const sealed = await encryptRecord(keys, { userId: s.userId, collection: r.collection, recordId: id }, { localId: r.localId, value: r.value });
      return { user_id: s.userId, collection: r.collection, record_id: id, iv: sealed.iv, ciphertext: sealed.ciphertext, deleted: r.value === null, updated_at: new Date().toISOString() };
    }),
  );
  await rest(cfg, s, 'journal_records?on_conflict=user_id,collection,record_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

/** Records changed on the server since `since` (ISO time), decrypted. */
export async function pull(cfg: CloudConfig, s: Session, keys: JournalKeys, since: string | null): Promise<{ records: LocalRecord[]; cursor: string | null }> {
  const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : '';
  const rows = (await (await rest(cfg, s, `journal_records?select=collection,record_id,iv,ciphertext,updated_at${filter}&order=updated_at.asc`)).json()) as {
    collection: Collection;
    record_id: string;
    iv: string;
    ciphertext: string;
    updated_at: string;
  }[];
  const records: LocalRecord[] = [];
  for (const row of rows) {
    const plain = await decryptRecord<{ localId: string; value: unknown }>(keys, { userId: s.userId, collection: row.collection, recordId: row.record_id }, { iv: row.iv, ciphertext: row.ciphertext });
    records.push({ collection: row.collection, localId: plain.localId, value: plain.value });
  }
  return { records, cursor: rows.at(-1)?.updated_at ?? since };
}

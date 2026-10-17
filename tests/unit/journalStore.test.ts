/** Local-first storage and encryption (docs/SPEC.md US-2.2, US-2.3; ADR-0002, ADR-0003). */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  JOURNAL_DB,
  MIGRATIONS,
  deleteEverything,
  openJournal,
  type ImportRecord,
} from '../../src/journal/store/db';
import { decryptRecord, deriveKeys, encryptRecord, makeKeyCheck, recordId, verifyKeyCheck, MIN_PASSPHRASE } from '../../src/journal/crypto';
import { fill } from './helpers';

const imp = (id: string, tradeIds: string[]): ImportRecord => ({
  id,
  at: 1_790_000_000_000,
  label: 'tradebook-•••-FO.csv',
  broker: 'zerodha',
  counts: { added: tradeIds.length, duplicates: 0, rejected: 0 },
  fills: tradeIds.map((t) => fill({ side: 'BUY', qty: 75, price: '100.00', at: '2026-05-04T10:00:00', tradeId: t })),
  charges: [],
  statements: [],
});

describe('local store (SPEC US-2.2)', () => {
  it('history_saved_after_opt_in', async () => {
    const factory = new IDBFactory();
    const db = await openJournal(factory);
    await db.saveImport(imp('i1', ['T1', 'T2']));
    await db.saveRules({ maxLossPerDayRupees: 2000, maxTradesPerDay: null, stopAfterLosses: 2, noTradesFirstMinutes: null });
    await db.saveNote({ id: 'n1', target: { kind: 'day', date: '2026-05-04' as never }, text: 'Calm day', tags: ['plan'], updatedAt: 5 });
    db.close();
    const again = await openJournal(factory);
    expect((await again.listImports()).map((i) => [i.id, i.fills.length])).toEqual([['i1', 2]]);
    expect((await again.getRules())?.stopAfterLosses).toBe(2);
    expect((await again.listNotes()).map((n) => n.text)).toEqual(['Calm day']);
    again.close();
  });

  it('undo_import_removes_only_its_fills', async () => {
    const db = await openJournal(new IDBFactory());
    await db.saveImport(imp('i1', ['T1', 'T2']));
    await db.saveImport(imp('i2', ['T3']));
    await db.deleteImport('i1');
    const left = await db.listImports();
    expect(left.map((i) => i.id)).toEqual(['i2']);
    expect(left.flatMap((i) => i.fills.map((f) => f.tradeId))).toEqual(['T3']);
    db.close();
  });

  it('migrations_upgrade_every_old_version', async () => {
    const factory = new IDBFactory();
    // A version-1 database with data, as an older app left it.
    const v1 = await openJournal(factory, MIGRATIONS.slice(0, 1));
    await v1.saveImport(imp('i1', ['T1']));
    v1.close();
    const latest = await openJournal(factory);
    expect(latest.version).toBe(MIGRATIONS.length);
    expect((await latest.listImports()).map((i) => i.id)).toEqual(['i1']);
    latest.close();
  });

  it('failed_migration_keeps_old_data', async () => {
    const factory = new IDBFactory();
    const v1 = await openJournal(factory, MIGRATIONS.slice(0, 1));
    await v1.saveImport(imp('i1', ['T1']));
    v1.close();
    const broken = [...MIGRATIONS.slice(0, 1), () => { throw new Error('boom'); }];
    await expect(openJournal(factory, broken)).rejects.toThrow();
    const back = await openJournal(factory, MIGRATIONS.slice(0, 1));
    expect(back.version).toBe(1);
    expect((await back.listImports()).map((i) => i.id)).toEqual(['i1']);
    back.close();
  });

  it('delete_everything_empties_database', async () => {
    const factory = new IDBFactory();
    const db = await openJournal(factory);
    await db.saveImport(imp('i1', ['T1']));
    db.close();
    expect(await deleteEverything(factory)).toBe(true);
    const dbs = await factory.databases();
    expect(dbs.map((d) => d.name)).not.toContain(JOURNAL_DB);
  });

  it('notes_saved_locally', async () => {
    const db = await openJournal(new IDBFactory());
    await db.saveNote({ id: 'n1', target: { kind: 'trade', key: 'zerodha|X|1|2|f' }, text: 'Entered late', tags: ['fomo'], updatedAt: 1 });
    await db.saveNote({ id: 'n1', target: { kind: 'trade', key: 'zerodha|X|1|2|f' }, text: 'Entered late, sized up', tags: ['fomo', 'size'], updatedAt: 2 });
    expect(await db.listNotes()).toHaveLength(1);
    expect((await db.listNotes())[0]!.tags).toEqual(['fomo', 'size']);
    await db.deleteNote('n1');
    expect(await db.listNotes()).toEqual([]);
    db.close();
  });
});

describe('encryption (SPEC US-2.3, ADR-0002)', () => {
  const salt = new Uint8Array(16).fill(7);
  const slot = { userId: 'u1', collection: 'imports', recordId: 'abc' };

  it('sync_round_trip_matches', async () => {
    const keys = await deriveKeys('correct horse battery', salt, 1000);
    const data = { hello: 'world', n: 42 };
    const sealed = await encryptRecord(keys, slot, data);
    const otherDevice = await deriveKeys('correct horse battery', salt, 1000);
    expect(await decryptRecord(otherDevice, slot, sealed)).toEqual(data);
  });

  it('wrong_passphrase_is_refused', async () => {
    const keys = await deriveKeys('correct horse battery', salt, 1000);
    const check = await makeKeyCheck(keys, 'u1');
    expect(await verifyKeyCheck(keys, 'u1', check)).toBe(true);
    expect(await verifyKeyCheck(await deriveKeys('wrong horse battery', salt, 1000), 'u1', check)).toBe(false);
    await expect(deriveKeys('short', salt, 1000)).rejects.toThrow(`at least ${MIN_PASSPHRASE}`);
  });

  it('ciphertext_is_bound_to_its_slot', async () => {
    const keys = await deriveKeys('correct horse battery', salt, 1000);
    const sealed = await encryptRecord(keys, slot, { a: 1 });
    await expect(decryptRecord(keys, { ...slot, userId: 'u2' }, sealed)).rejects.toThrow();
    await expect(decryptRecord(keys, { ...slot, recordId: 'xyz' }, sealed)).rejects.toThrow();
  });

  it('record_ids_are_opaque_and_stable', async () => {
    const keys = await deriveKeys('correct horse battery', salt, 1000);
    const id = await recordId(keys, 'import:NIFTY26MAY24000CE');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('NIFTY');
    expect(await recordId(keys, 'import:NIFTY26MAY24000CE')).toBe(id);
  });
});

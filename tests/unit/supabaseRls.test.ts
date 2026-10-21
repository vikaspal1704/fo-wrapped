/**
 * Row-level security on a real Postgres (PGlite, WASM) with the migration as
 * shipped (docs/SPEC.md AC-2.1.7). Supabase's auth schema is stubbed:
 * auth.uid() reads the JWT subject the way Supabase's does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const HEX = 'a'.repeat(64);

async function setup(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    -- As Supabase defines it: the JWT subject from PostgREST's request settings.
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
    $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon;
    -- Supabase's default privileges: every new table and function in public goes to all three roles.
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    insert into auth.users values ('${A}', 'a@example.invalid'), ('${B}', 'b@example.invalid');
  `);
  for (const f of readdirSync(MIGRATIONS).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  return db;
}

/** Runs `sql` as a signed-in user, then returns to the superuser. */
async function as(db: PGlite, user: string, sql: string, params: unknown[] = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const insertRecord = (db: PGlite, owner: string, actingAs = owner) =>
  as(db, actingAs, `insert into journal_records (user_id, collection, record_id, iv, ciphertext) values ($1, 'imports', $2, 'aXY=', 'Y3Q=')`, [owner, HEX]);

describe('row-level security (SPEC AC-2.1.7)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it('rls_blocks_unentitled_user', async () => {
    await expect(insertRecord(db, A)).rejects.toThrow(/row-level security/);
    await expect(as(db, A, `insert into reminder_prefs (user_id, weekly) values ($1, true)`, [A])).rejects.toThrow(/row-level security/);
    // Turning reminders off is always allowed.
    await as(db, A, `insert into reminder_prefs (user_id, weekly) values ($1, false)`, [A]);
    // An expired plan is not active.
    await db.query(`insert into entitlements (user_id, status, plan, current_period_end) values ($1, 'active', 'monthly', now() - interval '1 day')`, [A]);
    await expect(insertRecord(db, A)).rejects.toThrow(/row-level security/);
    // Users can't grant themselves a plan.
    await expect(as(db, A, `update entitlements set current_period_end = now() + interval '1 year' where user_id = $1`, [A])).rejects.toThrow(/permission denied/);
  });

  it('rls_isolates_users', async () => {
    for (const u of [A, B]) await db.query(`insert into entitlements (user_id, status, plan, current_period_end) values ($1, 'active', 'annual', now() + interval '30 days')`, [u]);
    await insertRecord(db, A);
    expect((await as(db, A, 'select count(*)::int as n from journal_records')).rows).toEqual([{ n: 1 }]);
    expect((await as(db, B, 'select count(*)::int as n from journal_records')).rows).toEqual([{ n: 0 }]);
    await expect(insertRecord(db, A, B)).rejects.toThrow(/row-level security/);
    expect((await as(db, B, 'select user_id from entitlements')).rows).toEqual([{ user_id: B }]);
    await expect(as(db, A, 'select * from webhook_events')).rejects.toThrow(/permission denied/);
  });

  it('rls_lets_owner_delete_without_plan', async () => {
    // AC-2.10.2: a lapsed user can still erase their synced data; nobody else can.
    await db.query(`insert into entitlements (user_id, status, plan, current_period_end) values ($1, 'active', 'annual', now() + interval '30 days')`, [A]);
    await insertRecord(db, A);
    await as(db, A, `insert into journal_profiles (user_id, kdf_salt, kdf_iterations, key_check_iv, key_check) values ($1, 's', 600000, 'i', 'c')`, [A]);
    await db.query(`update entitlements set status = 'cancelled' where user_id = $1`, [A]);
    expect((await as(db, A, 'select count(*)::int as n from journal_records')).rows).toEqual([{ n: 1 }]); // still theirs to read
    await expect(insertRecord(db, A)).rejects.toThrow(/row-level security/); // but no new writes
    expect((await as(db, B, 'delete from journal_records returning record_id')).rows).toEqual([]); // others can't delete
    expect((await as(db, A, 'delete from journal_records returning record_id')).rows).toHaveLength(1);
    expect((await as(db, A, 'delete from journal_profiles returning user_id')).rows).toHaveLength(1);
    expect((await db.query('select count(*)::int as n from journal_records')).rows).toEqual([{ n: 0 }]);
  });

  it('server_stamps_sync_times', async () => {
    // A device with a clock in the past can't hide its change from other devices' pull cursors.
    await db.query(`insert into entitlements (user_id, status, plan, current_period_end) values ($1, 'active', 'annual', now() + interval '30 days')`, [A]);
    await as(db, A, `insert into journal_records (user_id, collection, record_id, iv, ciphertext, updated_at) values ($1, 'imports', $2, 'aXY=', 'Y3Q=', '2001-01-01')`, [A, HEX]);
    const [row] = (await db.query<{ age: number }>('select extract(epoch from now() - updated_at)::int as age from journal_records')).rows;
    expect(Math.abs(row!.age)).toBeLessThan(60);
  });

  it('rls_rejects_readable_record_ids', async () => {
    await db.query(`insert into entitlements (user_id, status, plan, current_period_end) values ($1, 'active', 'annual', now() + interval '30 days')`, [A]);
    await expect(as(db, A, `insert into journal_records (user_id, collection, record_id, iv, ciphertext) values ($1, 'imports', 'NIFTY26MAY24000CE', 'aXY=', 'Y3Q=')`, [A])).rejects.toThrow(/check constraint/);
  });
});

/** The Journal's cloud clients against an in-memory Supabase (docs/SPEC.md US-2.1, US-2.3). */
import { describe, expect, it } from 'vitest';
import { fetchEntitlement, startSubscription } from '../../src/journal/cloud/api';
import { completeSignIn, signInUrl } from '../../src/journal/cloud/auth';
import type { CloudConfig } from '../../src/journal/cloud/config';
import { pull, push, unlock, WrongPassphraseError } from '../../src/journal/cloud/sync';
import { fill } from './helpers';

const USER = '00000000-0000-0000-0000-00000000000a';
const session = { accessToken: 'at', refreshToken: 'rt', expiresAt: 0, userId: USER, email: 'a@example.invalid' };

/** Just enough of PostgREST and GoTrue for these clients; records every request. */
function fakeSupabase() {
  const sent: { url: string; method: string; body: string }[] = [];
  const profiles: Record<string, unknown>[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let clock = 0;
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const body = typeof init.body === 'string' ? init.body : '';
    sent.push({ url: input, method: init.method ?? 'GET', body });
    const path = url.pathname;
    if (path === '/auth/v1/token') {
      return json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: USER, email: 'a@example.invalid', app_metadata: { provider: 'google' }, identities: [{ x: 1 }] } });
    }
    if (path === '/rest/v1/journal_profiles') {
      if (init.method === 'POST') profiles.push(JSON.parse(body));
      return json(init.method === 'POST' ? null : profiles, init.method === 'POST' ? 201 : 200);
    }
    if (path === '/rest/v1/journal_records') {
      if (init.method === 'POST') {
        // Like the server's trigger: the server stamps updated_at, whatever the client sends.
        for (const r of JSON.parse(body) as Record<string, unknown>[]) records.set(`${r.collection}|${r.record_id}`, { ...r, updated_at: new Date(1_790_000_000_000 + ++clock * 1000).toISOString() });
        return json(null, 201);
      }
      const since = url.searchParams.get('updated_at')?.replace('gt.', '') ?? '';
      return json([...records.values()].filter((r) => String(r.updated_at) > since).sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? -1 : 1)));
    }
    if (path === '/rest/v1/entitlements') return json([{ status: 'active', plan: 'annual', current_period_end: '2027-01-01T00:00:00Z' }]);
    if (path === '/functions/v1/create-subscription') return json({ id: 'sub_1', url: 'https://rzp.io/i/abc' });
    return json({ error: 'not found' }, 404);
  }) as unknown as typeof fetch;
  const cfg: CloudConfig = { url: 'https://proj.supabase.co', anonKey: 'anon', fetch: fetchImpl };
  return { cfg, sent, records };
}

describe('sign-in (SPEC AC-2.1.2)', () => {
  it('auth_uses_pkce_and_keeps_only_tokens', async () => {
    const { cfg, sent } = fakeSupabase();
    const { url, verifier } = await signInUrl(cfg, 'https://journal.example.invalid/?journal=1');
    const u = new URL(url);
    expect(u.pathname).toBe('/auth/v1/authorize');
    expect(u.searchParams.get('provider')).toBe('google');
    expect(u.searchParams.get('code_challenge_method')).toBe('s256');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(u.searchParams.get('code_challenge')).toBe(Buffer.from(digest).toString('base64url'));
    const s = await completeSignIn(cfg, 'CODE', verifier, 1000);
    expect(s).toEqual({ accessToken: 'AT', refreshToken: 'RT', expiresAt: 1000 + 3_600_000, userId: USER, email: 'a@example.invalid' });
    expect(JSON.parse(sent[0]!.body)).toEqual({ auth_code: 'CODE', code_verifier: verifier });
  });
});

describe('plan (SPEC AC-2.1.3)', () => {
  it('entitlement_and_subscription_client', async () => {
    const { cfg } = fakeSupabase();
    expect(await fetchEntitlement(cfg, session, Date.parse('2026-10-17'))).toEqual({ active: true, plan: 'annual', periodEnd: '2027-01-01T00:00:00Z', status: 'active', cancelAtPeriodEnd: false });
    expect((await fetchEntitlement(cfg, session, Date.parse('2027-02-01'))).active).toBe(false);
    expect(await startSubscription(cfg, session, 'monthly')).toBe('https://rzp.io/i/abc');
  });
});

describe('encrypted sync (SPEC US-2.3)', () => {
  const imp = {
    id: 'imp-1',
    label: 'tradebook-•••-FO.csv',
    fills: [fill({ side: 'BUY', qty: 75, price: '123.45', at: '2026-05-04T10:00:00', symbol: 'NIFTY26MAY24000CE', expiry: '2026-05-26', tradeId: '987654321' })],
  };

  it('sync_uploads_only_ciphertext', async () => {
    const { cfg, sent } = fakeSupabase();
    const keys = await unlock(cfg, session, 'correct horse battery', 1000);
    await push(cfg, session, keys, [
      { collection: 'imports', localId: 'imp-1', value: imp },
      { collection: 'notes', localId: 'n1', value: { text: 'Revenge after the NIFTY gap', tags: ['revenge'] } },
    ]);
    const uploads = sent.filter((r) => r.method === 'POST').map((r) => r.body).join('\n');
    for (const secret of ['NIFTY', '987654321', '123.45', '12345', 'Revenge', 'revenge', 'imp-1', 'tradebook', 'correct horse']) expect(uploads).not.toContain(secret);
    const recordsBody = JSON.parse(sent.find((r) => r.url.includes('journal_records'))!.body) as { record_id: string; updated_at?: string }[];
    expect(recordsBody.every((r) => /^[0-9a-f]{64}$/.test(r.record_id))).toBe(true);
    // Clients never set the change timestamp; the server's clock does (no skew between devices).
    expect(recordsBody.every((r) => r.updated_at === undefined)).toBe(true);
  });

  it('sync_pulls_and_decrypts_on_another_device', async () => {
    const server = fakeSupabase();
    const keys = await unlock(server.cfg, session, 'correct horse battery', 1000);
    await push(server.cfg, session, keys, [{ collection: 'imports', localId: 'imp-1', value: imp }]);
    const other = await unlock(server.cfg, session, 'correct horse battery');
    const first = await pull(server.cfg, session, other, null);
    expect(first.records).toEqual([{ collection: 'imports', localId: 'imp-1', value: JSON.parse(JSON.stringify(imp)) }]);
    await push(server.cfg, session, keys, [{ collection: 'imports', localId: 'imp-1', value: null }]);
    const next = await pull(server.cfg, session, other, first.cursor);
    expect(next.records).toEqual([{ collection: 'imports', localId: 'imp-1', value: null }]);
    await expect(unlock(server.cfg, session, 'not the passphrase')).rejects.toThrow(WrongPassphraseError);
  });
});

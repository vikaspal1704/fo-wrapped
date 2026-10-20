/** Billing and reminders on the server (docs/SPEC.md US-2.1, US-2.7; ADR-0004). */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SafeLogFields } from '../../supabase/functions/_shared/log.ts';
import { handleCancelSubscription, handleDeleteAccount } from '../../supabase/functions/_shared/account.ts';
import { billingStore } from '../../supabase/functions/_shared/postgrest.ts';
import { handleWebhook, type BillingStore, type EntitlementRow } from '../../supabase/functions/_shared/razorpay.ts';
import { handleUnsubscribe, reminderEmail, runWeeklyReminders } from '../../supabase/functions/_shared/reminders.ts';
import { handleCreateSubscription } from '../../supabase/functions/_shared/subscription.ts';

const SECRET = 'whsec_test_only';
const USER = '00000000-0000-0000-0000-00000000000a';

function memoryStore() {
  const events = new Set<string>();
  const rows = new Map<string, EntitlementRow>();
  const store: BillingStore = {
    async recordEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async forgetEvent(id) {
      events.delete(id);
    },
    async getEntitlement(u) {
      return rows.get(u) ?? null;
    },
    async upsertEntitlement(row) {
      rows.set(row.user_id, row);
    },
  };
  return { store, rows, events };
}

/** A Razorpay subscription event, as JSON text, with sensitive-looking extras that must never be logged. */
function event(type: string, createdAt: number, currentEnd: number | null = 1_800_000_000) {
  return JSON.stringify({
    entity: 'event',
    event: type,
    created_at: createdAt,
    payload: {
      subscription: { entity: { id: 'sub_TEST1', plan_id: 'plan_M', current_end: currentEnd, notes: { user_id: USER } } },
      payment: { entity: { card: { last4: '4242', network: 'Visa' }, vpa: 'someone@okbank', bank: 'HDFC', email: 'payer@example.invalid' } },
    },
  });
}
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

function run(body: string, opts: { id?: string; sig?: string; store?: ReturnType<typeof memoryStore>; logs?: SafeLogFields[] } = {}) {
  const mem = opts.store ?? memoryStore();
  const logs = opts.logs ?? [];
  return {
    mem,
    logs,
    out: handleWebhook(
      { rawBody: body, signature: opts.sig ?? sign(body), eventId: opts.id ?? `evt_${Math.random()}` },
      { secret: SECRET, store: mem.store, log: (f) => logs.push(f), planOf: (id) => (id === 'plan_M' ? 'monthly' : null) },
    ),
  };
}

describe('Razorpay webhook (SPEC AC-2.1.4 to AC-2.1.6, AC-2.1.8)', () => {
  it('webhook_rejects_bad_signature', async () => {
    const body = event('subscription.activated', 1_790_000_000);
    for (const sig of [sign(body, 'wrong'), '', sign(body).slice(0, -1) + '0', sign(`${body} `)]) {
      const { out, mem } = run(body, { sig });
      expect((await out).status).toBe(401);
      expect(mem.rows.size).toBe(0);
      expect(mem.events.size).toBe(0);
    }
  });

  it('webhook_is_idempotent', async () => {
    const mem = memoryStore();
    const body = event('subscription.activated', 1_790_000_000);
    expect((await run(body, { id: 'evt_1', store: mem }).out).body).toBe('ok');
    const before = structuredClone(mem.rows.get(USER));
    mem.rows.get(USER)!.status = 'paused'; // anything a replay could overwrite
    const second = await run(body, { id: 'evt_1', store: mem }).out;
    expect(second).toEqual({ status: 200, body: 'duplicate' });
    expect(mem.rows.get(USER)!.status).toBe('paused');
    expect(before!.status).toBe('active');
  });

  it('webhook_ignores_out_of_order_events', async () => {
    const mem = memoryStore();
    await run(event('subscription.cancelled', 1_790_000_500), { store: mem }).out;
    const late = await run(event('subscription.charged', 1_790_000_100), { store: mem }).out;
    expect(late.body).toBe('stale');
    expect(mem.rows.get(USER)!.status).toBe('cancelled');
  });

  it('entitlement_follows_subscription_events', async () => {
    const mem = memoryStore();
    await run(event('subscription.activated', 1_790_000_000, 1_792_000_000), { store: mem }).out;
    expect(mem.rows.get(USER)).toMatchObject({ status: 'active', plan: 'monthly', current_period_end: new Date(1_792_000_000_000).toISOString(), razorpay_subscription_id: 'sub_TEST1' });
    await run(event('subscription.charged', 1_790_100_000, 1_794_600_000), { store: mem }).out;
    expect(mem.rows.get(USER)!.current_period_end).toBe(new Date(1_794_600_000_000).toISOString());
    await run(event('subscription.halted', 1_790_200_000, null), { store: mem }).out;
    expect(mem.rows.get(USER)).toMatchObject({ status: 'halted', current_period_end: new Date(1_794_600_000_000).toISOString() });
    await run(event('subscription.cancelled', 1_790_300_000, null), { store: mem }).out;
    expect(mem.rows.get(USER)!.status).toBe('cancelled');
    expect((await run(event('payment.captured', 1_790_400_000), { store: mem }).out).body).toBe('ignored');
  });

  it('webhook_failure_lets_razorpay_retry', async () => {
    const mem = memoryStore();
    mem.store.upsertEntitlement = async () => {
      throw new Error('db down');
    };
    await expect(run(event('subscription.activated', 1), { id: 'evt_9', store: mem }).out).rejects.toThrow('db down');
    expect(mem.events.has('evt_9')).toBe(false);
  });

  it('billing_logs_have_no_payment_data', async () => {
    const logs: SafeLogFields[] = [];
    const mem = memoryStore();
    for (const t of ['subscription.activated', 'subscription.charged', 'payment.captured']) await run(event(t, 1_790_000_000), { store: mem, logs }).out;
    await run(event('subscription.activated', 1), { sig: 'bad', logs }).out;
    const text = JSON.stringify(logs);
    for (const secret of ['4242', 'Visa', 'okbank', 'HDFC', 'payer@', USER, 'sub_TEST1', 'plan_M']) expect(text).not.toContain(secret);
    expect(logs.every((l) => Object.keys(l).every((k) => ['fn', 'outcome', 'eventId', 'eventType', 'count'].includes(k)))).toBe(true);
  });
});

describe('create subscription (SPEC AC-2.1.3)', () => {
  const deps = (calls: { url: string; init: RequestInit }[]) => ({
    keyId: 'rzp_test_key',
    keySecret: 'rzp_test_secret',
    planIds: { monthly: 'plan_M', annual: 'plan_A' },
    userFromToken: async (t: string) => (t === 'good-token' ? USER : null),
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'sub_1', short_url: 'https://rzp.io/i/abc' }), { status: 200 });
    }) as unknown as typeof fetch,
    log: () => {},
  });

  it('create_subscription_uses_configured_plan', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const out = await handleCreateSubscription({ authorization: 'Bearer good-token', body: '{"plan":"annual"}' }, deps(calls));
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ id: 'sub_1', url: 'https://rzp.io/i/abc' });
    expect(calls[0]!.url).toBe('https://api.razorpay.com/v1/subscriptions');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ plan_id: 'plan_A', total_count: 10, customer_notify: 1, notes: { user_id: USER } });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('rzp_test_key:rzp_test_secret')}`);
  });

  it('create_subscription_needs_a_signed_in_user_and_a_plan', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    expect((await handleCreateSubscription({ authorization: null, body: '{"plan":"monthly"}' }, deps(calls))).status).toBe(401);
    expect((await handleCreateSubscription({ authorization: 'Bearer forged', body: '{"plan":"monthly"}' }, deps(calls))).status).toBe(401);
    expect((await handleCreateSubscription({ authorization: 'Bearer good-token', body: '{"plan":"weekly"}' }, deps(calls))).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('weekly reminder (SPEC AC-2.7.2, AC-2.7.3)', () => {
  it('weekly_email_has_no_numbers', async () => {
    const sent: { to: string; text: string; subject: string }[] = [];
    const token = 'f'.repeat(64);
    const n = await runWeeklyReminders({
      siteUrl: 'https://journal.example.invalid/',
      functionsUrl: 'https://proj.supabase.co/functions/v1',
      listRecipients: async () => [{ email: 'a@example.invalid', token }],
      send: async (to, e) => void sent.push({ to, ...e }),
      log: () => {},
    });
    expect(n).toBe(1);
    const { text, subject } = sent[0]!;
    const withoutUrls = `${subject}\n${text}`.replace(/https?:\/\/\S+/g, '');
    expect(withoutUrls).not.toMatch(/\d/);
    expect(withoutUrls).not.toMatch(/₹|NIFTY|SENSEX|P&L/);
    expect(text).toContain(`unsubscribe?token=${token}`);
    expect(text).toContain('Not investment, trading or tax advice.');
    expect(reminderEmail('x', 'y').text).toBe(reminderEmail('x', 'y').text);
  });

  it('unsubscribe_stops_emails', async () => {
    const prefs = new Map([['a'.repeat(64), true]]);
    const turnOff = async (t: string) => {
      if (!prefs.has(t)) return false;
      prefs.set(t, false);
      return true;
    };
    expect((await handleUnsubscribe('a'.repeat(64), turnOff, () => {})).status).toBe(200);
    expect(prefs.get('a'.repeat(64))).toBe(false);
    expect((await handleUnsubscribe('b'.repeat(64), turnOff, () => {})).status).toBe(404);
    expect((await handleUnsubscribe("x' or 1=1", turnOff, () => {})).status).toBe(400);
    expect((await handleUnsubscribe(null, turnOff, () => {})).status).toBe(400);
  });
});

describe('database adapter', () => {
  it('postgrest_store_uses_ignore_duplicates_for_events', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const replies = [[{ event_id: 'e1' }], []];
    const store = billingStore({
      url: 'https://proj.supabase.co',
      serviceKey: 'service-key',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(replies.shift() ?? []), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await store.recordEvent('e1', 'subscription.charged')).toBe(true);
    expect(await store.recordEvent('e1', 'subscription.charged')).toBe(false);
    expect(calls[0]!.url).toBe('https://proj.supabase.co/rest/v1/webhook_events?on_conflict=event_id');
    expect((calls[0]!.init.headers as Record<string, string>).Prefer).toBe('resolution=ignore-duplicates,return=representation');
  });
});

describe('cancel and delete (SPEC US-2.10)', () => {
  const ent = (status: string): EntitlementRow => ({
    user_id: USER,
    status: status as EntitlementRow['status'],
    plan: 'monthly',
    current_period_end: '2026-11-20T00:00:00.000Z',
    razorpay_subscription_id: 'sub_TEST1',
    last_event_at: '2026-10-20T00:00:00.000Z',
  });
  function deps(row: EntitlementRow | null) {
    const calls: string[] = [];
    return {
      calls,
      d: {
        userFromToken: async (t: string) => (t === 'good' ? USER : null),
        getEntitlement: async () => row,
        cancelAtRazorpay: async (id: string, atEnd: boolean) => void calls.push(`cancel ${id} ${atEnd ? 'at-end' : 'now'}`),
        markCancelAtPeriodEnd: async () => void calls.push('mark'),
        deleteUser: async (u: string) => void calls.push(`delete ${u}`),
        log: () => {},
      },
    };
  }

  it('cancel_subscription_at_period_end', async () => {
    const { calls, d } = deps(ent('active'));
    const out = await handleCancelSubscription('Bearer good', d);
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ endsAt: '2026-11-20T00:00:00.000Z' });
    expect(calls).toEqual(['cancel sub_TEST1 at-end', 'mark']);
    expect((await handleCancelSubscription('Bearer forged', d)).status).toBe(401);
    expect((await handleCancelSubscription('Bearer good', deps(ent('cancelled')).d)).status).toBe(409);
    expect((await handleCancelSubscription('Bearer good', deps(null).d)).status).toBe(409);
  });

  it('delete_account_cancels_then_deletes', async () => {
    const live = deps(ent('active'));
    expect((await handleDeleteAccount('Bearer good', live.d)).status).toBe(200);
    expect(live.calls).toEqual(['cancel sub_TEST1 now', `delete ${USER}`]);
    const ended = deps(ent('cancelled'));
    await handleDeleteAccount('Bearer good', ended.d);
    expect(ended.calls).toEqual([`delete ${USER}`]);
    const none = deps(null);
    await handleDeleteAccount('Bearer good', none.d);
    expect(none.calls).toEqual([`delete ${USER}`]);
    expect((await handleDeleteAccount(null, none.d)).status).toBe(401);
  });
});

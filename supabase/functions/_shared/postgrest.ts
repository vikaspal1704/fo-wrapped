/**
 * Database access for the Edge Functions through Supabase's REST API with the
 * service-role key (server side only; never shipped to browsers).
 */
import type { BillingStore, EntitlementRow } from './razorpay.ts';

export interface Rest {
  url: string;
  serviceKey: string;
  fetch: typeof fetch;
}

const headers = (r: Rest, extra: Record<string, string> = {}) => ({
  apikey: r.serviceKey,
  Authorization: `Bearer ${r.serviceKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function call(r: Rest, path: string, init: RequestInit): Promise<Response> {
  const res = await r.fetch(`${r.url}/rest/v1/${path}`, init);
  if (!res.ok) throw new Error(`database ${res.status} on ${path.split('?')[0]}`);
  return res;
}

export function billingStore(r: Rest): BillingStore {
  return {
    async recordEvent(eventId, eventType) {
      const res = await call(r, 'webhook_events?on_conflict=event_id', {
        method: 'POST',
        headers: headers(r, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
        body: JSON.stringify({ event_id: eventId, event_type: eventType }),
      });
      return ((await res.json()) as unknown[]).length === 1;
    },
    async forgetEvent(eventId) {
      await call(r, `webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: headers(r) });
    },
    async getEntitlement(userId) {
      const res = await call(r, `entitlements?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET', headers: headers(r) });
      return (((await res.json()) as EntitlementRow[])[0] ?? null);
    },
    async upsertEntitlement(row) {
      await call(r, 'entitlements?on_conflict=user_id', {
        method: 'POST',
        headers: headers(r, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
      });
    },
  };
}

/** Resolves an access token to its user ID with Supabase Auth. */
export async function userFromToken(r: Rest & { anonKey: string }, token: string): Promise<string | null> {
  const res = await r.fetch(`${r.url}/auth/v1/user`, { headers: { apikey: r.anonKey, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { id?: string }).id ?? null;
}

/** Opted-in users with an active plan, with their unsubscribe tokens (SQL function weekly_recipients). */
export async function weeklyRecipients(r: Rest): Promise<{ email: string; token: string }[]> {
  const res = await call(r, 'rpc/weekly_recipients', { method: 'POST', headers: headers(r), body: '{}' });
  return (await res.json()) as { email: string; token: string }[];
}

export async function turnOffReminders(r: Rest, token: string): Promise<boolean> {
  const res = await call(r, `reminder_prefs?unsubscribe_token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: headers(r, { Prefer: 'return=representation' }),
    body: JSON.stringify({ weekly: false, updated_at: new Date().toISOString() }),
  });
  return ((await res.json()) as unknown[]).length === 1;
}

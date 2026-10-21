/** Signed-in calls to Supabase: plan status, subscribing, reminders (docs/SPEC.md US-2.1, US-2.7). */
import type { Session } from './auth';
import type { CloudConfig } from './config';

export interface Entitlement {
  active: boolean;
  plan: 'monthly' | 'annual' | null;
  /** ISO date-time the paid period ends, if any. */
  periodEnd: string | null;
  status: string;
  /** Cancelled by the user; ends at periodEnd and doesn't renew. */
  cancelAtPeriodEnd: boolean;
}

export const authHeaders = (cfg: CloudConfig, s: Session, extra: Record<string, string> = {}) => ({
  apikey: cfg.anonKey,
  Authorization: `Bearer ${s.accessToken}`,
  'Content-Type': 'application/json',
  ...extra,
});

export async function rest(cfg: CloudConfig, s: Session, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await cfg.fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { ...authHeaders(cfg, s), ...(init.headers as Record<string, string> | undefined) } });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Your plan or sign-in has expired.' : `The server answered ${res.status}.`);
  return res;
}

export async function fetchEntitlement(cfg: CloudConfig, s: Session, now = Date.now()): Promise<Entitlement> {
  const rows = (await (await rest(cfg, s, 'entitlements?select=status,plan,current_period_end,cancel_at_period_end')).json()) as {
    status: string;
    plan: 'monthly' | 'annual' | null;
    current_period_end: string | null;
    cancel_at_period_end?: boolean;
  }[];
  const row = rows[0];
  if (!row) return { active: false, plan: null, periodEnd: null, status: 'none', cancelAtPeriodEnd: false };
  const active = row.status === 'active' && row.current_period_end !== null && Date.parse(row.current_period_end) > now;
  return { active, plan: row.plan, periodEnd: row.current_period_end, status: row.status, cancelAtPeriodEnd: row.cancel_at_period_end === true };
}

/** Returns Razorpay's hosted payment page for the chosen plan (ADR-0004). */
export async function startSubscription(cfg: CloudConfig, s: Session, plan: 'monthly' | 'annual'): Promise<string> {
  const res = await cfg.fetch(`${cfg.url}/functions/v1/create-subscription`, { method: 'POST', headers: authHeaders(cfg, s), body: JSON.stringify({ plan }) });
  if (!res.ok) throw new Error('Could not start the subscription. Please try again.');
  const { url } = (await res.json()) as { url: string };
  if (!/^https:\/\/([a-z0-9-]+\.)*(razorpay\.com|rzp\.io)\//.test(url)) throw new Error('Unexpected payment page.');
  return url;
}

export async function setWeeklyReminder(cfg: CloudConfig, s: Session, weekly: boolean): Promise<void> {
  await rest(cfg, s, 'reminder_prefs?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: s.userId, weekly }),
  });
}

export async function getWeeklyReminder(cfg: CloudConfig, s: Session): Promise<boolean> {
  const rows = (await (await rest(cfg, s, 'reminder_prefs?select=weekly')).json()) as { weekly: boolean }[];
  return rows[0]?.weekly === true;
}

async function callFunction(cfg: CloudConfig, s: Session, name: string): Promise<void> {
  const res = await cfg.fetch(`${cfg.url}/functions/v1/${name}`, { method: 'POST', headers: authHeaders(cfg, s), body: '{}' });
  if (!res.ok) throw new Error(`${name} failed (${res.status})`);
}

/** Stops renewal; the plan runs to the end of the paid period (AC-2.10.1). */
export const cancelSubscription = (cfg: CloudConfig, s: Session) => callFunction(cfg, s, 'cancel-subscription');

/** Cancels any live subscription, then deletes the account and everything stored with it (AC-2.10.3). */
export const deleteAccount = (cfg: CloudConfig, s: Session) => callFunction(cfg, s, 'delete-account');

/** Removes every synced record and the key profile from the server (AC-2.10.2). */
export async function deleteSyncedCopy(cfg: CloudConfig, s: Session): Promise<void> {
  const mine = `user_id=eq.${encodeURIComponent(s.userId)}`;
  await rest(cfg, s, `journal_records?${mine}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(cfg, s, `journal_profiles?${mine}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

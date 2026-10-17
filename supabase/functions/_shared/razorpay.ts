/**
 * Razorpay webhook handling (ADR-0004, docs/SPEC.md AC-2.1.4 to AC-2.1.6).
 * Pure logic with injected storage, so it is tested in Node and served by
 * Deno unchanged.
 */
import type { SafeLog } from './log.ts';

export type EntitlementStatus = 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';
export type Plan = 'monthly' | 'annual';

export interface EntitlementRow {
  user_id: string;
  status: EntitlementStatus;
  plan: Plan | null;
  current_period_end: string | null;
  razorpay_subscription_id: string;
  last_event_at: string;
}

export interface BillingStore {
  /** true if this event ID was not seen before (and is now recorded). */
  recordEvent(eventId: string, eventType: string): Promise<boolean>;
  /** Undoes recordEvent when applying the event failed, so Razorpay's retry is processed. */
  forgetEvent(eventId: string): Promise<void>;
  getEntitlement(userId: string): Promise<EntitlementRow | null>;
  upsertEntitlement(row: EntitlementRow): Promise<void>;
}

const enc = new TextEncoder();

/** HMAC-SHA256(rawBody, secret) in hex, compared in constant time. */
export async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const STATUS_BY_EVENT: Record<string, EntitlementStatus> = {
  'subscription.authenticated': 'pending',
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.resumed': 'active',
  'subscription.pending': 'pending',
  'subscription.halted': 'halted',
  'subscription.paused': 'paused',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'completed',
  'subscription.expired': 'expired',
};

interface SubscriptionEvent {
  event: string;
  created_at: number;
  payload: {
    subscription?: { entity?: { id?: string; plan_id?: string; current_end?: number | null; notes?: { user_id?: string } } };
  };
}

/** The entitlement an event leads to, or null for events we don't act on. */
export function entitlementFor(evt: SubscriptionEvent, planOf: (planId: string) => Plan | null): EntitlementRow | null {
  const status = STATUS_BY_EVENT[evt.event];
  const sub = evt.payload.subscription?.entity;
  const userId = sub?.notes?.user_id;
  if (!status || !sub?.id || !userId) return null;
  return {
    user_id: userId,
    status,
    plan: sub.plan_id ? planOf(sub.plan_id) : null,
    current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
    razorpay_subscription_id: sub.id,
    last_event_at: new Date(evt.created_at * 1000).toISOString(),
  };
}

export interface WebhookDeps {
  secret: string;
  store: BillingStore;
  log: SafeLog;
  planOf: (planId: string) => Plan | null;
}

export async function handleWebhook(
  input: { rawBody: string; signature: string | null; eventId: string | null },
  deps: WebhookDeps,
): Promise<{ status: number; body: string }> {
  const log = (outcome: string, extra: { eventId?: string; eventType?: string } = {}) => deps.log({ fn: 'razorpay-webhook', outcome, ...extra });
  if (!(await verifySignature(input.rawBody, input.signature, deps.secret))) {
    log('bad signature');
    return { status: 401, body: 'invalid signature' };
  }
  let evt: SubscriptionEvent;
  try {
    evt = JSON.parse(input.rawBody) as SubscriptionEvent;
  } catch {
    log('bad json');
    return { status: 400, body: 'invalid body' };
  }
  const eventId = input.eventId;
  if (!eventId || typeof evt.event !== 'string' || typeof evt.created_at !== 'number') {
    log('missing fields');
    return { status: 400, body: 'missing event id' };
  }
  const meta = { eventId, eventType: evt.event };
  if (!(await deps.store.recordEvent(eventId, evt.event))) {
    log('duplicate', meta);
    return { status: 200, body: 'duplicate' };
  }
  try {
    const next = entitlementFor(evt, deps.planOf);
    if (!next) {
      log('ignored', meta);
      return { status: 200, body: 'ignored' };
    }
    const current = await deps.store.getEntitlement(next.user_id);
    if (current && Date.parse(current.last_event_at) > Date.parse(next.last_event_at)) {
      log('out of order', meta);
      return { status: 200, body: 'stale' };
    }
    await deps.store.upsertEntitlement({
      ...next,
      plan: next.plan ?? current?.plan ?? null,
      current_period_end: next.current_period_end ?? current?.current_period_end ?? null,
    });
    log('applied', meta);
    return { status: 200, body: 'ok' };
  } catch (e) {
    await deps.store.forgetEvent(eventId);
    log('failed', meta);
    throw e;
  }
}

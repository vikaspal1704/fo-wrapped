/**
 * Cancelling a plan and deleting an account (docs/SPEC.md US-2.10). Pure
 * logic with injected calls, tested in Node and served by Deno.
 */
import type { SafeLog } from './log.ts';
import type { EntitlementRow } from './razorpay.ts';

export interface AccountDeps {
  userFromToken: (token: string) => Promise<string | null>;
  getEntitlement: (userId: string) => Promise<EntitlementRow | null>;
  /** Razorpay: POST /v1/subscriptions/{id}/cancel. */
  cancelAtRazorpay: (subscriptionId: string, atPeriodEnd: boolean) => Promise<void>;
  markCancelAtPeriodEnd: (userId: string) => Promise<void>;
  /** Supabase Auth admin delete; foreign keys cascade to every Journal table. */
  deleteUser: (userId: string) => Promise<void>;
  log: SafeLog;
}

/** Statuses in which Razorpay may still charge. */
const LIVE = new Set(['active', 'pending', 'halted', 'paused']);

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

async function user(authorization: string | null, deps: AccountDeps): Promise<string | null> {
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return token ? deps.userFromToken(token) : null;
}

/** AC-2.10.1: stop renewal; the paid period runs out normally. */
export async function handleCancelSubscription(authorization: string | null, deps: AccountDeps) {
  const userId = await user(authorization, deps);
  if (!userId) return json(401, { error: 'sign in first' });
  const ent = await deps.getEntitlement(userId);
  if (!ent || !LIVE.has(ent.status)) return json(409, { error: 'no active subscription' });
  await deps.cancelAtRazorpay(ent.razorpay_subscription_id, true);
  await deps.markCancelAtPeriodEnd(userId);
  deps.log({ fn: 'cancel-subscription', outcome: 'scheduled' });
  return json(200, { endsAt: ent.current_period_end });
}

/** AC-2.10.3: cancel any live subscription at once (so no further charge), then delete the account. */
export async function handleDeleteAccount(authorization: string | null, deps: AccountDeps) {
  const userId = await user(authorization, deps);
  if (!userId) return json(401, { error: 'sign in first' });
  const ent = await deps.getEntitlement(userId);
  if (ent && LIVE.has(ent.status)) await deps.cancelAtRazorpay(ent.razorpay_subscription_id, false);
  await deps.deleteUser(userId);
  deps.log({ fn: 'delete-account', outcome: 'deleted' });
  return json(200, { deleted: true });
}

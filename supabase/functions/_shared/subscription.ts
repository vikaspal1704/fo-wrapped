/** Creates a Razorpay subscription for the signed-in user (ADR-0004, AC-2.1.3). */
import type { SafeLog } from './log.ts';
import type { Plan } from './razorpay.ts';

export interface SubscriptionDeps {
  keyId: string;
  keySecret: string;
  planIds: Record<Plan, string>;
  /** Resolves a Supabase access token to the user's ID, or null. */
  userFromToken: (token: string) => Promise<string | null>;
  fetch: typeof fetch;
  log: SafeLog;
}

/** Billing cycles before a subscription ends: about 10 years either way. */
const TOTAL_COUNT: Record<Plan, number> = { monthly: 120, annual: 10 };

export async function handleCreateSubscription(
  input: { authorization: string | null; body: string },
  deps: SubscriptionDeps,
): Promise<{ status: number; body: string }> {
  const token = input.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const userId = token ? await deps.userFromToken(token) : null;
  if (!userId) return { status: 401, body: JSON.stringify({ error: 'sign in first' }) };
  let plan: unknown;
  try {
    plan = (JSON.parse(input.body) as { plan?: unknown }).plan;
  } catch {
    plan = null;
  }
  if (plan !== 'monthly' && plan !== 'annual') return { status: 400, body: JSON.stringify({ error: 'plan must be monthly or annual' }) };
  const res = await deps.fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${deps.keyId}:${deps.keySecret}`)}` },
    body: JSON.stringify({ plan_id: deps.planIds[plan], total_count: TOTAL_COUNT[plan], customer_notify: 1, notes: { user_id: userId } }),
  });
  if (!res.ok) {
    deps.log({ fn: 'create-subscription', outcome: `razorpay ${res.status}` });
    return { status: 502, body: JSON.stringify({ error: 'payment provider error' }) };
  }
  const sub = (await res.json()) as { id: string; short_url: string };
  deps.log({ fn: 'create-subscription', outcome: 'created' });
  return { status: 200, body: JSON.stringify({ id: sub.id, url: sub.short_url }) };
}

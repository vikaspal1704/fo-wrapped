/** Wiring shared by the cancel-subscription and delete-account Deno entries. */
import type { AccountDeps } from './account.ts';
import { consoleLog } from './log.ts';
import { billingStore, cancelAtRazorpay, deleteAuthUser, markCancelAtPeriodEnd, userFromToken, type Rest } from './postgrest.ts';

export function accountDeps(env: (k: string) => string, fetchImpl: typeof fetch): AccountDeps {
  const rest: Rest & { anonKey: string } = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), anonKey: env('SUPABASE_ANON_KEY'), fetch: fetchImpl };
  const keys = { keyId: env('RAZORPAY_KEY_ID'), keySecret: env('RAZORPAY_KEY_SECRET'), fetch: fetchImpl };
  return {
    userFromToken: (t) => userFromToken(rest, t),
    getEntitlement: (u) => billingStore(rest).getEntitlement(u),
    cancelAtRazorpay: (id, atEnd) => cancelAtRazorpay(keys, id, atEnd),
    markCancelAtPeriodEnd: (u) => markCancelAtPeriodEnd(rest, u),
    deleteUser: (u) => deleteAuthUser(rest, u),
    log: consoleLog,
  };
}

export function corsHeaders(env: (k: string) => string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': env('JOURNAL_SITE_ORIGIN'), 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

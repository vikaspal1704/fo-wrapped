// Deno entry (Supabase Edge Function). Logic and tests: ../_shared/subscription.ts.
import { consoleLog } from '../_shared/log.ts';
import { userFromToken } from '../_shared/postgrest.ts';
import { handleCreateSubscription } from '../_shared/subscription.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': env('JOURNAL_SITE_ORIGIN'), 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const rest = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), anonKey: env('SUPABASE_ANON_KEY'), fetch };
  const out = await handleCreateSubscription(
    { authorization: req.headers.get('authorization'), body: await req.text() },
    {
      keyId: env('RAZORPAY_KEY_ID'),
      keySecret: env('RAZORPAY_KEY_SECRET'),
      planIds: { monthly: env('RAZORPAY_PLAN_MONTHLY'), annual: env('RAZORPAY_PLAN_ANNUAL') },
      userFromToken: (t) => userFromToken(rest, t),
      fetch,
      log: consoleLog,
    },
  );
  return new Response(out.body, { status: out.status, headers: { ...cors, 'Content-Type': 'application/json' } });
});

// Deno entry (Supabase Edge Function). Logic and tests: ../_shared/account.ts.
import { handleCancelSubscription } from '../_shared/account.ts';
import { accountDeps, corsHeaders } from '../_shared/serveAccount.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  const cors = corsHeaders(env);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const out = await handleCancelSubscription(req.headers.get('authorization'), accountDeps(env, fetch));
  return new Response(out.body, { status: out.status, headers: { ...cors, 'Content-Type': 'application/json' } });
});

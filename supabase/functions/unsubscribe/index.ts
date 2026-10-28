// Deno entry. Logic and tests: ../_shared/reminders.ts.
import { consoleLog } from '../_shared/log.ts';
import { turnOffReminders } from '../_shared/postgrest.ts';
import { handleUnsubscribe } from '../_shared/reminders.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  const rest = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetch };
  const out = await handleUnsubscribe(new URL(req.url).searchParams.get('token'), (t) => turnOffReminders(rest, t), consoleLog);
  return new Response(out.body, { status: out.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});

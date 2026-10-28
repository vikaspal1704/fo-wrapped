// Deno entry, run weekly by a Supabase cron schedule. Logic and tests: ../_shared/reminders.ts.
import { consoleLog } from '../_shared/log.ts';
import { weeklyRecipients } from '../_shared/postgrest.ts';
import { runWeeklyReminders } from '../_shared/reminders.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('forbidden', { status: 403 });
  const rest = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetch };
  const sent = await runWeeklyReminders({
    siteUrl: env('JOURNAL_SITE_URL'),
    functionsUrl: `${env('SUPABASE_URL')}/functions/v1`,
    listRecipients: () => weeklyRecipients(rest),
    send: async (to, email) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('REMINDER_FROM'), to, subject: email.subject, text: email.text }),
      });
      if (!res.ok) throw new Error(`email provider ${res.status}`);
    },
    log: consoleLog,
  });
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});

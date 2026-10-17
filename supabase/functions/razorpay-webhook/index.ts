// Deno entry (Supabase Edge Function). Logic and tests: ../_shared/razorpay.ts.
import { consoleLog } from '../_shared/log.ts';
import { billingStore } from '../_shared/postgrest.ts';
import { handleWebhook, type Plan } from '../_shared/razorpay.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const plans: Record<string, Plan> = { [env('RAZORPAY_PLAN_MONTHLY')]: 'monthly', [env('RAZORPAY_PLAN_ANNUAL')]: 'annual' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const out = await handleWebhook(
    { rawBody: await req.text(), signature: req.headers.get('x-razorpay-signature'), eventId: req.headers.get('x-razorpay-event-id') },
    {
      secret: env('RAZORPAY_WEBHOOK_SECRET'),
      store: billingStore({ url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetch }),
      log: consoleLog,
      planOf: (id) => plans[id] ?? null,
    },
  );
  return new Response(out.body, { status: out.status });
});

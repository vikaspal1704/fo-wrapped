# Runbook: set up the Journal's cloud side

Owner task. The free Wrapped site on GitHub Pages needs none of this; it is only for a build of the Journal with accounts, plans and sync (ADR-0001).

## 1. Supabase

1. Create a project in the Mumbai region (closest to users).
2. **Authentication → Providers → Google:** turn it on with a Google OAuth client. Add the Journal's URL, e.g. `https://journal.example.in/?journal=1`, to the allowed redirect URLs.
3. Apply the database: `supabase link --project-ref <ref>` then `supabase db push` (runs `supabase/migrations/`).
4. Function secrets (`supabase secrets set …`):

   | Name | Value |
   |------|-------|
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API keys (live keys only after testing) |
   | `RAZORPAY_WEBHOOK_SECRET` | The secret you set on the Razorpay webhook (step 2.3) |
   | `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_ANNUAL` | Plan IDs from step 2.1 |
   | `JOURNAL_SITE_URL`, `JOURNAL_SITE_ORIGIN` | e.g. `https://journal.example.in/` and `https://journal.example.in` |
   | `RESEND_API_KEY`, `REMINDER_FROM` | Email provider key and a verified sender, e.g. `F&O Journal <reports@example.in>` |
   | `CRON_SECRET` | A long random string; the schedule sends it |

5. Deploy: `supabase functions deploy razorpay-webhook create-subscription weekly-reminder unsubscribe` (settings in `supabase/config.toml`).
6. **Schedule:** run the `weekly-reminder` function every Monday at 08:00 IST (02:30 UTC). Use Supabase cron (`pg_cron` + `pg_net`) with the header `Authorization: Bearer <CRON_SECRET>`.

## 2. Razorpay

1. **Subscriptions → Plans:** create a monthly and an annual plan in INR at the prices you decide (BRIEF §9).
2. Test the whole flow in **test mode** first.
3. **Webhooks:** add `https://<ref>.supabase.co/functions/v1/razorpay-webhook` with a secret, for the events `subscription.authenticated`, `activated`, `charged`, `pending`, `halted`, `paused`, `resumed`, `cancelled`, `completed` and `expired`.

## 3. Build the Journal site

Use the normal build with these variables set (see `.env.journal.example`):

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon key> \
VITE_JOURNAL_PRICE_MONTHLY='₹399/month' \
VITE_JOURNAL_PRICE_ANNUAL='₹3,999/year' \
npm run build
```

The build adds exactly the Supabase origin to the page's `connect-src`. Without these variables the build is local-only, which is what GitHub Pages serves.

## 4. Check before going live

- [ ] `npm run test:e2e` passes, including the cloud build tests.
- [ ] In Razorpay test mode: subscribe, then check `entitlements` shows `active`. Replay the webhook from the dashboard: nothing changes the second time.
- [ ] Cancel in test mode: the status becomes `cancelled`.
- [ ] Sync on two browsers with the same passphrase: the data matches. A wrong passphrase is refused.
- [ ] The function logs show only event IDs and types.

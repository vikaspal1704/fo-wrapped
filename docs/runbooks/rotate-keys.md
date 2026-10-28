# Runbook: rotate keys without downtime (SPEC AC-2.1.9)

Rotate at least yearly, and at once if a key may have leaked. Never paste keys into issues, PRs, chat or logs.

## Razorpay API key (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`)

1. Razorpay dashboard → API Keys → **Regenerate**. Razorpay keeps the old key working for a short overlap; check the current overlap in their docs.
2. `supabase secrets set RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=…`. Edge Functions pick up new secrets on the next request.
3. Create a test-mode subscription to confirm it works.

## Razorpay webhook secret (`RAZORPAY_WEBHOOK_SECRET`)

Razorpay signs with one secret per webhook, so do this in a quiet hour:

1. Set the new secret on the webhook in the dashboard and immediately run `supabase secrets set RAZORPAY_WEBHOOK_SECRET=…`.
2. Deliveries that fail in between get a 401, and Razorpay retries them automatically. Retries are safe because events are idempotent (`webhook_events`).
3. Check the dashboard's webhook log: the retries end in 200.

## Supabase service-role key

1. Project settings → API → **Generate new service-role key** (the JWT secret rotation flow).
2. Update any secrets that hold it. Functions read `SUPABASE_SERVICE_ROLE_KEY`, which Supabase manages automatically for deployed functions.
3. Redeploy the functions and run the checks in `journal-setup.md` §4.

## Supabase anon key

It is public by design (shipped in the Journal build). Rotating it means rebuilding and redeploying the Journal site with the new `VITE_SUPABASE_ANON_KEY`. RLS, not the anon key, protects the data.

## Email provider (`RESEND_API_KEY`) and `CRON_SECRET`

Create the new key, `supabase secrets set …`, update the cron job's header for `CRON_SECRET`, then revoke the old key.

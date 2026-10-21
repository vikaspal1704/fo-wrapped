# ADR-0004: Billing and entitlements

**Status:** Accepted (proposed by Claude, pending owner review) · 2026-10-17

## Context

Paid plans are in rupees, monthly and annual (prices: owner, BRIEF §9). Entitlements must be enforced on the server. Payment data must never be logged. The site's CSP allows no third-party scripts.

## Options

| Option | For | Against |
|--------|-----|---------|
| Razorpay Checkout script on our page | In-page payment | Third-party script; needs CSP changes |
| **Razorpay Subscriptions with the hosted `short_url` page** | No third-party code on our origin; Razorpay handles cards, UPI and mandates | A redirect away and back |
| Plan checks in client code only | Simple | Not enforced; fails the brief |

## Decision

- **Subscribe:**
  1. The signed-in client calls the Edge Function `create-subscription` with `{ plan: 'monthly' | 'annual' }`.
  2. The function checks the user's JWT and calls `POST /v1/subscriptions` with the plan ID from `RAZORPAY_PLAN_MONTHLY` / `RAZORPAY_PLAN_ANNUAL` and `notes.user_id`.
  3. It returns `short_url`; the browser goes there and comes back to `#journal`.
- **Webhook** (`razorpay-webhook`):
  - **Verify** `X-Razorpay-Signature` = HMAC-SHA256(raw body, `RAZORPAY_WEBHOOK_SECRET`), compared in constant time. A bad signature gets 401.
  - **Idempotent:** insert the `x-razorpay-event-id` into `webhook_events` (primary key). A duplicate is acknowledged and does nothing (AC-2.1.4).
  - **Ordered:** an event older than the entitlement's `last_event_at` is ignored, so a late `charged` can't undo a `cancelled`.
  - **Mapping:** `subscription.activated`, `charged` and `resumed` set `active` until `current_end`; `halted`, `cancelled`, `completed`, `expired` and `paused` set that status.
  - **Logs:** event ID and type only, never the payload (AC-2.1.6).
- **Entitlements:**
  - `entitlements(user_id, status, plan, current_period_end, razorpay_subscription_id, last_event_at)`.
  - Users can read only their own row; only the service role writes.
  - `has_active_plan(uid)` is used by the RLS policies on `journal_records` and `reminder_prefs` (AC-2.1.5).
- **Leaving** (SPEC US-2.10):
  - `cancel-subscription` asks Razorpay to cancel at the end of the cycle and sets `cancel_at_period_end`.
  - `delete-account` cancels any live subscription immediately, then deletes the Auth user; foreign keys cascade to every Journal table.
  - Users can always read and delete their own synced rows; only writes need a plan.
- **Keys:** live in Supabase function secrets only. Rotation steps: `docs/runbooks/rotate-keys.md` (AC-2.1.7).

## Revisit when

Razorpay changes its subscription API, or another payment provider is added.

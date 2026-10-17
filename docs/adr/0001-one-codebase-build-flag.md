# ADR-0001: One codebase, cloud features behind a build flag

**Status:** Accepted (proposed by Claude, pending owner review) · 2026-10-17

## Context

Wrapped must stay a static, signed-out app on GitHub Pages with `connect-src 'self'` (ROADMAP P1). The Journal adds local history, which works without a server, and paid cloud features (account, billing, sync, reminder email), which need Supabase.

## Options

| Option | For | Against |
|--------|-----|---------|
| A. Separate app and repository | Hard isolation | Two copies of the parsing and engine code; double maintenance for a solo developer |
| B. One app, runtime feature flags fetched from a server | Flip features without a deploy | Wrapped would need a network call at start; weakens P1 |
| **C. One app; the Journal is a lazy-loaded `#journal` route; cloud features exist only when the build sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`** | One engine; Wrapped's bundle and CSP unchanged when the variables are absent; the Journal's local features work everywhere | Two builds to think about (Pages: local only; Journal host: with cloud) |

## Decision

Option C.

- The Journal code is split into its own chunk (`React.lazy`). Wrapped never imports it, so Wrapped's screens touch no storage (`e2e_no_storage_writes` still holds).
- `src/journal/cloud/config.ts` reads the two variables. When they are absent, the account, plan and sync panels are not rendered, and the CSP stays `connect-src 'self'`.
- When they are present, the build plugin adds exactly that Supabase origin to `connect-src` (`build/cspPlugin.ts`), and nothing else.
- **Entitlement gating:**
  - In a cloud build, the Journal's screens need an active plan, cached on the device for 7 days for offline use.
  - In a build without cloud settings (local development, self-hosting), the Journal is unlocked.
  - The code is open source, so client-side gating of local features can be bypassed. What the server enforces (RLS) is sync storage and reminder emails, and that is where the paid value lives.

## Revisit when

The Journal needs features that can't be lazy-split, or Pages traffic needs a different host.

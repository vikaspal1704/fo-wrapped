# F&O Journal (built on F&O Wrapped): Project Brief

Owner: Vikas Pal, a solo developer with a full-time job. Work happens in short sessions.
Repo: `vikaspal1704/fo-wrapped` (public, MIT, Vite + React + TypeScript, Web Worker engine, GitHub Pages).

> **Decisions recorded on 2026-10-17** (owner answers to conflicts between this brief and the existing docs):
>
> 1. **Principles split by product.** Wrapped keeps ROADMAP principles P1–P5 unchanged. The Journal has its own principles (ROADMAP §2.1): local-first, opt-in end-to-end encrypted sync, accounts only for billing and sync, no advice.
> 2. **Weekly report is built on the device.** Any email is only a "your weekly report is ready" reminder with no numbers in it.
> 3. **Harness detail stays local.** The console prints alias, percentages and PASS/FAIL only. Per-contract mismatches go to a gitignored `verification-report-<alias>.json` on the owner's machine.
> 4. **Spec first.** User stories and Given/When/Then acceptance criteria live in [`SPEC.md`](SPEC.md). Code is written against them, and every criterion maps to a named test.
>
> **Decisions recorded on 2026-10-21** (extending the Journal beyond F&O):
>
> 5. **Equity first.** The paid Journal covers more segments, starting with Zerodha equity. Currency (CDS) and commodity (MCX) follow once the owner shares redacted real tradebooks; no parser is written for an unseen layout.
> 6. **Mutual funds as a portfolio from the CAS**, not as trades, after an ADR on reading the statement on the device.
> 7. **Naming.** The paid product is the **Trade Journal**; **F&O Wrapped** keeps its name and stays F&O only. The brief below keeps its original wording.

## 1. Goal

Turn F&O Wrapped (a free, client-only "year in review" for Indian F&O traders) into a paid trade journal for Indian F&O traders.

- **Wrapped** = the free acquisition hook, launched on Diwali / Muhurat trading, **8 Nov 2026** (the start of Samvat 2083; the launch wraps Samvat 2082).
- **Journal** = the paid product: saved history, weekly reports, and alerts when a day broke the user's own risk rules.
- Success metric: first 1,500-2,000 Wrapped users, then 50 paying users at INR 299-499/month (first target, realistic by Jan-Feb 2027).

## 2. Why this should work (context, not requirements)

- FY26 SEBI data: about 78.6 lakh individual F&O traders, 87.7% lost money, average loss about INR 1.17 lakh.
- Existing Indian journals are largely manual entry (e.g. OneTradeJournal, INR 499/month) or equity-first imports. This claim comes from a competitor's own page, so verify it in a quick competitor check.
- Moat: F&O-specific parsing with correct Indian charges, plus behaviour detection (revenge trades, expiry-day patterns, overtrading), plus a local-first privacy story.

## 3. Hard constraints

1. **Privacy:** Wrapped stays fully client-side. No uploads, no analytics that carry trade data, no server. Sync in the paid tier is opt-in and end-to-end encrypted.
2. **No investment advice (SEBI):** the app describes past behaviour only. No buy/sell/hold, no predictions, no "you should trade X". Show a disclaimer in the footer and on the share cards.
3. **Correctness before features:** net P&L must match Zerodha Console within 0.5% on at least 5 real accounts before public launch. This is the launch gate.
4. **Static-first:** the free app stays deployable on GitHub Pages. Paid features may use Supabase (Postgres + RLS + Auth + Edge Functions).
5. **Scope:** NSE and BSE F&O only. Brokers: Zerodha (tradebook + P&L), Angel One, Upstox, Dhan (the last three are beta).
6. **Solo-dev maintainability:** boring tech, small PRs, tests for every parser and calculation.

## 4. Working agreements for every session

- Before changing anything, read `README.md` and everything in `docs/`. If this brief conflicts with those docs, **stop and ask**, then update the docs.
- Ask clarifying questions when requirements are ambiguous. Do not guess on money, tax, charges or privacy.
- Small single-purpose functions, pure logic in `src/engine/` (no DOM), strict TypeScript, no `any`, input validated with Zod at every boundary, no dead code, meaningful names.
- Every bug fix gets a regression test. Parsers and charge math get unit tests with synthetic fixtures only. **Never commit real trade data.** Vitest for unit tests, Playwright for e2e (offline, privacy, accessibility).
- A branch per task, small commits, and a PR description covering what changed, why, how it was tested and what is not covered. Do not push to `main`.
- Before finishing a session, run lint, type-check, unit tests and the build, and report the results honestly, including failures.
- Update `docs/` and the README in the same PR as any behaviour change.

## 5. Phases

Stories and acceptance criteria for every phase: [`SPEC.md`](SPEC.md).

- **Phase 0, launch gate (by 24 Oct 2026):**
  - audit the parsers against real exports;
  - build the reconciliation harness;
  - test the edge cases;
  - keep the charges config-driven by date;
  - write `docs/validation-report.md`.
  - Owner task: collect 5 real exports from volunteers, removing identifying details before sharing.
- **Phase 1, public launch polish (25 Oct - 7 Nov 2026):**
  - PWA offline, Lighthouse and accessibility in CI;
  - story-size share cards in English and Hindi, with an in-image disclaimer;
  - Open Graph image and landing page;
  - error UX for bad files;
  - a privacy page that proves the claim, plus an e2e test that fails if any request carries file data;
  - no analytics;
  - launch assets in `docs/launch/`.
- **Phase 2, paid Journal MVP (Nov - Dec 2026), one PR per item:**
  1. accounts and billing;
  2. saved history (local-first, optional encrypted sync);
  3. incremental import;
  4. rules engine;
  5. behaviour insights;
  6. weekly report;
  7. trade notes and tags.
- **Phase 3, later (do not build yet):** direct broker APIs, a mobile app, a public streaks page, team or coach sharing.

## 6. Technical decisions to confirm (ADRs in `docs/adr/`, Session D)

- State and storage layout for local-first history (IndexedDB schema, migrations).
- Encryption scheme for synced data (Web Crypto, key derivation, key-loss behaviour).
- Where billing logic lives (Edge Function webhooks, idempotency, plan checks via RLS or an entitlements table).
- How the free and paid apps share one codebase (feature flags vs separate route).
- Test strategy for money math (golden files per broker, property tests where useful).

## 7. Definition of done for any task

- Strict types, clean lint and type-check, tests pass locally and in CI.
- No real trade data, secrets or personal data in the repo or the logs.
- Docs updated. A user-facing change has a screenshot or a short note in the PR.
- The change does not weaken the privacy or no-advice constraints in §3.

## 8. Session prompts

- **A, audit and harness:** audit parsers and charges against Phase 0, rank correctness risks, build the reconciliation harness with synthetic fixtures. No UI.
- **B, charges and edge cases:** config-driven charges by effective date; tests for expiry, exercise or assignment, partial fills, intraday vs carry-forward and financial-year boundaries. Show the test table first.
- **C, launch polish:** Phase 1, one PR per item.
- **D, architecture:** propose options for §6, recommend one each, write ADRs. No feature code.
- **E, accounts and billing:** Phase 2 item 1. Server-side entitlements, webhook idempotency, a key-rotation runbook. Never log payment data.
- **F, saved history and rules:** Phase 2 items 2-4; describe the data model and migrations before coding.
- **G, insights and weekly report:** Phase 2 items 5-6; a unit test per insight and a no-advice wording checklist.

## 9. Open questions for the owner (answer before Phase 2)

- Target income and timeline.
- Hours per week available.
- Final price points and annual discount.
- Whether the owner's employment contract allows this side project (check outside-work and IP clauses).

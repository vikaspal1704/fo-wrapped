# Specification: F&O Wrapped and the Trade Journal

**Owner:** Vikas Pal · **Status:** v2, 2026-10-21: Phases 0–2 built and tested; Phase 3 equity built, other segments wait on samples; owner tasks marked 👤 · **Brief:** [`BRIEF.md`](BRIEF.md)

This is the spec we build against. Every user story has acceptance criteria written as Given / When / Then. Every criterion has an ID and a named automated test, or it is marked *manual* or *owner* with the reason. Code is written to make these tests pass, and a criterion is done only when its test passes in CI.

The existing requirements still hold:

- Wrapped's MUSTs in [`PRD.md`](PRD.md);
- engine types and errors in [`API_CONTRACT.md`](API_CONTRACT.md);
- formulas in [`ARCHITECTURE.md`](ARCHITECTURE.md);
- required test names in [`TEST_PLAN.md`](TEST_PLAN.md).

This spec adds the launch-gate work, launch polish and the paid Journal. Where it changes an existing rule, the change is made in that doc in the same PR.

---

## 0. How to read this

| Item | Format |
|------|--------|
| Story | `US-<phase>.<n>`: *As a …, I want …, so that …* |
| Criterion | `AC-<phase>.<n>.<m>`: Given / When / Then. Amounts are integer paise, dates are IST. |
| Status | ✅ passing (test exists and is green) · 🔨 this PR · ⏳ planned · 👤 owner task · 🧭 needs an ADR or an owner answer first |
| Test | The exact Vitest or Playwright test name. A criterion without a test is not done. |

Personas: **Trader** (a retail F&O trader, usually on a phone), **Owner** (Vikas, running the launch gate), **Subscriber** (a paying Journal user).

---

## 1. Rules that apply to every story

### 1.1 Privacy

| ID | Rule | Test |
|----|------|------|
| PV-1 | Wrapped (the free, signed-out app) never sends file contents or anything derived from them over the network, and never writes them to storage. | `e2e_no_network_during_analysis`, `e2e_no_storage_writes`, `e2e_no_request_carries_file_data` |
| PV-2 | Journal data leaves the device only through opt-in sync, encrypted on the device first. The server holds ciphertext, the account, and the subscription. | `sync_uploads_only_ciphertext`, `e2e_key_loss_warning_shown_and_sync_sends_only_ciphertext` (ADR-0002) |
| PV-3 | File names contain the Zerodha client ID. They are never shown in share images, synced, stored in an import history, or logged. | `share_image_has_no_file_names` (✅), `import_history_strips_client_id` (✅) |
| PV-4 | The launch-gate harness prints only account aliases, percentages and PASS/FAIL. Anything more detailed goes to a gitignored file in the owner's private folder. | `verify_real_console_shows_no_trade_data` |

### 1.2 Reality first (owner direction, 2026-10-17)

| ID | Rule |
|----|------|
| RL-1 | Reliability is the top priority. Every number shows what actually happened in the account, the way the broker's own records (Console) count it. A rule that makes a number differ from reality is changed, even if it is locked in the docs. |
| RL-2 | Where a file genuinely lacks a fact (a settlement price, a charge the broker doesn't print), the app shows the gap and its size in words. It never fills the gap with a guess. |

### 1.3 No investment advice (SEBI)

Every user-visible sentence, in English and Hindi, passes this checklist. It is checked in review, and the wording tests below check it automatically.

| ID | Rule |
|----|------|
| NA-1 | Describes the user's own past trades only. No buy, sell or hold; no instrument, strike or strategy suggestions. |
| NA-2 | No predictions or forward-looking claims ("you will", "likely to", "expect"). |
| NA-3 | No imperative trading instructions ("stop trading after…", "avoid expiry days"). Facts only: "On days after 2 losses you lost ₹X more." |
| NA-4 | No percentile or ranking claims without a real data source (ROADMAP P5). |
| NA-5 | A disclaimer, *"Not investment, trading or tax advice"*, appears in the footer and inside every share image, in the image's language. |

Automated: `copy_passes_no_advice_wordlist` scans the English and Hindi catalogues and `docs/launch/` for banned phrases (✅). Each Journal insight also has its own wording test (§4).

---

## 2. Phase 0: launch gate (by 24 Oct 2026)

Goal: be able to show, with evidence, that net P&L matches Zerodha Console within ±0.5% on ≥ 5 real accounts, and explain any account that doesn't match.

### US-0.1 Reconcile an account against Console

*As the Owner, I want to compare the app's estimate with an account's Console P&L statement, so that I know whether the numbers are right before launch.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-0.1.1 | an account folder with Zerodha tradebook(s) and one F&O P&L statement | the harness checks it | it runs the engine **without** the statement and reports `netDiffPct = abs(est − stmt) / abs(stmt) × 100` against the statement's realised P&L minus charges. PASS when ≤ 0.5 | `verify_real_passes_within_tolerance`, `verify_real_fails_outside_tolerance` | ✅ |
| AC-0.1.2 | a tradebook with trades before and after the statement's period | the harness checks it | only trades dated inside the period are used | `verify_real_uses_only_trades_in_statement_period` | ✅ |
| AC-0.1.3 | a folder with zero, two or more P&L statements, or no tradebook | the harness checks it | the account is an ERROR with a plain reason, never a PASS | `verify_real_needs_one_statement` | ✅ |
| AC-0.1.4 | results for several accounts | the gate is decided | the gate passes only if **at least 5 accounts ran and every account passed**. ERROR counts as not passed | `verify_real_gate_needs_five_passing_accounts` | ✅ |
| AC-0.1.5 | any run | it prints to the console | the output holds only aliases, percentages, counts, file paths it wrote, and PASS/FAIL/ERROR: no symbols, amounts or trade IDs | `verify_real_console_shows_no_trade_data` | ✅ |

### US-0.2 See why an account differs

*As the Owner, I want the difference broken down by contract and by charge, so that I can find the cause (a rate window, rounding, an expired position) instead of guessing.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-0.2.1 | an account checked by the harness | it finishes | it writes `verification-report-<alias>.json` in the private folder (never in the repo), with one row per contract: `symbol`, `tradebookPnlPaise`, `statementPnlPaise`, `diffPaise`, `status` | `verify_real_writes_contract_detail` | ✅ |
| AC-0.2.2 | a contract in both sources whose P&L differs by at most 1 paise | it is classified | status `MATCHED` (statement values are rounded to paise) | `verify_real_classifies_contracts` | ✅ |
| AC-0.2.3 | a contract that differs by more than 1 paise | it is classified | status `DIFFERENT` | `verify_real_classifies_contracts` | ✅ |
| AC-0.2.4 | a contract with closed trades in the tradebook but no statement row, or a statement row with realised P&L but no tradebook trades | it is classified | status `ONLY_IN_TRADEBOOK` or `ONLY_IN_STATEMENT` | `verify_real_classifies_contracts` | ✅ |
| AC-0.2.5 | a contract left unclosed in the tradebook (settled at expiry, exercised, assigned, or open) | it is classified | status `EXCLUDED`, carrying the statement's figure, because the estimate leaves it out by design (ARCHITECTURE §5) | `verify_real_attributes_expired_contract_as_excluded` | ✅ |
| AC-0.2.6 | any account | the detail is written | it adds an attribution that **adds up exactly**: `netDiffPaise = contractDiffPaise + excludedPaise + statementRowsGapPaise − chargesDiffPaise`. Each term is estimate minus statement, in paise; `statementRowsGapPaise` is the statement's contract rows minus its realised total. A failure here is a bug in the harness | `verify_real_attribution_adds_up` | ✅ |
| AC-0.2.7 | the detail file's name | it is created | it matches the existing `.gitignore` pattern `verification-report*.json` | `verify_real_detail_file_is_gitignored` | ✅ |
| AC-0.2.8 | the detail file was written | the console reports it | the console shows its path and the count of contracts per status, never their names | `verify_real_console_shows_no_trade_data` | ✅ |

### US-0.3 Charges come from dated config

*As the Owner, I want every charge rate to live in a dated table with its source, so that a Budget or exchange change is a data change, not a code change.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-0.3.1 | fills on dates covered by a rate window | charges are calculated | each fill uses the window containing its trade date | `uses_rate_window_for_trade_date`, `hand_worked_option_round_trip` | ✅ |
| AC-0.3.2 | a fill on a date no window covers | charges are calculated | `ChargesUnavailableError` names the date and the charge. No nearby rate is borrowed | `missing_rate_window_throws`, `charges_unavailable_only_affects_its_period` | ✅ |
| AC-0.3.3 | a copy of the rate table with one new window added | the same fills are charged with it | results change from that window's date onward, with **no code change** | `new_rate_window_applies_without_code_change` | ✅ |
| AC-0.3.4 | the shipped rate table | the gate is decided | the harness prints `Rates checked against primary sources: x of y`. The launch gate fails while any row is `secondary` | `verify_real_gate_needs_primary_rates` | ✅ |

### US-0.4 Edge cases give the Console answer, or say why not

*As a Trader, I want unusual trades handled the way Console handles them, or clearly excluded, so that no number is invented.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-0.4.1 | an option held past its expiry with no closing trade | analysed | it is `SETTLED_AT_EXPIRY`, excluded from P&L with a notice, or valued from the P&L statement's contract row when one is added | `flags_option_past_expiry_as_settled`, `values_settled_position_from_pnl_statement` | ✅ |
| AC-0.4.2 | an option exercised or assigned (it disappears without a closing trade) | analysed in estimated mode | it is treated as settled at expiry (AC-0.4.1). The STT on exercise is not estimated, and the warning says that settled contracts are excluded | `exercised_option_is_excluded_not_valued` | ✅ |
| AC-0.4.3 | one order filled in several parts | analysed | the parts form one FIFO position and brokerage is charged once per order per day | `fifo_partial_fills_same_order`, `brokerage_order_split_across_days_charged_per_day` | ✅ |
| AC-0.4.4 | a position bought one day and sold on a later day (carry-forward) | analysed | one round trip, counted on its exit date; buy-side charges on the buy day and sell-side charges on the sell day | `carry_forward_round_trip_counts_on_exit_day` | ✅ |
| AC-0.4.5 | a carried-forward lot and a new intraday buy in the same contract, then a sell for one lot | analysed | the tradebook has no product (MIS/NRML) column, so the contract is one FIFO queue: the sell closes the **older** lot (a partial round trip, AC-0.4.10) and the newer one stays open. Whether Console agrees is measured by the launch gate | `intraday_and_carry_forward_share_one_fifo_queue` | ✅ |
| AC-0.4.6 | overlapping tradebook files | merged | duplicates (same exchange + trade ID) are dropped once; conflicting duplicates are rejected | `dedupes_overlapping_files_by_trade_id`, `rejects_conflicting_duplicate` | ✅ |
| AC-0.4.7 | a trade bought on 31 Mar and sold on 1 Apr | the financial-year views are built | the round trip counts in the new FY; the buy-side charges count in the old FY | `view_counts_trade_where_it_closed_and_charges_where_paid` | ✅ |
| AC-0.4.8 | trades exiting on 7 Nov 2026 and on 8 Nov 2026 (Muhurat) | Samvat labels are given | the first is Samvat 2082 and the second Samvat 2083 | `samvat_boundary_on_muhurat_day` | ✅ |
| AC-0.4.10 | a position partly closed (e.g. 150 bought, 75 sold) that never returns to flat | analysed | the closed 75 is a round trip with `partial: true`, its realised P&L counted on the day of its last closing trade, as Console counts it. The other 75 stays unclosed, dated from its own buy, and a note says that the closed part is counted and the rest isn't (RL-1) | `partly_closed_position_counts_realised_part` | ✅ |
| AC-0.4.11 | that position's remainder expires and the P&L statement has the contract's row | analysed with the statement | the remainder is valued as the row minus everything already closed, so the contract's total equals the statement's row exactly | `settled_remainder_plus_partial_equals_statement_row` | ✅ |
| AC-0.4.9 | a stock F&O contract adjusted for a corporate action (bonus, split), so the closing trade is in a new symbol | analysed | the two symbols are never netted: both stay unclosed and excluded with a notice, and the harness lists them as `ONLY_IN_*` or `EXCLUDED` | `adjusted_contract_is_not_netted_with_original` | ✅ |

### US-0.5 A validation report decides go or no-go

*As the Owner, I want a short report with the evidence, so that the launch decision is written down and repeatable.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-0.5.1 | a harness run with `--markdown` | it finishes | it prints a Markdown table of alias, net %, gross % and result, the rates line, and the gate result. No amounts or symbols | `verify_real_markdown_has_no_amounts` | ✅ |
| AC-0.5.2 | the repository | before launch | `docs/validation-report.md` lists accounts checked, each difference, known gaps, and **GO** or **NO-GO** | *manual*, reviewed in the launch PR | ✅ template, 👤 results |
| AC-0.5.3 | real exports from 5 volunteers, with identifying details removed | the owner runs the harness locally | every account is within ±0.5%; results are pasted into the report | 👤 | ⏳ |

### Correctness risks found while writing this spec (ranked by impact on net P&L)

| # | Risk | Effect in estimated mode | Where it shows | Decision |
|---|------|--------------------------|----------------|----------|
| R1 | Positions settled at expiry, exercised or assigned are left out (no settlement price in a tradebook) | Net P&L misses their value, and the STT on exercise | `EXCLUDED` rows and `excludedPaise` | By design (PRD F-EN-2). With the P&L statement they are valued exactly |
| R2 | ~~A position partly closed but never back to flat lost the P&L already realised on the closed part~~ | **Fixed** (owner decision 2026-10-17, RL-1): the closed part is a partial round trip (AC-0.4.10, AC-0.4.11) | `EXCLUDED` rows now carry the realised part on the tradebook side | Done |
| R3 | Rates checked only against secondary sources; no windows before 2024-10-01 or for BSE futures | Charges wrong or unavailable for those dates | `chargesDiffPaise`, rates line | 👤 primary-source check |
| R4 | ₹40 brokerage when an account misses the 50% cash-collateral rule (from 2026-04-01); IPFT and clearing charges not modelled | Charges understated | brokerage and `other` component diffs | Measure on real accounts (PRD D-12) |
| R5 | No MIS/NRML column, so a contract is one FIFO queue across products | Only the split between round trips and open positions, unless Console nets differently | `DIFFERENT` rows | Measure on real accounts |
| R6 | Corporate-action adjusted contracts change symbol mid-position | Both legs unclosed and excluded | `ONLY_IN_*` / `EXCLUDED` rows | Known gap; rare for index F&O |

### Phase 0 open items for the owner (not blocking the code)

- 👤 Collect 5 real exports with P&L statements. Run `npm run verify:real -- --dir ../fo-wrapped-private --markdown`.
- 👤 Check every rate row against its primary source (zerodha.com, NSE and BSE circulars) and mark it `primary`. These sites can't be reached from the build environment.
- 👤 Confirm the Muhurat date for Samvat 2083 against the NSE circular.
- 👤 Check one real F&O **XLSX** tradebook (BROKERS §2.4a).

---

## 3. Phase 1: launch polish (25 Oct – 7 Nov 2026)

One PR per story.

### US-1.1 Works offline, measured in CI

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.1.1 | the app loaded once | the network goes away and the page reloads | the app works and analyses a file | `e2e_works_offline_after_load`, `e2e_pwa_reload_offline` | ✅ |
| AC-1.1.2 | a push to a PR | CI runs | Lighthouse (mobile) runs on the built site: Accessibility = 100, Best Practices ≥ 95, Performance ≥ 90, installable. Below threshold fails CI | `ci: lighthouse` job | ✅ |
| AC-1.1.3 | every screen and card | axe runs | no WCAG 2.1 AA violations | `a11y_landing_privacy_and_every_card` | ✅ |

### US-1.2 Share cards I'm happy to post

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.2.1 | any card or the summary | I download its image | a 1080×1920 PNG | `e2e_download_image`, `e2e_share_single_card` | ✅ |
| AC-1.2.2 | the app in English or Hindi | an image is made | it contains the disclaimer (NA-5) in that language | `share_image_has_disclaimer_in_its_language` | ✅ |
| AC-1.2.3 | files named `tradebook-AB1234-FO.csv` | an image is made | the image has no file name, client ID or symbol list | `share_image_has_no_file_names` | ✅ |
| AC-1.2.4 | a phone that supports file sharing | I tap Share | the system share sheet opens with the image; otherwise it downloads | `e2e_share_single_card`, *manual* on Android Chrome and iOS Safari | ✅ / 👤 |
| AC-1.2.5 | the site link pasted in WhatsApp or X | a preview is shown | it uses the Open Graph image and title | `e2e_manifest_is_installable` (meta), *manual* | ✅ |

### US-1.3 A wrong file tells me what to do

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.3.1 | an equity tradebook, a PDF or an unrelated CSV | I drop it | a plain message says what the file is (if known) and what to download instead | `e2e_rejects_wrong_file_with_message` | ✅ |
| AC-1.3.2 | that error message | it is shown | it has a link to the "how to export from your broker" guide for the detected broker, or to the guide list | `e2e_error_links_to_export_guide` | ✅ |

### US-1.4 I can check the privacy claim myself

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.4.1 | the privacy page | I read it | it explains how to verify in DevTools (Network tab stays empty while analysing) | `e2e_privacy_page` | ✅ |
| AC-1.4.2 | a file containing a unique marker string | it is analysed and every card and image is opened | no request is made after load except same-origin GETs for static files, and **no request URL or body contains the marker** | `e2e_no_request_carries_file_data` | ✅ |
| AC-1.4.3 | the built `dist/` | it is scanned | no analytics or tracker code and no third-party origins (owner decision: no analytics) | `build_has_no_third_party_origins` | ✅ |

### US-1.5 Launch assets

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.5.1 | `docs/launch/` | before 8 Nov | it has an X thread, a LinkedIn post, an r/IndiaInvestments post and a demo GIF script, each passing the no-advice checklist (§1.2) and claiming nothing the app doesn't do | *manual review* | ✅ |

---

## 4. Phase 2: the paid Journal (Nov – Dec 2026)

Architecture: [`adr/`](adr/README.md) (ADR-0001 to ADR-0005). Journal principles: ROADMAP §2.1 (local-first; sync opt-in and end-to-end encrypted; an account only for billing and sync; no advice; Wrapped stays free and signed-out). Owner inputs still open: final prices (shown from build config), employment-contract check, target income and hours (BRIEF §9). None of them block the code.

Also covered: `e2e_journal_rules`, `e2e_journal_hindi`, `e2e_cloud_locked_until_plan_then_subscribe`, `create_subscription_needs_a_signed_in_user_and_a_plan`, `webhook_failure_lets_razorpay_retry`, `rls_rejects_readable_record_ids`, `record_ids_are_opaque_and_stable`, `sync_pulls_and_decrypts_on_another_device`, `entitlement_and_subscription_client`, `week_runs_monday_to_sunday`, `notes_tags_are_normalised`, `postgrest_store_uses_ignore_duplicates_for_events`.

Code: pure analysis in `src/engine/journal/`; storage, crypto and cloud clients in `src/journal/`; server in `supabase/` (SQL migrations with RLS, Edge Functions whose logic lives in tested modules under `supabase/functions/_shared/`).

### US-2.1 Sign in and subscribe

*As a Trader, I want to sign in with Google and subscribe in rupees, so that I can use the Journal across devices.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.1.1 | a signed-out visitor | they use Wrapped | everything works with no sign-in prompt before results (ROADMAP P4) | `e2e_wrapped_needs_no_account` | ✅ |
| AC-2.1.2 | a cloud build | "Sign in with Google" is pressed | the browser goes to Supabase's Google sign-in with a PKCE challenge; on return the code is exchanged and only the access/refresh tokens, user ID and email are kept | `auth_uses_pkce_and_keeps_only_tokens` | ✅ |
| AC-2.1.3 | a signed-in user | they choose monthly or annual | the `create-subscription` function, after checking their token, asks Razorpay for a subscription on the configured plan and returns its hosted `short_url` | `create_subscription_uses_configured_plan` | ✅ |
| AC-2.1.4 | a Razorpay webhook | it arrives | it is accepted only with a valid HMAC-SHA256 signature (constant-time compare); otherwise 401 and nothing changes | `webhook_rejects_bad_signature` | ✅ |
| AC-2.1.5 | the same event delivered twice, or an older event after a newer one | processed | the duplicate changes nothing; the older event doesn't overwrite the newer state | `webhook_is_idempotent`, `webhook_ignores_out_of_order_events` | ✅ |
| AC-2.1.6 | webhook events for activate, charge, cancel, halt | processed | the entitlement becomes `active` until `current_end`, or takes the cancelled/halted status | `entitlement_follows_subscription_events` | ✅ |
| AC-2.1.7 | a user without an active plan, or another user's rows | they call the database | RLS refuses writes (no new sync rows, no reminder opt-in) and hides other users' rows; a user can always read and delete their own encrypted rows (AC-2.10.2) | `rls_blocks_unentitled_user`, `rls_isolates_users` | ✅ |
| AC-2.1.8 | any billing code path | it logs | only the event ID and type; never the payload, card, UPI, bank or payment-method data | `billing_logs_have_no_payment_data` | ✅ |
| AC-2.1.9 | a key rotation | the runbook is followed | keys rotate without downtime (`docs/runbooks/rotate-keys.md`) | *manual drill* 👤 | ✅ runbook |

### US-2.2 My history is saved on my device

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.2.1 | the Journal | the user turns on "Save on this device" and imports files | they are stored in IndexedDB `fo-journal` on this device only | `history_saved_after_opt_in`, `e2e_journal_import_and_reload` | ✅ |
| AC-2.2.2 | Wrapped, or the Journal before opting in | anything is analysed | nothing is written to storage (PV-1) | `e2e_no_storage_writes` | ✅ |
| AC-2.2.3 | a database from an older schema version | the Journal opens | migrations run in order and keep the data; a failing migration leaves the old database untouched | `migrations_upgrade_every_old_version`, `failed_migration_keeps_old_data` | ✅ |
| AC-2.2.5 | the Journal screens | axe runs | no WCAG 2.1 AA violations | `a11y_journal_screens` | ✅ |
| AC-2.2.4 | saved data | "Delete everything" is confirmed | the database is deleted and a read-back finds nothing | `delete_everything_empties_database` | ✅ |

### US-2.3 Optional encrypted sync

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.3.1 | a passphrase of at least 12 characters | data syncs | each record is AES-256-GCM encrypted on the device (ADR-0002); record IDs are HMACs; the server receives no plaintext, contract name or trade ID | `sync_uploads_only_ciphertext` | ✅ |
| AC-2.3.2 | a second device with the same passphrase | it syncs | the records decrypt and match; with a wrong passphrase nothing is decrypted or uploaded | `sync_round_trip_matches`, `wrong_passphrase_is_refused` | ✅ |
| AC-2.3.3 | the sync setup and the "forgot passphrase" screen | shown | they say plainly that synced data can't be recovered without the passphrase | `e2e_key_loss_warning_shown_and_sync_sends_only_ciphertext` | ✅ |
| AC-2.3.4 | a ciphertext moved to another user's or record's slot | decrypted | decryption fails (bound by additional data) | `ciphertext_is_bound_to_its_slot` | ✅ |
| AC-2.3.5 | `docs/security.md` | read by a non-expert | it explains what the server can and can't see | *manual review* | ✅ |

### US-2.4 Add new files without starting over

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.4.1 | saved history and a new file that overlaps it | imported | new fills are added, duplicates (broker + exchange + trade ID) counted and dropped, a conflicting duplicate rejects the import with the trade ID | `incremental_import_merges_and_dedupes`, `incremental_import_rejects_conflicts` | ✅ |
| AC-2.4.2 | any import | it completes | the history entry records date, broker, counts and a label with the client ID removed | `import_history_strips_client_id` | ✅ |
| AC-2.4.3 | an import in the history | it is undone | exactly its fills are removed and results recompute | `undo_import_removes_only_its_fills` | ✅ |

### US-2.5 Check my own rules

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.5.1 | rules: max loss per day (₹), max trades per day, stop after N losses in a row, no trades in the first N minutes | saved | each is validated with Zod (whole numbers, sensible ranges) | `rules_are_validated` | ✅ |
| AC-2.5.2 | history and a max-loss rule | checked | each day whose running realised P&L reached −limit is flagged, with the trades entered after that moment | `max_loss_rule_flags_days_and_later_trades` | ✅ |
| AC-2.5.3 | max trades, stop-after-losses and first-minutes rules | checked | the trades beyond the limit / after the streak / inside the opening minutes are flagged | `trade_count_streak_and_opening_rules` | ✅ |
| AC-2.5.4 | a flagged day | the cost is shown | cost = the P&L of the flagged trades, labelled before charges, exact in paise | `rule_breach_cost_is_pnl_after_breach` | ✅ |
| AC-2.5.5 | each rule's message | shown | facts only (NA-1 to NA-3) | `rule_messages_pass_no_advice_check` | ✅ |
| AC-2.5.6 | trades without times (Angel One, Dhan) | time-based rules run | they say "can't check without trade times"; a max-loss or max-trades breach is flagged for the day with cost unknown, never guessed | `time_rules_need_trade_times` | ✅ |

### US-2.6 Behaviour insights

Each insight is a pure function over the period's round trips, reusing the card formulas (ARCHITECTURE §7), with a factual sentence in English and Hindi.

| ID | Insight | Test | Status |
|----|---------|------|--------|
| AC-2.6.1 | Revenge trades in the period | `insight_revenge` | ✅ |
| AC-2.6.2 | Overtrading: busiest days vs other days | `insight_overtrading` | ✅ |
| AC-2.6.3 | Expiry-day P&L vs other days | `insight_expiry_day` | ✅ |
| AC-2.6.4 | Best and worst time of day | `insight_time_of_day` | ✅ |
| AC-2.6.5 | Holding time of winners vs losers | `insight_holding_time` | ✅ |
| AC-2.6.6 | Charges as a share of gross profit | `insight_charges_drag` | ✅ |
| AC-2.6.7 | Every insight's text in both languages passes NA-1 to NA-4; an insight without enough data is omitted, never shown as 0 | `insights_pass_no_advice_check`, `insights_omit_thin_data` | ✅ |

### US-2.7 Weekly report

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.7.1 | saved history | the weekly report opens | it is computed on the device for the latest week with trades (Monday–Sunday, IST): net P&L (or P&L before charges when charges can't be estimated), trades, rule breaches and insights, with a share image carrying the disclaimer | `weekly_report_built_on_device`, `e2e_weekly_report` | ✅ |
| AC-2.7.2 | a user opted in to the reminder | the weekly job runs | the email says only that the report is ready, with a link and an unsubscribe link: **no numbers, symbols or trades** | `weekly_email_has_no_numbers` | ✅ |
| AC-2.7.3 | a reminder's unsubscribe link | opened | the preference turns off; the token works only for its user | `unsubscribe_stops_emails` | ✅ |

### US-2.8 Notes and tags

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.8.1 | a trade or a day | the user adds a note and tags | they are saved locally, and synced encrypted if sync is on | `notes_saved_locally`, `e2e_journal_notes_search` | ✅ |
| AC-2.8.2 | notes and tags | the user searches | matching notes are found on the device, case-insensitive, by text or tag | `notes_search_on_device` | ✅ |

### US-2.10 Manage, cancel and leave

*As a Subscriber, I want to stop paying, remove my synced data or delete my account myself, so that I stay in control (DPDP Act 2023: erasure on request).*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.10.1 | an active plan | the user cancels | Razorpay is asked to cancel **at the end of the paid period**; the plan stays active until then and the app says it won't renew | `cancel_subscription_at_period_end`, `e2e_journey_complete_user_flow` | ✅ |
| AC-2.10.2 | synced data, with or without an active plan | the user deletes the synced copy | every synced record and the key profile are removed from the server; data on the device stays | `rls_lets_owner_delete_without_plan`, `e2e_journey_complete_user_flow` | ✅ |
| AC-2.10.3 | a signed-in user | they delete their account | any live subscription is cancelled at once, then the account is deleted, which removes the plan, reminders and synced data with it; the device's local data stays and the app says how to delete it too | `delete_account_cancels_then_deletes`, `e2e_journey_complete_user_flow` | ✅ |
| AC-2.10.4 | reminders were turned on | the Account tab opens on any device | the checkbox shows the saved choice | `e2e_journey_complete_user_flow` | ✅ |
| AC-2.10.5 | a cloud build whose plan has ended | the Journal opens | the user's own local data can still be deleted from the locked screen | `e2e_journey_complete_user_flow` | ✅ |

How the journey runs: `tests/journey/stack.ts` starts Postgres (PGlite) with the shipped migration and Supabase's default privileges, the real PostgREST binary (v12.2.12, checksum-pinned by `scripts/get-postgrest.mjs`) with real JWTs, and the real Edge Function handlers; Playwright drives a cloud build of the app on two devices. Simulated: Google's consent screen (the PKCE check is real), Razorpay's checkout and API (webhooks are HMAC-signed for real), and the email provider. Known limit: PGlite ends a PostgREST session on any SQL error, so error responses come back as 503 instead of 401/403 there; error semantics are covered on Postgres directly in `tests/unit/supabaseRls.test.ts`.

### US-2.11 The whole journey works end to end

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.11.1 | the production code paths: the built app (cloud build), the migration on real Postgres, the real PostgREST server enforcing RLS, and the Edge Function handlers; with Google's consent screen, Razorpay's checkout and the email provider simulated | one user goes from Wrapped to Journal, signs in, pays, imports, sets rules, writes notes, reads the weekly report, turns on reminders, syncs to a second device, gets and uses the reminder's unsubscribe link, cancels, deletes the synced copy and deletes the account | every step shows the right result in the browser **and** in the database, and no step sends plaintext trade data off the device | `e2e_journey_complete_user_flow` | ✅ |

### US-2.9 Money math stays right (ADR-0005)

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-2.9.1 | each synthetic broker fixture | analysed | totals equal the reviewed golden file | `golden_totals_match` | ✅ |
| AC-2.9.2 | random seeded fill sequences | analysed | FIFO, merge and per-day charge invariants hold | `property_flat_books_balance`, `property_partial_books_balance`, `property_merge_order_independent`, `property_charges_split_by_day` | ✅ |

## 5. Phase 3: the Trade Journal across segments (from 2026-10-21)

Owner decisions (2026-10-21): the paid product is renamed **Trade Journal** and grows segment by segment, **equity first**. **F&O Wrapped** keeps its name and stays F&O only. Mutual funds come in as a **portfolio from the CAS statement**, not as trades. Currency (CDS) and commodity (MCX) wait for redacted real samples from the owner: no parser is written for a layout we haven't seen (RL-2).

Rules RL-1, RL-2, PV-1 to PV-4 and NA-1 to NA-5 apply to every story here. In addition:

- A share of a stock is held per **ISIN**, so NSE and BSE buys and sells of the same stock share one holding.
- Nothing in this phase uses a live or closing price. Holdings are shown at **cost**, never at a market value we would have to fetch or guess.
- Code: `src/engine/equity/` (pure); the Journal stores equity trades next to F&O fills in the same import record, so undo, sync and delete work the same way.

### US-3.1 Equity trades from Zerodha

*As a Trader who also trades stocks, I want my Zerodha equity tradebook in the same Journal, so that I see what my intraday and delivery trades actually made.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-3.1.1 | a Zerodha Console equity tradebook (segment `EQ`, no `expiry_date` column), CSV or XLSX | it is added to the Trade Journal | every row is validated (ISIN in the 12-character Indian format, positive whole quantity, price in whole paise, digit-only IDs, IST times); one bad row rejects the file and names the row | `equity_tradebook_parses`, `equity_tradebook_rejects_bad_rows` | ✅ |
| AC-3.1.2 | F&O Wrapped | an equity tradebook is uploaded | it is still refused with "is an Equity tradebook. F&O Wrapped needs the F&O segment" (Wrapped doesn't change) | `rejects_equity_tradebook`, `wrapped_still_refuses_equity` | ✅ |
| AC-3.1.3 | buys and sells of one stock (ISIN) on one day | analysed | the quantity both bought and sold that day, `min(bought, sold)`, is **intraday**; the earliest units of each side that day (by time, then trade ID) are the ones matched; the rest is **delivery**. Intraday P&L = sell value − buy value of the matched units | `equity_splits_intraday_and_delivery`, `equity_intraday_short_first` | ✅ |
| AC-3.1.4 | delivery buys and sells across days | analysed | sales use the oldest bought units first (FIFO per ISIN), and each sale's P&L counts **on the day of the sale**, with the dates of the buys it used | `equity_delivery_fifo_realises_on_sale_date` | ✅ |
| AC-3.1.5 | a delivery sale of more shares than the file shows bought (shares bought before the file starts, or from a bonus, split, IPO allotment or transfer) | analysed | the unmatched quantity is **left out** of P&L and listed with stock, date and quantity, with the reason in words; it is never treated as bought at zero or at any other price | `equity_unmatched_sales_are_shown_not_guessed` | ✅ |
| AC-3.1.6 | delivery shares not sold by the end of the file | shown | each holding shows quantity and average buy price (cost) only: no market value and no unrealised P&L. A note says that splits, bonuses and other corporate actions aren't in the tradebook, so quantities can differ from the demat account | `equity_holdings_at_cost` | ✅ |
| AC-3.1.7 | equity trades on dates with a rate window | charges are estimated | Zerodha equity rates apply (§5 rates below), each charge summed per day and rounded once; trades on a date with no window, or BSE trades outside groups A and B, make charges **unavailable** with the reason instead of borrowing a rate | `equity_charges_follow_dated_rates`, `equity_charges_unavailable_outside_windows` | ✅ |
| AC-3.1.8 | intraday units | brokerage is estimated | it is estimated as for intraday (MIS) orders, ₹20 or 0.03% per executed order, whichever is lower. Because the tradebook doesn't show the product, the app says that delivery (CNC) orders sold the same day pay no brokerage, and states the most this can overstate charges by | `equity_intraday_brokerage_gap_is_stated` | ✅ |
| AC-3.1.9 | delivery sales | charges are shown | DP charges are **not** included (the tradebook doesn't show them); the app says so and counts the stock-days they apply to, without an amount | `equity_dp_charges_shown_as_gap` | ✅ |
| AC-3.1.10 | an equity file that overlaps saved history | imported | new trades are added, identical duplicates (broker + exchange + segment + trade ID) are counted and dropped, a conflicting duplicate rejects the import; undo removes exactly that import's equity trades | `equity_import_dedupes`, `equity_import_rejects_conflicts`, `equity_saved_with_its_import_and_old_imports_still_load`, `e2e_journal_equity` | ✅ |
| AC-3.1.11 | saved equity trades | the Equity tab opens | it shows intraday P&L, delivery P&L, estimated charges (or why not), the sales list, holdings at cost, and every gap above in words, in English and Hindi | `e2e_journal_equity`, `a11y_journal_screens` | ✅ |
| AC-3.1.12 | the synthetic equity fixture | analysed | totals equal the reviewed golden file, exact in paise | `equity_golden_totals_match` | ✅ |
| AC-3.1.13 | every equity sentence, English and Hindi | checked | passes NA-1 to NA-4 | `copy_passes_no_advice_wordlist`, `equity_copy_passes_no_advice_check` | ✅ |
| AC-3.1.14 | real Zerodha equity tradebooks for at least 3 accounts | compared with Console's tax P&L (intraday and short-term rows) | realised P&L matches to the paise, or each difference is explained; the rates are re-checked at zerodha.com/charges and marked `primary` | *owner check* | 👤 |
| AC-3.1.15 | equity trades | rules, insights and the weekly report run | they cover equity too. Until then, those tabs say they cover F&O only | `e2e_journal_equity` (the note) | ⏳ |
| AC-3.1.16 | equity files from Angel One, Upstox, Dhan | added | supported once a redacted real export of each has been seen; until then their equity rows stay skipped, as today | *needs samples* | 👤 |

**Equity rates** (`EQUITY_RATES` in `src/engine/charges/rates.ts`, all from 2024-10-01, `checked: secondary` until AC-3.1.14):

| Charge | Intraday | Delivery |
|--------|----------|----------|
| Brokerage (Zerodha) | ₹20 or 0.03% per executed order, lower of the two | ₹0 |
| STT | 0.025% on sells | 0.1% on buys and sells |
| Exchange transaction | NSE 0.00297%; BSE 0.00375% (groups A and B only) | same |
| SEBI fee | ₹10 per crore | same |
| Stamp duty | 0.003% on buys | 0.015% on buys |
| GST | 18% on brokerage + exchange + SEBI | same |
| DP charge | none | not estimated (AC-3.1.9) |

Sources disagree on NSE's equity transaction rate (0.00297% is the most cited; 0.00307% and 0.00322% also appear), which is why the owner check in AC-3.1.14 matters before launch.

### US-3.2 Currency derivatives (CDS)

*As a Trader, I want my currency futures and options in the Trade Journal.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-3.2.1 | a currency or commodity tradebook today | added to the Journal or to Wrapped | it is refused, naming its segment, and nothing from it is read | `rejects_currency_and_commodity_tradebooks` | ✅ |
| AC-3.2.2 | a redacted real CDS tradebook from the owner | it arrives | contract symbols, lot sizes and charges (STT doesn't apply to currency; exchange, SEBI, stamp and brokerage do) are specified from it and its Console P&L, then built with tests | *needs a sample* | 👤 |

### US-3.3 Commodity (MCX)

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-3.3.1 | a redacted real MCX tradebook from the owner | it arrives | contract symbols, multipliers (price is quoted per unit but traded per lot), CTT on non-agri contracts and charges are specified from it and its Console P&L, then built with tests | *needs a sample* | 👤 |

### US-3.4 Mutual funds from the CAS

*As an investor, I want my mutual fund holdings from my Consolidated Account Statement, so that the Journal shows them next to my trades.*

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-3.4.1 | a redacted real CAS (CAMS/KFintech or NSDL/CDSL) from the owner | it arrives | the format, password handling (the PDF is opened on the device only) and the fields kept (scheme, folio masked, units, cost, transactions) are specified in an ADR first | *needs a sample* | 👤 🧭 |
| AC-3.4.2 | a CAS | read | holdings are shown at cost and by the NAV printed in the statement, with its date; nothing is fetched | *after AC-3.4.1* | ⏳ |

### US-3.5 The paid product is called Trade Journal

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-3.5.1 | the Journal screens, in English and Hindi | shown | the product is called "Trade Journal" ("ट्रेड जर्नल"); Wrapped is still "F&O Wrapped" everywhere | `e2e_journal_named_trade_journal` | ✅ |

## 6. Traceability

Each criterion above lists its test. The checks that keep this true:

- A PR that adds a criterion adds its test, or marks it ⏳, 👤 or 🧭 with the reason.
- A PR that makes a test pass changes its status here to ✅.
- `TEST_PLAN.md` lists every Phase 0 and Phase 1 test name; ACCEPTANCE_CRITERIA §A points here for the launch gate.

## 7. Out of scope (from BRIEF Phase 3)

Direct broker APIs, a mobile app, a public streaks page, and team or coach sharing.

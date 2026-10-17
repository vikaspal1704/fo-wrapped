# Specification: F&O Wrapped and F&O Journal

**Owner:** Vikas Pal · **Status:** v1 draft, 2026-10-17 · **Brief:** [`BRIEF.md`](BRIEF.md)

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
| PV-2 | Journal data leaves the device only through opt-in sync, encrypted on the device first. The server holds ciphertext, the account, and the subscription. | 🧭 ADR-0002 |
| PV-3 | File names contain the Zerodha client ID. They are never shown in share images, synced, stored in an import history, or logged. | `share_image_has_no_file_names` (⏳), `import_history_strips_client_id` (⏳) |
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

Automated: `copy_passes_no_advice_wordlist` scans the English and Hindi catalogues for banned phrases (⏳ Phase 1). Each Journal insight also has its own wording test (§4).

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
| AC-1.1.2 | a push to a PR | CI runs | Lighthouse (mobile) runs on the built site: Accessibility = 100, Best Practices ≥ 95, Performance ≥ 90, installable. Below threshold fails CI | `ci: lighthouse` job | ⏳ |
| AC-1.1.3 | every screen and card | axe runs | no WCAG 2.1 AA violations | `a11y_landing_privacy_and_every_card` | ✅ |

### US-1.2 Share cards I'm happy to post

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.2.1 | any card or the summary | I download its image | a 1080×1920 PNG | `e2e_download_image`, `e2e_share_single_card` | ✅ |
| AC-1.2.2 | the app in English or Hindi | an image is made | it contains the disclaimer (NA-5) in that language | `share_image_has_disclaimer_in_its_language` | ⏳ |
| AC-1.2.3 | files named `tradebook-AB1234-FO.csv` | an image is made | the image has no file name, client ID or symbol list | `share_image_has_no_file_names` | ⏳ |
| AC-1.2.4 | a phone that supports file sharing | I tap Share | the system share sheet opens with the image; otherwise it downloads | `e2e_share_single_card`, *manual* on Android Chrome and iOS Safari | ✅ / 👤 |
| AC-1.2.5 | the site link pasted in WhatsApp or X | a preview is shown | it uses the Open Graph image and title | `e2e_manifest_is_installable` (meta), *manual* | ✅ |

### US-1.3 A wrong file tells me what to do

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.3.1 | an equity tradebook, a PDF or an unrelated CSV | I drop it | a plain message says what the file is (if known) and what to download instead | `e2e_rejects_wrong_file_with_message` | ✅ |
| AC-1.3.2 | that error message | it is shown | it has a link to the "how to export from your broker" guide for the detected broker, or to the guide list | `e2e_error_links_to_export_guide` | ⏳ |

### US-1.4 I can check the privacy claim myself

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.4.1 | the privacy page | I read it | it explains how to verify in DevTools (Network tab stays empty while analysing) | `e2e_privacy_page` | ✅ |
| AC-1.4.2 | a file containing a unique marker string | it is analysed and every card and image is opened | no request is made after load except same-origin GETs for static files, and **no request URL or body contains the marker** | `e2e_no_request_carries_file_data` | ⏳ |
| AC-1.4.3 | the built `dist/` | it is scanned | no analytics or tracker code and no third-party origins (owner decision: no analytics) | `build_has_no_third_party_origins` | ⏳ |

### US-1.5 Launch assets

| ID | Given | When | Then | Test | Status |
|----|-------|------|------|------|--------|
| AC-1.5.1 | `docs/launch/` | before 8 Nov | it has an X thread, a LinkedIn post, an r/IndiaInvestments post and a demo GIF script, each passing the no-advice checklist (§1.2) and claiming nothing the app doesn't do | *manual review* | ⏳ |

---

## 4. Phase 2: the paid Journal (Nov – Dec 2026)

🧭 **Blocked on:** the ADRs in [`BRIEF.md`](BRIEF.md) §6 (Session D) and the owner's answers in BRIEF §9. The criteria below say *what* must be true; the ADRs decide *how*. Test names are fixed now so the work can be traced.

Journal principles (ROADMAP §2.1): local-first; sync opt-in and end-to-end encrypted; an account only for billing and sync; no advice; Wrapped stays free and signed-out.

### US-2.1 Sign in and subscribe

*As a Trader, I want to sign in with Google and subscribe in rupees, so that I can use the Journal.*

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.1.1 | a signed-out visitor | they use Wrapped | everything in Wrapped works with no sign-in prompt before results (ROADMAP P4) | `e2e_wrapped_needs_no_account` |
| AC-2.1.2 | a visitor | they choose "Sign in with Google" | a Supabase session is created; only email and a user ID are stored | `auth_stores_only_email_and_id` |
| AC-2.1.3 | a signed-in user | they pay monthly or annually through Razorpay | the entitlement becomes active **only** from a verified Razorpay webhook (signature checked), never from the browser | `webhook_rejects_bad_signature`, `entitlement_set_only_by_webhook` |
| AC-2.1.4 | the same webhook delivered twice | it is processed | the second delivery changes nothing (idempotent on the event ID) | `webhook_is_idempotent` |
| AC-2.1.5 | a user without an active plan | they call a paid API | the server refuses (RLS or entitlement check), whatever the client sends | `rls_blocks_unentitled_user` |
| AC-2.1.6 | any billing code path | it logs | no card, UPI, bank or payment-method data is logged | `billing_logs_have_no_payment_data` |
| AC-2.1.7 | a key rotation | the runbook is followed | Razorpay and Supabase keys rotate with no downtime (`docs/runbooks/rotate-keys.md`) | *manual drill* |

### US-2.2 My history is saved on my device

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.2.1 | a subscriber | they turn on "Save on this device" | fills and imports are stored in IndexedDB on this device only | `history_saved_after_opt_in` |
| AC-2.2.2 | no opt-in (including all of Wrapped) | anything is analysed | nothing is written to storage (PV-1) | `e2e_no_storage_writes` |
| AC-2.2.3 | stored data from an older schema version | the app opens | migrations run in order and no data is lost; a failed migration leaves the old data untouched | `migrations_upgrade_every_old_version`, `failed_migration_keeps_old_data` |
| AC-2.2.4 | saved data | the user presses "Delete everything" | all local Journal data is gone, confirmed by reading the database back | `delete_everything_empties_database` |

### US-2.3 Optional encrypted sync

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.3.1 | a subscriber who sets a sync passphrase | data syncs | it is encrypted on the device with a key derived from the passphrase (scheme per ADR-0002); the server receives ciphertext only | `sync_uploads_only_ciphertext` |
| AC-2.3.2 | a second device and the right passphrase | it syncs | the data decrypts and matches | `sync_round_trip_matches` |
| AC-2.3.3 | a forgotten passphrase | the user asks for help | the app says plainly that synced data can't be recovered, before sync is turned on and again here | `e2e_key_loss_warning_shown` |
| AC-2.3.4 | user A's session | it requests user B's rows | RLS returns nothing | `rls_isolates_users` |
| AC-2.3.5 | `docs/security.md` | read by a non-expert | it explains the threat model in plain language: what the server can and can't see | *manual review* |

### US-2.4 Add new files without starting over

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.4.1 | saved history and a new tradebook that overlaps it | imported | new fills are added, duplicates dropped (exchange + trade ID), conflicts rejected with the file and row | `incremental_import_merges_and_dedupes` |
| AC-2.4.2 | any import | it completes | an audit entry records date, broker, counts (added, duplicate, rejected) and a file label **without the client ID** | `import_history_strips_client_id` |
| AC-2.4.3 | an import in the history | the user undoes it | exactly its fills are removed and all results recompute | `undo_import_removes_only_its_fills` |

### US-2.5 Check my own rules

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.5.1 | the user's rules (max loss per day, max trades per day, stop after N losses in a row, no trades in the first N minutes) | saved | each is validated (positive numbers, sensible ranges) with Zod | `rules_are_validated` |
| AC-2.5.2 | history and a max-loss-per-day rule | the days are checked | every day whose realised loss passed the limit is flagged, with the trades taken **after** the limit was passed | `max_loss_rule_flags_days_and_later_trades` |
| AC-2.5.3 | a flagged day | the cost is shown | the cost of breaking the rule = the P&L of the trades after the breach, labelled before charges | `rule_breach_cost_is_pnl_after_breach` |
| AC-2.5.4 | each rule type | its message is shown | it states facts only, passing NA-1 to NA-3 | `rule_messages_pass_no_advice_check` |
| AC-2.5.5 | a file without trade times (Angel One, Dhan) | time-based rules are checked | they are marked "can't check without trade times", never guessed | `time_rules_need_trade_times` |

### US-2.6 Behaviour insights

Each insight is a pure engine function with a documented formula, a unit test, and a wording test.

| ID | Insight | Test |
|----|---------|------|
| AC-2.6.1 | Revenge trades (ARCHITECTURE §7, card 6) over saved history, by week | `insight_revenge_weekly` |
| AC-2.6.2 | Overtrading: P&L on the busiest days vs other days | `insight_overtrading` |
| AC-2.6.3 | Expiry-day P&L vs other days | `insight_expiry_day` |
| AC-2.6.4 | Time-of-day P&L (15-minute buckets) | `insight_time_of_day` |
| AC-2.6.5 | Holding time vs outcome | `insight_holding_time` |
| AC-2.6.6 | Charges drag: charges as a share of gross profit | `insight_charges_drag` |
| AC-2.6.7 | Every insight's English and Hindi text passes NA-1 to NA-4 | `insights_pass_no_advice_check` |

### US-2.7 Weekly report

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.7.1 | a week of saved history | the user opens the weekly report | it is computed **on the device**: net P&L, trades, rule breaches and insights for the week, plus a share image with the disclaimer | `weekly_report_built_on_device` |
| AC-2.7.2 | a user who opted in to the email reminder | the week ends | the email says only that the report is ready, with a link. **It holds no numbers, symbols or trades** | `weekly_email_has_no_numbers` |
| AC-2.7.3 | any reminder email | the user unsubscribes | no more emails; the preference is stored server-side | `unsubscribe_stops_emails` |

### US-2.8 Notes and tags

| ID | Given | When | Then | Test |
|----|-------|------|------|------|
| AC-2.8.1 | a trade or a day | the user adds a note or tags | they are saved locally (and synced encrypted if sync is on) | `notes_saved_and_synced_encrypted` |
| AC-2.8.2 | notes and tags | the user searches | matching trades and days are found, on the device | `notes_search_on_device` |

---

## 5. Traceability

Each criterion above lists its test. The checks that keep this true:

- A PR that adds a criterion adds its test, or marks it ⏳, 👤 or 🧭 with the reason.
- A PR that makes a test pass changes its status here to ✅.
- `TEST_PLAN.md` lists every Phase 0 and Phase 1 test name; ACCEPTANCE_CRITERIA §A points here for the launch gate.

## 6. Out of scope (from BRIEF Phase 3)

Direct broker APIs, a mobile app, a public streaks page, and team or coach sharing.

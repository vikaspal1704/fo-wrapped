# Acceptance Criteria

Binary checklist. v1 is **done** only when every box is true. v1 may **launch** only when section A’s launch gate also passes.

---

## Status (v0.3)

- **B–F:** implemented and passing (146 unit, 23 e2e including axe accessibility).
- **E:** CI and Pages are live. Make `main` the default branch so pushes to `main` deploy.
- **A:** the harness is built (`npm run verify:real`). The run needs the owner’s real accounts and P&L statements, and the rates need primary-source checks.

## A. Launch gate (blocking)

- [ ] On **≥ 5 real Zerodha accounts**, estimated net P&L (tradebook only, no P&L statement) is within **±0.5%** of the Console P&L statement’s net P&L (`npm run verify:real`, TEST_PLAN §4)
- [ ] Results recorded in the launch PR as account alias + % difference only (no amounts, no symbols)
- [ ] Tradebook headers verified against 3–4 real exports and recorded in `API_CONTRACT.md` §2 (1 of 4 done: CSV, Sep 2026; XLSX and an older year still needed)
- [x] P&L statement layout verified and recorded in `API_CONTRACT.md` §3 (redacted real export; [`BROKERS.md`](BROKERS.md) §2.4)
- [ ] Each other broker’s parser (Angel One, Upstox, Dhan) checked against at least one user’s own export before its “beta” label is dropped
- [ ] Every row of the charges rate table has `source` and `verifiedOn` filled (ARCHITECTURE §6.2)
- [ ] Samvat boundaries verified (ARCHITECTURE §7.1)
- [ ] PRD §10 decisions confirmed by the owner (or changed, and the docs updated)

---

## B. PRD MUST → verifiable criteria

| PRD ID | Criterion | How to verify |
|--------|-----------|---------------|
| F-IN-1 | F&O tradebook CSV + XLSX accepted | `parses_zerodha_csv_tradebook`, `parses_xlsx_with_preamble` |
| F-IN-2 | Multi-file merge, dedupe by trade_id, conflicts rejected | `dedupes_overlapping_files_by_trade_id`, `rejects_conflicting_duplicate`, `merge_is_file_order_independent` |
| F-IN-3 | P&L statement totals are the source of truth | `statement_totals_override_calculator`, `rejects_statement_with_non_overlapping_period`, `statement_never_split_across_periods` |
| F-IN-7 | Other brokers, only in recorded layouts; broker charges used when present | TEST_PLAN “Brokers” tests, `e2e_file_without_times_hides_time_cards`, `e2e_groww_file_is_explained` |
| F-IN-4 | Zod on every row; human-readable rejection; never guess | `rejects_unrecognized_file`, `rejects_invalid_row_with_location`, `rejects_unknown_symbol_shape`, `rejects_monthly_symbol_without_expiry_source` |
| F-IN-5 | Unsupported segments rejected | `rejects_equity_tradebook`, `e2e_rejects_wrong_file_with_message` |
| F-IN-6 | No upload / storage | `e2e_no_network_during_analysis`, `e2e_no_storage_writes` |
| F-EN-1 | FIFO round trips with partials, scale-in/out, flips | `test_worked_example_canonical`, all `fifo_*` tests |
| F-EN-2 | Settled-at-expiry flagged; valued from statement or excluded with notice | `flags_option_past_expiry_as_settled`, `values_settled_position_from_pnl_statement`, `settled_position_without_symbol_row_stays_excluded`, `excluded_positions_are_reported` |
| F-EN-3 | Versioned, dated charges; “estimated” label | all charges tests, `charges_marked_estimated_without_statement` |
| F-EN-4 | Integer paise | `parses_price_to_paise_exactly`; lint rule forbidding `parseFloat` in `src/engine` |
| F-EN-5 | IST regardless of device TZ | `parses_times_as_ist_regardless_of_tz` |
| F-EN-6 | Deterministic | `engine_is_deterministic`, `as_of_is_last_trade_date_not_today` |
| Cards 1–8 | Formulas + thresholds per ARCHITECTURE §7 | all `card*_` tests |
| Summary | 3 headlines, Samvat, URL, no percentiles | `summary_has_three_headlines_and_no_percentiles`, `samvat_label_spans_years` |
| F-SH-1/2/3 | Download + Web Share with fallback; nothing sensitive in the image | `e2e_download_image`, manual check on Android Chrome + iOS Safari |
| F-CL-1 | Clear data wipes everything | `e2e_clear_data_resets` |

---

## C. Required tests

Every test name in [`TEST_PLAN.md`](TEST_PLAN.md) §2 and §3 MUST exist with that exact name and pass. No `.skip` / `.only` / `.todo` on required tests.

---

## D. Non-functional

- [ ] NF-2: CSP meta tag present with `connect-src 'self'`; no third-party origins in the built `dist/`
- [ ] NF-3: all screens usable at 360 px width
- [ ] NF-4: 20,000-fill synthetic fixture analysed in < 3 s (Vitest perf smoke on CI hardware ≤ 1.5 s as a proxy)
- [ ] NF-5: keyboard navigation through cards; best/worst heatmap slots labelled in text
- [ ] NF-6: no analytics or tracker code in the bundle

---

## E. Build, CI & hosting

- [ ] `npm ci && npm run lint && npm run typecheck && npm test && npm run build` green locally
- [ ] `.github/workflows/ci.yml` runs lint, typecheck, unit, e2e, build on push/PR
- [ ] `.github/workflows/pages.yml` deploys to `https://vikaspal1704.github.io/fo-wrapped/`
- [ ] CI green on `main`

---

## F. Docs / README

- [ ] README status updated from “docs-first” to implemented when code lands, with a live link
- [ ] `LICENSE` is MIT © 2026 Vikas Pal
- [ ] `AGENTS.md` points to `docs/AGENT_BRIEF.md`
- [ ] Any deviation from these docs is reflected in the docs in the same PR

---

## G. Definition of done (copy for agents)

```
DONE when:
1. Section B criteria pass via section C tests.
2. Section D non-functional checks pass.
3. Section E CI green and Pages deployed.
4. Section F docs match the implementation.
5. No public engine API divergence from API_CONTRACT.md.

LAUNCH only when DONE and section A (launch gate) passes.
```

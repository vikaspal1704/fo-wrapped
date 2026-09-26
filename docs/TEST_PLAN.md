# Test Plan

**Frameworks:** Vitest (unit), Playwright (e2e)  
**Location:** `tests/unit/`, `tests/e2e/`, fixtures in `tests/fixtures/`  
**Rules:** Arrange-Act-Assert; one behaviour per test; use the exact test names required by ACCEPTANCE_CRITERIA (`it('<name>', …)`).

**Fixtures are synthetic.** Never commit a real tradebook or P&L statement, even an anonymised one. Real-data checks go through the local harness only (TRD §9).

---

## 1. Matrix overview

| Area | Must cover |
|------|------------|
| Parsing | CSV, XLSX with preamble, header detection, Zod rejections, unsupported segment, unrecognised file |
| Symbols | weekly option, monthly option, future, unknown shape, missing monthly expiry |
| Merge | overlapping files, identical duplicates, conflicting duplicates, file-order independence |
| FIFO | scale-in, scale-out, partial fills, flip, short-first, multiple instruments interleaved |
| Unclosed | open, settled at expiry, valued from P&L statement, excluded without it |
| Charges | each component, per-order brokerage, rate windows, missing window, GST base |
| Totals | statement vs estimated source, period mismatch |
| Cards | each formula, each threshold, D-7 copy switch, ties |
| Time | IST parsing independent of device TZ, bucket boundaries |
| Privacy | no network during analysis, no storage writes, clear data |
| UI | upload → cards → share/download; errors shown in plain language |

---

## 2. Required unit tests

### Parsing & validation

| Test | Setup | Expect |
|------|-------|--------|
| `parses_zerodha_csv_tradebook` | Synthetic CSV with expected headers | `Fill[]` with correct paise, IST epoch, side |
| `parses_xlsx_with_preamble` | XLSX with 10 preamble rows before headers | Same fills as the CSV equivalent |
| `rejects_unrecognized_file` | CSV of random columns | `UnrecognizedFileError` |
| `rejects_equity_tradebook` | Valid headers, equity segment | `UnsupportedSegmentError` |
| `rejects_invalid_row_with_location` | Row 7 has `quantity = -5` | `RowValidationError` with file, row 7, field `quantity` |
| `parses_six_decimal_quantity_and_price` | `quantity = "20.000000"`, `price = "152.350000"` | `qty = 20`, `pricePaise = 15235` |
| `rejects_price_not_in_whole_paise` | `price = "10.123000"` | `RowValidationError` on `price` |
| `rejects_fractional_quantity` | `quantity = "20.500000"` | `RowValidationError` on `quantity` |
| `keeps_19_digit_order_id_exact` | `order_id = "1799000000000000123"` | `Fill.orderId` equals the input string exactly |
| `ignores_trailing_blank_line` | File ends with an empty line | No error; row count excludes it |
| `rejects_blank_line_between_rows` | Empty line between two data rows | `RowValidationError` on that line |
| `parses_file_with_byte_order_mark` | UTF-8 BOM before the header | Parses normally |
| `parses_price_to_paise_exactly` | `price = "0.05"`, `"123.45"`, `"19999.95"` | `5`, `12345`, `1999995` (no float drift) |
| `parses_times_as_ist_regardless_of_tz` | Run with `TZ=America/New_York` | Same epoch as with `TZ=Asia/Kolkata` |

### Symbols

| Test | Setup | Expect |
|------|-------|--------|
| `parses_weekly_option_symbol` | `NIFTY24N2124000CE` | underlying NIFTY, CE, strike 24000, expiry 2024-11-21 |
| `parses_bse_sensex_weekly_symbol` | `SENSEX2691074900CE`, exchange BSE, `expiry_date = 2026-09-10` | underlying SENSEX, CE, strike 74900, expiry 2026-09-10, key `BSE:SENSEX2691074900CE` |
| `rejects_symbol_expiry_mismatch` | Weekly symbol encoding 2026-09-10 with `expiry_date = 2026-09-17` | `UnknownInstrumentError` |
| `parses_synthetic_console_fixture` | `tests/fixtures/zerodha-fo-tradebook.synthetic.csv` | 9 fills, 4 round trips, values as in the fixture README |
| `parses_monthly_option_symbol_with_expiry_column` | `BANKNIFTY24NOV51000PE` + `expiry_date` | PE, strike 51000, expiry from column |
| `parses_future_symbol` | `NIFTY24NOVFUT` + `expiry_date` | FUT, strike null |
| `rejects_monthly_symbol_without_expiry_source` | Row with an empty `expiry_date` | `RowValidationError` (the column is required, API_CONTRACT §2) |
| `parses_underlying_containing_digits` | `NIFTYNXT5026O0668000CE`, expiry 2026-10-06 | underlying `NIFTYNXT50`, strike 68000 |
| `rejects_unknown_symbol_shape` | `FOO123` | `UnknownInstrumentError` |

### Merge

| Test | Setup | Expect |
|------|-------|--------|
| `dedupes_overlapping_files_by_trade_id` | File A (Jan–Dec), file B (Jun–May), 100 shared trades | Shared trades counted once; `duplicatesDropped = 100` |
| `same_trade_id_on_different_exchanges_is_not_a_duplicate` | NSE and BSE fills sharing a `trade_id` value | Both kept (dedupe key is `exchange + trade_id`, PRD D-14) |
| `rejects_conflicting_duplicate` | Same `trade_id`, different price | `ConflictingDuplicateError` |
| `merge_is_file_order_independent` | `[A, B]` vs `[B, A]` | Identical `AnalysisResult` apart from diagnostics |

### Round-trip builder

| Test | Setup | Expect |
|------|-------|--------|
| `test_worked_example_canonical` | ARCHITECTURE §4.3 fills | Exactly the two round trips in that table (P&L, qty, avg prices, holding) |
| `fifo_scale_in_single_exit` | BUY 50@100, BUY 50@120, SELL 100@130 | 1 RT, gross ₹2,000, avg entry ₹110 |
| `fifo_scale_out_multiple_exits` | BUY 100@100, SELL 40@110, SELL 60@90 | 1 RT, gross ₹-200, exit at 2nd sell |
| `fifo_partial_fills_same_order` | One order filled as 3 trade_ids | Same RT as a single fill of the total qty |
| `fifo_short_first` | SELL 75@200, BUY 75@150 | SHORT RT, gross ₹3,750 |
| `fifo_flip_long_to_short` | BUY 100@50, SELL 150@60, BUY 50@55 | RT1 LONG +₹1,000; RT2 SHORT +₹250 |
| `fifo_instruments_are_independent` | Interleaved fills on 2 symbols | Per-symbol RTs match separate runs |
| `fifo_same_symbol_different_exchange_is_different_instrument` | Same symbol on NSE and BSE | Two instruments |
| `holding_time_is_qty_weighted_fifo` | Canonical example RT1 | 1,250,000 ms |

### Unclosed positions

| Test | Setup | Expect |
|------|-------|--------|
| `flags_option_past_expiry_as_settled` | BUY CE, expiry before last trade date, no sell | `SETTLED_AT_EXPIRY`; excluded from RT |
| `flags_future_expiry_position_as_open` | Expiry after last trade date | `OPEN`; excluded |
| `position_still_open_on_its_expiry_day_is_settled` | Expiry == last trade date, no closing fill | `SETTLED_AT_EXPIRY` |
| `excluded_positions_are_reported` | 2 unclosed | `totals.excludedUnclosedCount = 2`; card 1 note present |
| `values_settled_position_from_pnl_statement` | Settled CE + statement per-symbol row | RT with `exitKind: 'EXPIRY'`, gross = statement − closed part |
| `settled_position_without_symbol_row_stays_excluded` | Statement with no row for the symbol | Excluded; warning present |
| `as_of_is_last_trade_date_not_today` | Fake system clock far in the future | Same classification |

### Charges

| Test | Setup | Expect |
|------|-------|--------|
| `brokerage_options_per_executed_order` | Canonical example | 5 orders × ₹20 |
| `brokerage_futures_capped` | Small and large futures orders | `min(₹20, 0.03% × value)` each |
| `brokerage_order_split_across_days_charged_per_day` | Same `order_id` on 2 dates | 2 × brokerage |
| `stt_on_sell_side_only` | Buy + sell | STT only on the sell |
| `stamp_duty_on_buy_side_only` | Buy + sell | Stamp only on the buy |
| `gst_base_is_brokerage_exchange_sebi` | Any | GST = 18% × (brokerage + txn + SEBI) |
| `hand_worked_option_round_trip` | Buy 65 @ ₹100, sell 65 @ ₹120 on 2026-09-22 | Exactly ₹40.00 / 11.70 / 5.01 / 0.01 / 0.20 / 8.10 = ₹65.02 |
| `uses_index_rate_for_bse_index_options` | SENSEX option buy | 0.0325% transaction charge |
| `uses_rate_window_for_trade_date` | Fills either side of a rate change | Each charged at its own window’s rate |
| `missing_rate_window_throws` | Fill before earliest window | `ChargesUnavailableError` |
| `charges_marked_estimated_without_statement` | No statement | `totals.source = 'ESTIMATED'`; card notes say *estimated* |
| `statement_totals_override_calculator` | With statement | `totals` equal statement values; `source = 'PNL_STATEMENT'` |
| `analyzes_synthetic_fixture_end_to_end` | `analyze()` on the synthetic fixture | Totals, Samvat 2082, date range, expected card statuses |
| `charges_unavailable_keeps_other_cards` | Trades before the first rate window | `charges = null`, cards 1–2 insufficient, warning present, gross still computed |
| `rejects_statement_with_non_overlapping_period` | Statement 2022, tradebook 2024 | Rejected; the message shows both ranges |

### Cards

| Test | Setup | Expect |
|------|-------|--------|
| `card1_net_pnl_trades_traded_value` | Known fixture | Exact values |
| `cards_1_2_insufficient_when_charges_unavailable` | Totals without charges | Cards 1–2 `INSUFFICIENT_DATA`; summary starts with *P&L before charges* |
| `card2_pct_of_gross_profit` | gross ₹10,000, charges ₹2,500 | 25 |
| `card2_gross_loss_copy` | gross ≤ 0 | `pct = null`; loss copy variant |
| `card3_win_rate_excludes_scratches` | 6 wins, 3 losses, 1 scratch | winRate = 6/9 |
| `card3_insufficient_below_10_trades` | 9 RT | `INSUFFICIENT_DATA` |
| `card4_splits_by_exit_on_expiry_date` | Mixed | Correct groups |
| `card5_bucket_boundaries` | Entries at 09:15:00, 09:29:59, 09:30:00, 15:29:59 | Buckets 0, 0, 1, 24 |
| `card5_best_worst_require_5_trades` | Top bucket has 4 RT | It is not chosen as best |
| `card6_revenge_trade_detection` | Loss > median at 11:00, entries at 11:00:00, 11:10, 11:15:00, 11:16 | Revenge = 11:10 and 11:15:00 only |
| `card6_small_losses_do_not_trigger` | Loss ≤ median followed by quick entry | count 0 |
| `card6_trade_counted_once_for_overlapping_windows` | Two triggers 5 min apart, one entry after both | count 1 |
| `card7_median_holding_even_count` | Holding values [1,2,3,4] ms | 3 (2.5 rounded half up) |
| `card8_best_worst_day_ties_earliest` | Two days with equal P&L | Earlier date |
| `summary_has_three_headlines_and_no_percentiles` | Any | 3 headlines, Samvat, site URL; no “%ile” / “percentile” / “top X%” text |
| `summary_headline_options_start_with_defaults` | Wins, losses, charges | Options list begins with the 3 default headlines |
| `summary_always_has_three_distinct_headlines` | Sparse data, no charges | 3 headlines with distinct labels |
| `samvat_label_spans_years` | Exits in 2081 and 2082 | `2081–82` |

### Invariants (property-style, fast-check optional)

| Test | Expect |
|------|--------|
| `invariant_quantity_conservation` | Per instrument: Σ buys − Σ sells = unclosed signed qty |
| `invariant_flat_to_flat_gross` | Every RT gross = sell value − buy value |
| `invariant_dedupe_idempotent` | `[A, B, A]` equals `[A, B]` |
| `engine_is_deterministic` | Two runs → deep-equal results |

---

### XLSX

| Test | Setup | Expect |
|------|-------|--------|
| `xlsx_keeps_19_digit_text_order_id_exact` | `order_id` stored as text | Exact 19-digit string |
| `rejects_xlsx_order_id_rounded_by_excel` | 19-digit `order_id` stored as a number | `RowValidationError` on `order_id` (rounded by Excel) |
| `parses_xlsx_price_stored_as_number_exactly` | `price` cell 0.29 | 29 paise |
| `xlsx_time_rounding_to_nearest_second` | Execution times :00–:59 as date cells | Every second survives (Excel fractional days) |
| `rejects_xlsx_without_tradebook_headers` | Sheet without the headers | `UnrecognizedFileError` |
| `rejects_corrupt_xlsx` | Zip header, no archive | `UnrecognizedFileError` |
| `rejects_legacy_xls_with_message` | OLE2 `.xls` bytes | Plain-language “old .xls” message |
| `csv_path_unchanged_through_parseTradebookFile` | CSV via the async entry point | Same fills as `parseTradebook` |
| `parses_xlsx_with_console_headers` | Title Case headers (`Trade Date`), data from column B | Same fills as the CSV |
| `rejects_equity_xlsx_tradebook` | Real equity XLSX layout (no `Expiry Date`) | “is an Equity tradebook” |

### P&L statement (API_CONTRACT §3)

| Test | Setup | Expect |
|------|-------|--------|
| `rounds_statement_values_to_paise` | `20099.9999`, `-0.005`, `1,234.565` | Nearest paise, halves away from zero |
| `parses_console_pnl_statement` | Synthetic statement in the real layout | Period, realised P&L, charges by head (clearing + IPFT → other), per-symbol rows |
| `rejects_equity_pnl_statement` | Title “for Equity” | Message names the segment |
| `rejects_statement_whose_charges_dont_add_up` | Heads ≠ printed total | Rejected |
| `warns_when_tradebook_and_statement_differ` | Tradebook P&L 1% off | Warning; statement used |
| `statement_never_split_across_periods` | Statement spans two FYs | Applies to “All” only; FY views estimated with a note |

### Brokers (docs/BROKERS.md)

| Test | Setup | Expect |
|------|-------|--------|
| `positions_at_different_brokers_never_net` | Buy at Zerodha, sell at Angel One | Two open positions, no round trip |
| `same_trade_id_at_different_brokers_is_not_a_duplicate` | Same trade ID, two brokers | Both kept |
| `date_only_fills_aggregate_per_contract_day_side` | 3 buys, 2 sells, one day | One BUY and one SELL fill |
| `date_only_reduces_carried_position_first` | Long carried in; buy and sell next day | Sell applied first |
| `date_only_totals_match_any_intraday_order` | Same fills, shuffled | Same gross |
| `value_based_fifo_keeps_averaged_rows_exact` | Daily-total rows with odd values | Gross equals value difference exactly |
| `reported_charges_replace_estimates` | Angel One fills + records | `source = 'BROKER'`, charges = records |
| `mixed_brokers_label_charges_mixed` | Zerodha + Angel One | `source = 'MIXED'` |
| `time_cards_hidden_without_trade_times` | Date-only fills | Clock, revenge, holding, busy days, buyer/seller: `code = 'NO_TRADE_TIMES'` |
| `upstox_brokerage_groups_same_second_fills` | Upstox fills, no order IDs | One order per contract, side and second |
| `parses_angelone_trades_history` | Synthetic file in the real layout | F&O fills (date only), equity skipped, brokerage rows as charges |
| `angelone_charges_are_exact_in_analysis` | Angel One file | `source = 'BROKER'`; clock card hidden |
| `rejects_angelone_futures` | `FUTIDX …` row | “Futures from Angel One aren’t supported yet” |
| `rejects_angelone_file_without_fno_rows` | Equity rows only | “has no F&O trades” |
| `parses_upstox_trade_report` | Synthetic file in the real layout | `FON`/`FOB`, `BSX` → SENSEX, times to the second, no order IDs |
| `upstox_charges_are_estimated_with_upstox_brokerage` | Upstox file | ₹20 per order; no “add your Zerodha statement” note |
| `rejects_upstox_futures` | Future row | Rejected |
| `rejects_upstox_row_whose_amount_doesnt_match` | Amount ≠ qty × price | Rejected with the row |
| `parses_dhan_global_transaction_report` | Synthetic CSV in the real layout | Options and futures; equity, MCX and footer skipped |
| `dhan_totals_match_the_report` | Two rows | Net = Σ `Gross Amount` |
| `dhan_overlapping_files_count_once` | Same rows in two files | Fills and charges counted once |
| `rejects_dhan_row_that_doesnt_add_up` | `Gross Amount` off by ₹3 | Rejected with the row |
| `rejects_unreadable_dhan_contract` | Unseen contract grammar | `UnknownInstrumentError` naming it |
| `recognises_groww_file_and_explains` | Groww order history | “looks like a Groww file” |
| `routes_zerodha_tradebook` | Console CSV | `broker = 'zerodha'`, estimated charges |
| `rejects_unrecognized_file_naming_supported_brokers` | Any other CSV | Message lists the supported files |
| `verify_real_passes_within_tolerance` | Harness on a synthetic account | Percentages only; PASS when ≤ 0.5% |
| `verify_real_fails_outside_tolerance` | Statement 7% off | FAIL |
| `verify_real_needs_one_statement` | No statement | Error |

### Periods and comparison

| Test | Setup | Expect |
|------|-------|--------|
| `periods_for_dates` | Dates across Samvat, FY and calendar boundaries | All / Samvat / calendar / FY ids and labels, newest first |
| `previous_period_is_same_kind` | Two FYs | FY 2026-27 → FY 2025-26; `all` has none |
| `view_counts_trade_where_it_closed_and_charges_where_paid` | Enter 31 Mar, exit 1 Apr | Trade in the new FY; buy charges in the old FY; FY charges sum to the total |
| `default_view_is_latest_samvat_with_10_trades` | 12 trades in 2081, 3 in 2082 | `samvat-2081`; `all` when no Samvat has 10 |
| `comparison_against_previous_same_kind_period` | Two FYs | Rows hold both values; `null` (—) when a period lacks data, never 0 |
| `charges_unavailable_only_affects_its_period` | 2024 and 2025 trades | Old FY and `all` have no charges; the new FY does |
| `summary_title_follows_period` | One trade | Titles per view |

### Extra cards (ARCHITECTURE §7.3)

| Test | Expect |
|------|--------|
| `card_buyer_vs_seller` | Options only, split by opening side |
| `card_buyer_vs_seller_needs_both_sides` | All-buy → `INSUFFICIENT_DATA` with reason |
| `card_underlyings_best_worst_and_split` | Best/worst underlying; index vs stock split |
| `card_underlyings_single_underlying_insufficient` | One underlying → `INSUFFICIENT_DATA` |
| `card_busy_days_split_by_median` | Busy = more trades than the median day |
| `card_weekday_best_worst_min_trades` | Best/worst weekday need ≥ 3 trades |
| `card_position_size_split_by_median_entry_value` | Above vs at-or-below median entry value |
| `card_charges_drag_wins_to_cover` | charges ÷ average win; charges per trade |
| `card_charges_drag_needs_charges` | No charges → `INSUFFICIENT_DATA` |

### Languages

| Test | Expect |
|------|--------|
| `hindi_result_has_no_english_copy` | Every engine string in Hindi results contains Devanagari |
| `english_is_default_and_locale_is_restored` | Default `en`; restored after `withLocale`, even on throw |
| `numbers_do_not_depend_on_locale` | Identical totals and round trips in both languages |
| `errors_are_translated` | Same error, both languages |

### Performance

| Test | Expect |
|------|--------|
| `perf_20k_fills_under_budget` | `analyze()` on 20,000 fills finishes in < 1.5 s on CI (NF-4 proxy) |

Parsers are tested on synthetic files that mirror layouts seen in redacted real exports. Before launch each must also be checked against a user’s own export (ACCEPTANCE §A).

## 3. Required e2e tests (Playwright)

| Test | Flow | Expect |
|------|------|--------|
| `e2e_upload_to_cards` | Drop 2 synthetic tradebooks | Progress shown → 8 cards → summary with Download + Share |
| `e2e_no_network_during_analysis` | Record all requests after page load, then upload and view every card | Only same-origin `GET`s of static build assets (e.g. the worker chunk). **Zero** requests to other origins, and none with a body or query string |
| `e2e_no_storage_writes` | After analysis | `localStorage`, `sessionStorage`, IndexedDB are empty |
| `e2e_clear_data_resets` | Analyse → Clear data | Landing page shown; the worker is terminated; going back doesn’t restore the cards |
| `e2e_rejects_wrong_file_with_message` | Upload an equity tradebook | Human-readable error naming the F&O segment |
| `e2e_download_image` | Click Download image | A PNG download of 1080×1920 |
| `e2e_mobile_viewport_swipe` | 360×780 viewport, swipe gestures | Cards advance / go back |

---

### Added in roadmap phase Next

| Test | Flow | Expect |
|------|------|--------|
| `e2e_upload_xlsx` | Upload an XLSX version of the synthetic year | Same net P&L as the CSV |
| `e2e_skip_to_end` | “Skip ›” on card 1 | Summary card |
| `e2e_works_offline_after_load` | Load, go offline, analyse | Cards render (worker pre-warmed) |
| `e2e_pwa_reload_offline` | Service worker controls page; reload offline | App loads from cache and analyses |
| `e2e_manifest_is_installable` | Fetch the manifest | Name, standalone, 192/512 icons |
| `e2e_privacy_page` | Open privacy & about | Heading, not-affiliated text, `#privacy` URL, back |
| `e2e_period_picker_and_comparison` | Two-FY fixture, pick FY 2026-27 | “What changed” card, then summary titled FY 2026-27 |
| `e2e_share_single_card` | Share “Right but broke” | 1080×1920 PNG `fo-wrapped-samvat-2082-right-but-broke.png`; frame removed |
| `e2e_hindi_toggle_and_url` | Toggle to हिंदी | `?lang=hi`, `<html lang="hi-IN">`, Hindi cards; nothing stored |
| `e2e_hindi_follows_browser_language` | Browser locale hi-IN | Hindi landing and Hindi file error |
| `e2e_choose_summary_stats` | Swap “Win rate” for “Trades” | Export disabled at 2 picks; summary and image show the chosen 3 |
| `a11y_landing_privacy_and_every_card` | axe-core, WCAG 2.1 AA | No violations on landing, privacy and every card |
| `a11y_keyboard_only_navigation` | Tab to “Next card”, Enter | Advances |

### Added with more brokers (ROADMAP X1)

| Test | Flow | Expect |
|------|------|--------|
| `e2e_file_without_times_hides_time_cards` | Upload a synthetic Dhan report | One note on card 1; clock, revenge and holding cards absent; “broker’s own figures” |
| `e2e_groww_file_is_explained` | Upload a Groww-style file | “looks like a Groww file” |
| `e2e_broker_guides` | Landing page | A guide for each of Zerodha, Angel One, Upstox, Dhan, Groww |

## 4. Launch-gate verification (manual, local only)

`npm run verify:real -- --dir <private dir>` on **≥ 5 real accounts** (TRD §9):

| Check | Pass |
|-------|------|
| Estimated net P&L vs Console P&L statement net | \|diff\| ≤ 0.5% for every account |
| Estimated gross vs statement realized P&L | Report only; investigate if > 0.5% |
| Each charge component vs statement | Report only; used to debug failures |

Record results (aliases + % only) in the launch PR description. **Do not launch until every account passes.**

---

## 5. Non-goals for tests

- Visual regression screenshots of cards (nice-to-have)
- Cross-browser e2e beyond Chromium in CI (manual check on iOS Safari before launch)
- Load tests beyond the NF-4 performance smoke

---

## 6. Commands

```bash
npm ci
npm test                 # vitest run
npm run test:e2e         # playwright test
npm run test:tz          # whole suite under TZ=America/New_York
PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # when the local Chromium differs from Playwright's
npm run verify:real -- --dir ../fo-wrapped-private
```

CI MUST run the full unit and e2e suites with no skipped required tests.

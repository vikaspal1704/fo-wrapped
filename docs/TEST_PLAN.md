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
| `rejects_xlsx_until_supported` | Zip (XLSX) bytes | Plain-language error asking for CSV. Replaced by `parses_xlsx_with_preamble` once XLSX is verified |
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
| `settled_position_without_symbol_row_stays_excluded` | Statement with `perSymbol = null` | Excluded; warning present |
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
| `uses_rate_window_for_trade_date` | Fills either side of a rate change | Each charged at its own window’s rate |
| `missing_rate_window_throws` | Fill before earliest window | `ChargesUnavailableError` |
| `charges_marked_estimated_without_statement` | No statement | `totals.source = 'ESTIMATED'`; card notes say *estimated* |
| `statement_totals_override_calculator` | With statement | `totals` equal statement values; `source = 'PNL_STATEMENT'` |
| `rejects_statement_with_non_overlapping_period` | Statement 2022, tradebook 2024 | `PeriodMismatchError` |

### Cards

| Test | Setup | Expect |
|------|-------|--------|
| `card1_net_pnl_trades_traded_value` | Known fixture | Exact values |
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
| `samvat_label_spans_years` | Exits in 2081 and 2082 | `2081–82` |

### Invariants (property-style, fast-check optional)

| Test | Expect |
|------|--------|
| `invariant_quantity_conservation` | Per instrument: Σ buys − Σ sells = unclosed signed qty |
| `invariant_flat_to_flat_gross` | Every RT gross = sell value − buy value |
| `invariant_dedupe_idempotent` | `[A, B, A]` equals `[A, B]` |
| `engine_is_deterministic` | Two runs → deep-equal results |

---

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
TZ=America/New_York npm test -- time   # TZ-independence check
npm run verify:real -- --dir ../fo-wrapped-private
```

CI MUST run the full unit and e2e suites with no skipped required tests.

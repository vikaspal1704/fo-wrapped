# Test fixtures

**Synthetic only.** Every file here is invented. It copies the *format* of real Zerodha Console exports, but none of the trades are real. Never add a real tradebook or P&L statement, even an anonymised one (TRD §9).

## `zerodha-fo-tradebook.synthetic.csv`

This file mirrors the Console F&O tradebook CSV format confirmed in `docs/API_CONTRACT.md` §2:
- 14 columns in Console order, with empty `isin` / `series`
- 6-decimal `quantity` and `price`
- a 19-digit BSE `order_id`
- `expiry_date` on weekly contracts
- a trailing empty line

It also covers these cases:
- NSE and BSE rows in one file
- the month letter code (`O` = October)
- a short-first trade
- a two-fill partial execution of one order

Expected results (`parses_synthetic_console_fixture`):

| # | Instrument key | Side | Qty | Entry → exit (IST) | Avg entry | Avg exit | Gross P&L | Holding |
|---|----------------|------|-----|--------------------|-----------|----------|-----------|---------|
| 1 | `NSE:NIFTY26O0624800CE` | SHORT | 65 | 2026-10-06 09:20:00 → 09:55:30 | ₹40.00 | ₹22.65 | **₹1,127.75** | 35 m 30 s |
| 2 | `NSE:NIFTY26O0624700PE` | LONG | 130 | 2026-10-06 10:00:00 → 10:20:00 | ₹18.10 | ₹15.00 | **−₹403.00** | 20 m |
| 3 | `BSE:SENSEX26O0874000PE` | LONG | 20 | 2026-10-08 10:01:05 → 10:31:40 | ₹150.00 | ₹120.50 | **−₹590.00** | 30 m 35 s |
| 4 | `BSE:SENSEX26O0874200CE` | LONG | 20 | 2026-10-08 11:02:10 → 11:12:10 | ₹95.05 | ₹131.45 | **₹728.00** | 10 m |

- Totals: 9 fills, 4 round trips, gross **₹862.75** (86275 paise), 0 unclosed positions.
- Every round trip exits on its instrument’s expiry date, so card 4 has no “other days” group: `INSUFFICIENT_DATA`.
- Executed orders for brokerage: **8**. Fills `5100003` and `5100004` share order `1600000090000003`.

## `synthetic-year.csv`

This is a made-up year of NIFTY weekly option trades: 240 fills, 120 round trips, from 2025-11-04 to 2026-03-04. It is dense enough for all 8 cards to render, and it's used by the Playwright tests.

The data is deliberately "right but broke": slightly more wins than losses, but bigger losses, with some quick re-entries after losses. Regenerate it with `npm run fixtures`. The generator is deterministic, so the file only changes if the script changes.

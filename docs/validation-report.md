# Validation report: launch gate

**Decision: NO-GO** (as of 2026-10-17): no real accounts have been checked yet, and the charge rates are still checked against secondary sources only.

This report is the evidence for the launch gate ([`SPEC.md`](SPEC.md) US-0.5, [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md) §A): estimated net P&L must be within ±0.5% of the Zerodha Console P&L statement on at least 5 real accounts, and every rate row must be checked against its primary source.

## How to fill it in (owner)

1. Put each volunteer's exports, with identifying details removed, in a private folder **outside the repo**, one folder per account with a neutral alias:

   ```
   ../fo-wrapped-private/
     acct-a/  tradebook-….csv (one or more)  pnl-….xlsx (one F&O P&L statement)
     acct-b/  …
   ```

2. Run `npm run verify:real -- --dir ../fo-wrapped-private --markdown`.
3. Paste the Markdown table it prints under **Results** below. It contains aliases and percentages only.
4. For any FAIL, open `../fo-wrapped-private/verification-report-<alias>.json`, which lists each contract as MATCHED, DIFFERENT, ONLY_IN_TRADEBOOK, ONLY_IN_STATEMENT or EXCLUDED. Its attribution splits the difference into contract P&L, excluded contracts, statement rows and charges. Write the cause under **Findings**, without amounts or symbols.
5. Never commit the private folder or the JSON files. `.gitignore` covers `*-private/` and `verification-report*.json`.

## Results

| Account | Net difference | Gross difference | Result |
|---------|---------------:|-----------------:|--------|
| *none yet* | | | |

Rates checked against primary sources: 0 of 17 (all rows are `secondary`, see ARCHITECTURE §6.2).

## Findings

*To be filled in from each account's detail file: the cause of every FAIL (rate window, rounding level, excluded contracts, IPFT or clearing charges) and the fix made.*

## Known gaps

Ranked by expected impact on net P&L. Details: [`SPEC.md`](SPEC.md) §2, "Correctness risks".

| # | Gap | Effect on estimated net P&L |
|---|-----|-----------------------------|
| R1 | Positions settled at expiry, exercised or assigned are excluded (no settlement price in a tradebook) | Their value and the STT on exercise are missing; exact with the P&L statement |
| R2 | ~~A position partly closed and never back to flat dropped its already-realised P&L~~ | **Fixed** 2026-10-17: the closed part counts (partial round trip) |
| R3 | No rate windows before 2024-10-01 or for BSE futures; all rates secondary-checked | Charges unavailable or possibly wrong |
| R4 | ₹40 brokerage (50% cash-collateral rule), IPFT and clearing charges not modelled | Charges understated |
| R5 | No MIS/NRML column: one FIFO queue per contract | Only if Console nets products differently |
| R6 | Corporate-action adjusted contracts change symbol | Both legs excluded |

## Sign-off

- [ ] ≥ 5 accounts, every one PASS
- [ ] Every rate row `primary`
- [ ] Samvat 2083 Muhurat date checked against the NSE circular
- [x] Owner decision on R2 recorded (count the realised part, as Console does)
- [ ] Decision changed to **GO** by the owner

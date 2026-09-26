# Product Roadmap

**Product:** F&O Wrapped  
**Owner:** Vikas Pal  
**Last updated:** 2026-09-26  
**Format:** Now / Next / Later. Phases are ordered by priority, not by date. The only fixed date is the Diwali launch window.

This document sets the direction. The requirements for the current release live in [`PRD.md`](PRD.md), and what "done" means lives in [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md).

---

## 1. Vision

> Every Indian F&O trader can see the truth about their own trading in two minutes, privately, and free.

SEBI’s own studies of individual F&O traders have repeatedly found that about 9 in 10 lose money. Most of those traders have never seen their year laid out: what charges cost them, whether their wins cover their losses, what expiry days and revenge trades do to them. Brokers show a P&L number, not the patterns behind it.

F&O Wrapped turns a tradebook into a small set of honest, shareable cards. It is not a tool for trading better and it gives no advice. It is a mirror.

## 2. Principles (non-negotiable)

Every roadmap item has to pass these. If one doesn’t, it is cut or redesigned. The principles don’t bend for a feature.

| # | Principle | What it rules out |
|---|-----------|-------------------|
| P1 | **Data never leaves the device.** | Uploads, accounts, server-side analysis, analytics that carry trade data |
| P2 | **Honest numbers.** Never invent a value; label estimates; say what was excluded. | Guessed settlement prices, borrowed rates, silent rounding, flattering copy |
| P3 | **Correctness before features.** A new card ships only with tests and a documented formula. | Shipping a card we can’t verify against the broker |
| P4 | **Free and no sign-up.** | Paywalls, email capture before results |
| P5 | **No advice, no percentiles without real data.** | “You beat 80% of traders”, trade recommendations, tips |

## 3. Where we are (v0.1, live)

- Live at https://vikaspal1704.github.io/fo-wrapped/ (GitHub Pages, static)
- Zerodha Console F&O **CSV** tradebooks; multi-file merge and dedupe
- FIFO round trips, open and expired positions, charges **estimated** from a dated rate table (including the Budget 2026 STT rise)
- All 8 cards plus a summary, a 1080×1920 share image, and clear data
- CI with 76 unit tests and 7 browser tests, including automated checks that nothing is sent over the network or stored

**Not yet launch-ready:** no XLSX support, no P&L statement (so no exact charges), rates checked only against secondary sources, and the ±0.5% accuracy gate hasn’t been run.

## 4. The calendar that shapes the roadmap

Wrapped products live or die by timing. Three moments matter for Indian traders:

| Moment | Date | Why it matters | What we ship for it |
|--------|------|----------------|---------------------|
| **Diwali / end of Samvat 2082** | Muhurat trading **8 Nov 2026** | The traditional trading new year; people already post “my Samvat” reflections | **Launch:** “Your Samvat 2082, Wrapped” |
| **Calendar year-end** | Dec 2026 | Everyone’s feeds are full of Wrapped cards | Second push: a calendar-year view |
| **Financial year-end and ITR season** | 31 Mar 2027 → ITR filing in July | Traders download P&L statements anyway | A financial-year view and exact mode (facts only, not tax advice) |

---

## 5. NOW: Launch for Diwali (target: live and announced by 1 Nov 2026)

**Goal:** a version accurate enough that we’d stand behind any number it shows, ready when Samvat 2082 closes.

**Exit criteria:** every item in ACCEPTANCE_CRITERIA §A passes. This is the launch gate.

| # | Item | Why | Size |
|---|------|-----|------|
| N1 | **Launch gate:** a local verification script, and net P&L within ±0.5% of Console on ≥ 5 real accounts | This is the product’s credibility | M |
| N2 | **Console P&L statement** import: exact charges, and a value for positions settled at expiry | Turns “estimated” into “exact”, and closes the expiry gap in card 1 | M |
| N3 | **XLSX tradebooks** | Many users download XLSX by default | S |
| N4 | **Rates checked against primary sources** (Zerodha, NSE/BSE, circulars); add windows **before Oct 2024** and for BSE futures | FY 2024-25 data is common; right now it shows “charges unavailable” | S |
| N5 | Confirm the PRD §10 decisions (D-1 … D-16) | They define what every card means | S |
| N6 | Launch polish: Open Graph preview image and meta tags, iOS Safari manual pass, an accessibility pass (keyboard and screen reader through all 9 cards) | The link preview is the first impression on WhatsApp and X | S |
| N7 | Repo hygiene: default branch → `main`, branch protection, CONTRIBUTING and a security contact | So deploys and outside contributions work predictably | S |
| N8 | Clear copy that the app is **not affiliated with Zerodha**, plus a short privacy page explaining how to verify the no-upload claim | Trust, and staying on the right side of trademark use | S |

**Deliberately not in Now:** new cards, other brokers, and languages. Launching accurate beats launching broad.

---

## 6. NEXT: Grow what works (Nov 2026 → Mar 2027)

**Goal:** make it useful for more traders, and worth coming back to at year-end and financial-year-end.

### 6.1 More traders

| # | Item | Notes |
|---|------|-------|
| X1 | **More brokers**, in order of F&O user base: Groww, Angel One, Upstox, Dhan | Each needs a verified export spec, a parser and a symbol map, plus its own rate table (brokerage differs). The engine is already broker-agnostic from the fill level down. |
| X2 | **Hindi**, then other languages by demand | The card copy is short, so it’s cheap to translate. Numbers keep the Indian digit grouping. |
| X3 | **Installable app (PWA)** with offline support | Works with no network after the first visit, which is a stronger privacy story |

### 6.2 More useful views

| # | Item | Notes |
|---|------|-------|
| X4 | **Period picker:** Samvat year, calendar year, financial year, or a custom range | Needed for the December and March moments |
| X5 | **Year-over-year:** drop two years and see what changed | “Charges fell by ₹X; revenge trades halved.” Only facts, no judgement |
| X6 | **A share image per card**, plus a choice of 3 headlines on the summary | People share the card that surprised them, not always the summary |

### 6.3 New cards (each needs a formula in ARCHITECTURE, tests, and a threshold)

Candidates to validate with users before building:

| Card | Question it answers |
|------|---------------------|
| Buyer vs seller | Did you make more buying or selling options? |
| Index vs stock | Which underlyings made or lost you money? |
| Overtrading | Were your busiest days your worst days? |
| Weekday | Is there a day of the week you should take off? |
| Position size | Did bigger positions help or hurt? |
| Charges drag | How many round trips did it take just to cover the charges? |

**Next exit signal:** people come back in December and March without a new launch push, and outside users contribute at least one broker parser.

---

## 7. LATER: Expand carefully (2027+)

These are bets. Each one needs a decision against the principles before any work starts.

| # | Idea | Open question |
|---|------|---------------|
| L1 | **Other segments:** equity intraday and delivery, commodity (MCX), currency | Different charges and settlement; is it still “F&O Wrapped”? |
| L2 | **Opt-in anonymous benchmarks**, which would make percentile cards possible (P5) | Could it be done without breaking P1? For example, users submitting only aggregated card values, never trades, with explicit consent, k-anonymity and a public methodology. If not, don’t do it. |
| L3 | **Personal rules check:** the user sets rules (“no trades in the first 15 minutes”) and sees how often they broke them | It must stay a mirror, not coaching (P5) |
| L4 | **Embeddable engine:** publish the engine as an npm package so journaling tools and brokers can reuse it | License, versioning, and support load |
| L5 | **Monthly Wrapped** | Is the novelty lasting, or is once a year better? |

---

## 8. Explicitly not doing

- Accounts, cloud sync, or storing tradebooks: this conflicts with P1
- Trading signals, tips, strategy advice, or “what you should have done”: this conflicts with P5
- Tax computation or ITR filing: facts only; we point users to their CA
- Connecting to broker APIs or reading live positions: exports only, a user-initiated file
- Ads or selling data: there’s no data to sell, by design

---

## 9. How we’ll know it’s working

P1 rules out product analytics that could carry trade data, so these are the measures we’ll use:

| Signal | Source |
|--------|--------|
| Accuracy reports (number matched Console / didn’t) | A GitHub issue template with only the % difference, no amounts |
| Shares | Public posts tagged with the site URL (share images carry it) |
| Visits | GitHub Pages / CDN aggregate traffic only; no client-side tracker |
| Contributor health | Issues, PRs, and broker parsers contributed |
| Correctness | Zero open “wrong number” bugs older than 7 days |

Whether to add a cookieless, aggregate-only page counter is an open decision (§11).

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A wrong number goes viral | Credibility loss | Launch gate (N1); “estimated” labels; a fast fix path; the rate table is data, not code |
| Broker changes its export format | Parser breaks | Zod rejects clearly instead of guessing; format tests from synthetic fixtures; an issue template for new formats |
| Charge rates change (Budget, exchange circulars) | Estimates drift | Dated rate windows; review after every Budget and exchange circular; exact mode via the P&L statement |
| Regulatory sensitivity (SEBI rules on advice and finfluencers) | Takedown or reputational risk | P5: no advice, no recommendations, factual copy, disclaimer |
| Trademark (“Zerodha”, “Wrapped”) | Rename or takedown | Descriptive use only (“works with Zerodha Console exports”); not-affiliated notice; keep a fallback name ready |
| Traffic spike at Diwali | Pages limits | A static site on a CDN; no backend to fall over |

---

## 11. Open decisions

| # | Decision | Needed by |
|---|----------|-----------|
| O1 | Confirm PRD §10 defaults D-1 … D-16 | Before N1 |
| O2 | Custom domain (e.g. a short .in domain) vs github.io | Before the launch post |
| O3 | Allow a cookieless aggregate page counter, or no counting at all? | Before launch |
| O4 | Which broker comes after Zerodha (X1)? Decide from requests after launch | Dec 2026 |
| O5 | Keep the product name, or rename before the trademark risk grows? | Before launch |

---

## 12. How this roadmap is maintained

- Reviewed after each launch moment (Diwali, December, March) and whenever a principle is challenged
- Moving an item between Now, Next and Later happens in a PR that updates this file, with the reason in the PR description
- Shipped items move to the README progress table and out of this document

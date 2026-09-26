# Product Requirements Document (PRD)

**Product:** F&O Wrapped  
**Owner:** Vikas Pal  
**Version:** 1.0 (docs-first)  
**Status:** Spec v1 — see §10 for decisions awaiting owner confirmation

---

## 1. One-liner

A free, no-signup web app. An Indian F&O trader drops in their broker’s trade file (Zerodha, Angel One, Upstox or Dhan) and gets a set of honest, shareable “Wrapped”-style cards about their trading year. Everything runs in the browser, and **no data ever leaves the device**.

## 2. Goals

1. Show a retail F&O trader patterns in their own trading that they have never seen laid out: true cost of charges, win rate vs payoff, expiry-day behaviour, time-of-day edge, revenge trading, holding discipline.
2. **Numbers must be correct.** Net P&L must match Zerodha Console within **0.5%** on at least 5 real accounts before launch (see [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md) §A).
3. **Privacy by construction.** Files are parsed and analysed in the browser; nothing is uploaded, stored server-side, or sent to analytics.
4. **Honest by default.** Never invent a number. When data is missing or estimated, say so on the card.
5. **Shareable.** Every card and a summary card export as a story-sized image for WhatsApp / Instagram / X.

## 3. Non-goals

- Accounts, sign-up, login, or any server-side storage
- Brokers other than Zerodha in v1 (the parser is designed so others can be added later)
- Equity delivery / intraday cash, currency (CDS) and commodity (MCX) segments
- Tax computation, ITR / tax-audit turnover, or advice of any kind
- Live market data, prices, or broker API connections
- Percentile or “you beat X% of traders” claims (no real data source in v1)
- Native mobile apps

## 4. Personas

| Persona | Needs |
|---------|-------|
| **Retail F&O trader (primary)** | On Zerodha, on a phone, has never seen their own patterns. Needs a 3-step download guide, a single upload button, fast results, and cards they are willing to share. |
| **Privacy-sceptical trader** | Needs visible proof that files stay on the device: clear copy, no network calls after load, a “Clear data” button, and open-source code. |
| **Recruiter / engineer reviewer** | Understands the product and the correctness bar from README + this PRD in ≤ 2 minutes. |
| **AI implementer** | Follows [`AGENT_BRIEF.md`](AGENT_BRIEF.md) → contracts → acceptance without inventing semantics. |

## 5. Core flow

| Step | Behaviour |
|------|-----------|
| 1. Landing | One **“Drop your tradebook”** button, a 3-step **“How to download from Zerodha Console”** guide, and a clear line: *“Files are processed on your device and never uploaded.”* |
| 2. Upload | User selects or drops **one or more** CSV/XLSX files. Console limits each tradebook download to 365 days, so files are **merged and deduped by `trade_id`**. Optional: Console **P&L statement**. |
| 3. Analyse | Parsing and analysis run in a **Web Worker** with a progress indicator. The main thread never blocks. |
| 4. Cards | User swipes through **8 cards**, story-style (tap / swipe / keyboard). |
| 5. Share | The final (summary) card has **“Download image”** and **“Share”** buttons. |
| 6. Clear | A **“Clear data”** button wipes everything from memory at any time. |

## 6. User stories

| ID | Story |
|----|-------|
| US-1 | As a trader, I follow a 3-step guide to download my tradebook from Console without leaving the page confused. |
| US-2 | As a trader, I drop 2–3 yearly tradebook files at once and the app merges them without double-counting. |
| US-3 | As a trader, if I drop the wrong file (equity tradebook, a PDF, a random CSV), I get a plain-language error telling me what to download instead. |
| US-4 | As a trader, I optionally add my Console P&L statement so the headline numbers match my broker exactly. |
| US-5 | As a trader, I see progress while a large file is processed and the page stays responsive. |
| US-6 | As a trader, I swipe through 8 cards and understand each in under 5 seconds. |
| US-7 | As a trader, I download or share a summary image with 3 headline stats, the Samvat year, and the site URL. |
| US-8 | As a trader, I press “Clear data” and nothing about my trades remains in the tab. |
| US-9 | As a trader, when a number is estimated or some positions are excluded, the card tells me so. |

## 7. Functional requirements

### 7.1 Input

| ID | Requirement |
|----|-------------|
| F-IN-1 | **MUST** accept the Zerodha Console **F&O tradebook** as CSV or XLSX. Expected columns include `symbol`, `trade_date`, `segment`, `trade_type`, `quantity`, `price`, `trade_id`, `order_id`, `order_execution_time`. Exact headers MUST be verified against 3–4 real exports before coding (see [`API_CONTRACT.md`](API_CONTRACT.md) §2). |
| F-IN-2 | **MUST** accept multiple tradebook files in one session; merge them and **dedupe by `trade_id`**. A duplicate `trade_id` whose other fields differ is a hard error, not a silent drop. |
| F-IN-3 | **MUST** optionally accept the Console **P&L statement**. When present, its realized P&L and charges totals are the **source of truth** for totals; the tradebook is used only for pattern analysis. |
| F-IN-4 | **MUST** validate every row with **Zod**. An unrecognised file is rejected with a human-readable error. **Never guess** at a column, format, or value. |
| F-IN-5 | **MUST** reject files from unsupported segments (equity, currency, commodity) with a message naming the right Console download. |
| F-IN-7 | **SHOULD** accept other brokers’ F&O exports (ROADMAP X1): Angel One Trades History, the Upstox trade report and Dhan’s Global Transaction Report, each only in a layout recorded in [`BROKERS.md`](BROKERS.md). When a broker’s file carries its own charges, those are used instead of an estimate. A broker whose F&O layout hasn’t been seen (Groww) is recognised and explained, never guessed. |
| F-IN-6 | **MUST NOT** upload, persist (localStorage / IndexedDB / cookies), or transmit any file contents or derived data. |

### 7.2 Engine (the part that must be correct)

| ID | Requirement |
|----|-------------|
| F-EN-1 | **Round-trip builder:** FIFO matching **per instrument**, handling partial fills, scale-ins, and scale-outs (and position flips). Output: a list of closed trades with entry/exit time, qty, average prices, gross P&L, and holding time. Algorithm: [`ARCHITECTURE.md`](ARCHITECTURE.md) §4. |
| F-EN-2 | **Open / expired positions:** options with no closing trade past expiry are flagged **“settled at expiry”**. If the P&L statement is uploaded, use it for their value; otherwise **exclude them from P&L cards and say so**. Don’t invent numbers. Positions whose expiry is after the last trade date are **“open”** and are likewise excluded. |
| F-EN-3 | **Charges calculator:** brokerage, STT, exchange transaction charges, SEBI fees, stamp duty, and GST, driven by a **versioned config with an effective date per rate**. Show **“estimated”** wherever charges come from the calculator instead of the P&L statement. |
| F-EN-4 | All money arithmetic uses **integer paise**; no floating-point money. |
| F-EN-5 | All timestamps are interpreted in **IST (Asia/Kolkata)** regardless of the device time zone. |
| F-EN-6 | The engine is **deterministic** and **pure**: same files in → identical output. No `Date.now()`, no randomness. |

### 7.3 The 8 cards (v1)

| # | Card | Content |
|---|------|---------|
| 1 | **The number** | Net P&L after all charges, with total trades and turnover. |
| 2 | **Where the money went** | Gross P&L vs charges, e.g. *“You paid ₹X in charges, which is Y% of your gross profit.”* |
| 3 | **Right but broke** | Win rate vs average win and average loss. |
| 4 | **Expiry day** | P&L on expiry days vs all other days. |
| 5 | **Your clock** | Time-of-day heatmap of P&L in 15-minute buckets, highlighting the best and worst slots. |
| 6 | **Revenge trades** | A new entry within 15 minutes after a losing trade, where that loss was larger than the user’s median loss. Show the count and their combined P&L. |
| 7 | **Diamond hands, paper hands** | Median holding time of winners vs losers. |
| 8 | **Worst day and best day** | Each with its date and amount. |

**Summary share card:** 3 headline stats, the Samvat year, and the site URL. **No percentile claims** unless there is a real data source for them.

Exact formulas, thresholds and edge-case copy: [`ARCHITECTURE.md`](ARCHITECTURE.md) §7.

### 7.4 Share & clear

| ID | Requirement |
|----|-------------|
| F-SH-1 | “Download image” exports the summary card as a PNG (1080×1920). |
| F-SH-2 | “Share” uses the Web Share API with the image file when `navigator.canShare({ files })` is true; otherwise falls back to download. |
| F-SH-3 | The summary share image contains only the 3 headline stats, the period, and the site URL. Per-card images (D-21) contain only what that card shows, plus the period and URL. Never file names or account identifiers. |
| F-CL-1 | “Clear data” terminates the worker, drops all references to parsed data, resets UI to the landing page, and revokes any object URLs. |

## 8. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NF-1 | **Correctness over features.** Launch gate: ±0.5% net P&L vs Console on ≥ 5 real accounts. |
| NF-2 | **Privacy:** after the initial page load, the app makes **no network requests that carry user data**. Only same-origin static assets may be fetched, such as the worker chunk. Enforced with a strict CSP (`connect-src 'self'`) and the e2e test `e2e_no_network_during_analysis`. |
| NF-3 | **Mobile-first:** usable one-handed at 360 px width; cards readable without zoom. |
| NF-4 | **Performance:** 20,000 fills parsed and analysed in < 3 s on a mid-range Android phone; UI stays responsive (work happens in the worker). |
| NF-5 | **Accessibility:** cards navigable by keyboard; colour is never the only signal (heatmap uses labels for best/worst); WCAG AA contrast. |
| NF-6 | **No third-party scripts, trackers, or analytics** in v1. |
| NF-7 | **Static hosting** only (GitHub Pages); no backend. |

## 9. Success metrics (v1)

- Launch gate in NF-1 passes and is recorded in the verification report
- Every F-* MUST mapped in `ACCEPTANCE_CRITERIA.md` and passing
- Zero data-bearing network requests in the e2e privacy test
- Share-image export works on Android Chrome and iOS Safari

## 10. Decisions and open questions

The source spec leaves the items below open. Each has a **proposed default** that the docs use. The owner should confirm or change each one before implementation. Until then, treat the default as normative.

| ID | Question | Proposed default |
|----|----------|------------------|
| D-1 | What is a “trade” for counts and per-trade stats? | One **closed round trip** (flat → flat per instrument), not one fill. “Total trades” on card 1 = closed round trips. |
| D-2 | Gross or net P&L for per-trade cards (3, 4, 5, 6, 7, 8)? | **Gross** (before charges), labelled “before charges”. Charges cannot be attributed to individual trades exactly, and the P&L statement only gives totals. Cards 1–2 use net / charges. |
| D-3 | Which timestamp buckets a trade on cards 4, 5, 8? | Card 4 and 8: **exit date** (when P&L is realised). Card 5: **entry time** (when the decision was made). |
| D-4 | Definition of “expiry day” (card 4) | A round trip is an expiry-day trade if its **exit date equals its instrument’s expiry date**. |
| D-5 | “Turnover” on card 1 | Σ \|qty × price\| over all fills (premium value for options). Labelled **“traded value”** so it is not confused with tax-audit turnover. |
| D-6 | Heatmap shape and minimum sample | 1-D strip of 25 buckets (09:15–15:30 IST). Best/worst slot only among buckets with **≥ 5 round trips**. |
| D-7 | Card 2 when gross P&L ≤ 0 | Copy switches to *“You paid ₹X in charges on top of a gross loss of ₹Z.”* No percentage. |
| D-8 | Revenge-trade window scope | Any instrument; entry in the half-open window **(loss exit, loss exit + 15 min]**. |
| D-9 | Samvat year on summary card | Derived from the trades’ exit dates via a config table of Muhurat-trading boundaries. If trades span two Samvat years, show the range (e.g. *Samvat 2081–82*). |
| D-10 | Minimum data to show a card | Card-specific thresholds (ARCHITECTURE §7). A card below threshold shows *“Not enough trades to say”*, not a number. |
| D-11 | Physically settled stock F&O | Treated like any other position without a closing F&O trade: “settled at expiry”, same rules as F-EN-2. |
| D-12 | IPFT / clearing charges not in the spec’s list | Not modelled in v1. The ±0.5% gate decides whether they must be added. |
| D-13 | Which 3 headline stats on the summary card? | Net P&L, Charges paid, Win rate. If win rate has too little data, use Trades instead. |
| D-14 | Dedupe key | **`exchange + trade_id`**. Trade IDs are issued by each exchange, and one file has both NSE and BSE rows, so a bare `trade_id` could collide across exchanges and raise a false conflict. Otherwise this is the spec’s “dedupe by `trade_id`”. |
| D-15 | Some files valid, some not | Analyse the valid files and show the skipped ones, with reasons, on the first card. If none are valid, stay on the landing page with the errors. |
| D-16 | Charges can’t be estimated for some dates | Cards 1–2 show *not enough data* with the reason, the summary uses *P&L before charges*, and cards 3–8 still render. |
| D-17 | Which period does a trade and its charges belong to? | Trades count by **exit date**; charges by the **trade date** of each fill (ARCHITECTURE §7.2). |
| D-18 | Default period on the cards screen | Latest Samvat year with ≥ 10 closed trades, else all trades. |
| D-19 | Extra cards with too little data | Hidden, not shown as “not enough” (the core 8 always show). |
| D-20 | Language preference | From `?lang=` or the browser; never stored. Hindi copy to be reviewed by a native speaker before launch. |
| D-21 | Per-card share images | Contain exactly what the card shows, plus the period and site URL; never file names or account IDs. |
| D-22 | Files without trade times (Angel One, Dhan) | The cards that need times or an opening direction (your clock, revenge trades, holding time, busy days, buyer or seller) are **hidden**, with one note on the first card saying why. A “trade” becomes one contract’s activity on one day. Totals are unaffected. See [`BROKERS.md`](BROKERS.md) §3. |
| D-23 | Positions at different brokers | Never netted: FIFO runs per broker and contract. Charges come from each broker’s own file when it has them, else from that broker’s rates, and the card says which (“broker’s own figures”, “estimated”, or “partly each”). |

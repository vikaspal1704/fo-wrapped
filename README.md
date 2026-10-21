# F&O Wrapped

Your F&O trading year, **Wrapped**, with honest numbers.

A free, no-signup web app. An Indian F&O trader drops in their broker’s trade file (Zerodha, Angel One, Upstox or Dhan) and gets shareable, story-style cards about their trading year. **Everything runs in the browser. No data ever leaves the device.**

Built by **Vikas Pal** (Software Engineer, Fintech).

| | |
|---|---|
| **Status** | v0.4: Wrapped (Zerodha tradebooks and P&L statement, Angel One, Upstox and Dhan in beta, 14 cards, period views, English and हिंदी, offline) plus **Trade Journal** (F&O and Zerodha equity; saved history on your device, your own rules checked, weekly report, notes; optional encrypted sync and plans). Pre-launch: the ±0.5% accuracy check on real accounts |
| **Stack** | Vite · React · TypeScript · Web Worker · Zod · installable (PWA) |
| **Live** | https://vikaspal1704.github.io/fo-wrapped/ |
| **Hosting** | GitHub Pages (static, no backend) |
| **License** | [MIT](LICENSE) |
| **Repo** | https://github.com/vikaspal1704/fo-wrapped |

---

## What it does

1. You download your trades from your broker: the Zerodha **tradebook** (plus the P&L statement for exact charges), Angel One **Trades History**, the Upstox **trade report** or Dhan’s **Global Transaction Report**. The landing page has steps for each, and [`docs/BROKERS.md`](docs/BROKERS.md) says what each file can and can’t tell us.
2. You drop one or more files onto the page. Yearly files are merged, and duplicate trades are removed.
3. A Web Worker parses, validates and analyses them on your device, and the page works offline after your first visit.
4. You pick a period (a **Samvat year**, a **financial year** or a **calendar year**) and swipe through the cards:

| # | Card | What it tells you |
|---|------|-------------------|
| 1 | The number | Net P&L after all charges, trades, traded value |
| 2 | Where the money went | Charges as a share of your gross profit |
| 3 | Right but broke | Win rate vs average win and average loss |
| 4 | Expiry day | P&L on expiry days vs every other day |
| 5 | Your clock | 15-minute time-of-day heatmap, best and worst slots |
| 6 | Revenge trades | Entries within 15 min of a big loss, and what they cost |
| 7 | Diamond hands, paper hands | How long you hold winners vs losers |
| 8 | Best and worst day | Dates and amounts |
| + | Buyer or seller · What you traded · Busy days · Day of the week · Position size · Charges drag | Shown when you have enough data for them |
| + | What changed | This period vs the previous one of the same kind |

5. You share any card, or a summary card with the 3 stats you choose, as a story-sized image. There are no percentile claims.
6. The app is available in **English and हिंदी**.
7. **Clear data** wipes everything from memory.

## Trade Journal

Open **Trade Journal** from the landing page (or `#journal`). It holds F&O and, from Zerodha, equity trades. Nothing is stored until you press **Save on this device**. Then:

- **History:** add trade files at any time (F&O from any supported broker; equity tradebooks from Zerodha Console). Overlaps are deduplicated, each import can be undone, and client IDs are masked in the list.
- **Equity:** intraday P&L (same-day buys and sells of a stock), delivery P&L (sales matched to the oldest buys), and holdings at cost. Estimated charges, with the gaps stated: sales of shares the file doesn't show being bought are left out, DP charges aren't in the tradebook, and no market prices are fetched. Currency, commodity and mutual funds (from the CAS) are specified in [`docs/SPEC.md`](docs/SPEC.md) §5 and wait on real sample files.
- **Rules:** set a max loss per day, max trades per day, a stop after N losses in a row, or no trades in the first N minutes. The Journal lists past days that went past them, and what the later trades made before charges, as facts.
- **Weekly report:** net P&L (or P&L before charges), trades, rule breaches and insights for the latest week, with a share image. It is built on your device.
- **Notes:** notes and tags on a day or a trade, searched on your device.
- **Sync and plans** (only in builds given Supabase settings): Google sign-in, Razorpay subscriptions, and end-to-end encrypted sync with a passphrase. The server can't read your data. See [`docs/security.md`](docs/security.md) and [`docs/runbooks/journal-setup.md`](docs/runbooks/journal-setup.md).

## Testing the whole product

```bash
npm test                                   # 243 unit tests: engine, Journal, server logic, RLS on real Postgres
npx playwright test                        # 40 browser tests on three builds: Wrapped, the Journal, and the complete journey
npx playwright test --project=journey      # just the complete user journey
```

The journey test (`tests/journey/`) runs the app against a local stack: the real database migration on Postgres (PGlite), the real PostgREST server enforcing RLS, and the real Edge Function code. One user goes from Wrapped to the Journal, signs in with Google, pays on Razorpay, imports, sets rules, writes notes, reads the weekly report, turns on reminders, syncs to a second device, unsubscribes from the email, cancels, deletes the synced copy and deletes the account. Every step is checked in the browser and in the database. Google's consent screen, Razorpay's checkout and the email provider are simulated; the real ones need the owner's accounts ([`docs/runbooks/journal-setup.md`](docs/runbooks/journal-setup.md)).

## What it is not

- Not a tax tool, not advice, not a broker integration
- Wrapped: no accounts, no server, no analytics. The Journal's optional account exists only for billing and encrypted sync
- F&O on NSE and BSE only (no equity, currency or commodity). Brokers: Zerodha, Angel One, Upstox and Dhan; Groww waits on a real F&O export

## Why you can trust the numbers

- FIFO round-trip matching per broker and instrument, with integer-paise arithmetic and IST timestamps
- Charges come from the broker’s own file when it has them (Angel One, Dhan, the Zerodha P&L statement). Otherwise they come from a versioned rate table with effective dates and are labelled **estimated**
- A file format is never guessed: each parser reads only a layout seen in a real export ([`docs/BROKERS.md`](docs/BROKERS.md))
- Expired or open positions are **never** given an invented value. They're taken from your P&L statement or excluded, and the card says so
- **Launch gate:** net P&L must match Console within **0.5%** on at least 5 real accounts (`npm run verify:real`)

---

## Documentation (start here)

| Doc | Audience | Purpose |
|-----|----------|---------|
| [`docs/AGENT_BRIEF.md`](docs/AGENT_BRIEF.md) | **AI coding agents** | Primary build instructions. Read this first |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Everyone | Product direction: principles, the Diwali launch, Now / Next / Later |
| [`docs/PRD.md`](docs/PRD.md) | Product / recruiters | Goals, flow, cards, requirements, open decisions |
| [`docs/TRD.md`](docs/TRD.md) | Implementers | Stack, layout, numeric and time model, privacy controls, CI |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Implementers | Input schemas, engine types, errors, worker protocol |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Implementers / interviewers | Pipeline, FIFO worked example, charges, card formulas |
| [`docs/ACCEPTANCE_CRITERIA.md`](docs/ACCEPTANCE_CRITERIA.md) | QA / agents | Launch gate and the binary “done” checklist |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Implementers | Required unit and e2e test names, and edge cases |
| [`docs/BRIEF.md`](docs/BRIEF.md) | Everyone | The owner’s brief: from Wrapped to the paid Journal (now the Trade Journal) |
| [`docs/SPEC.md`](docs/SPEC.md) | Implementers / QA | User stories and Given/When/Then criteria, each with its test |
| [`docs/validation-report.md`](docs/validation-report.md) | Owner | Launch-gate evidence and go/no-go |
| [`docs/adr/`](docs/adr/README.md) | Implementers | Architecture decisions for the Journal |
| [`docs/security.md`](docs/security.md) | Everyone | What each part of the product can and can’t see |
| [`docs/runbooks/`](docs/runbooks/) | Owner | Journal cloud setup and key rotation |
| [`AGENTS.md`](AGENTS.md) | Agents | Short pointer to the brief |

---

## How to run

```bash
git clone https://github.com/vikaspal1704/fo-wrapped.git
cd fo-wrapped
npm ci
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run test:tz      # same tests under a non-IST time zone
npm run lint         # ESLint, incl. no-network / no-float-money rules in the engine
npm run typecheck    # tsc
npm run test:e2e     # Playwright end-to-end tests (incl. no-network and no-storage checks)
npm run build        # static build in dist/ (includes the generated service worker)
npm run fixtures     # regenerate synthetic test fixtures
npm run brand        # regenerate the link-preview image and icons
```

## Progress

| Area | Status |
|------|--------|
| Tradebook CSV parser (Zod-validated, verified against a real Console export) | ✅ |
| Multi-file merge, dedupe, FIFO round trips, open / expired positions | ✅ |
| Charges estimate (dated rate table incl. Budget 2026 STT) | ✅ rates checked against secondary sources only |
| All 8 cards + summary, Samvat year | ✅ |
| Web Worker, story UI, download / share image, clear data | ✅ |
| Unit (Vitest) + e2e (Playwright) tests, CI + GitHub Pages workflows | ✅ |
| XLSX tradebooks | ✅ (still to check against a real XLSX export) |
| Period views, year-over-year, 6 extra cards, per-card share, chosen headline stats | ✅ |
| Hindi, installable offline app, privacy page, link previews, accessibility (axe) | ✅ |
| Console P&L statement (exact charges, expired positions valued) | ✅ (still to check against the owner’s own export) |
| Angel One, Upstox (options), Dhan | ✅ beta: built from redacted real layouts; Groww recognised, not supported yet |
| Trade Journal: history, rules, weekly report, notes, encrypted sync, plans (SPEC §4) | ✅ built and tested; cloud side needs the owner’s Supabase and Razorpay setup |
| Trade Journal: Zerodha equity (intraday, delivery, holdings at cost) (SPEC §5) | ✅ built and tested on synthetic data; owner check against Console’s tax P&L and the rates still to do. Currency, commodity, MF: wait on samples |
| Launch gate: ±0.5% vs Console on ≥ 5 real accounts | ◐ harness ready (`npm run verify:real`, per-contract detail, [validation report](docs/validation-report.md)); needs real accounts |

## Project layout

```
src/engine/            # pure TypeScript, no DOM: runs in the worker and in Node tests
  parse/               # every broker's file → Fill[] (Zod-style checks); P&L statement; symbol → Instrument
  merge.ts             # merge files, dedupe by exchange + trade_id
  roundTrips.ts        # FIFO round trips + open / settled-at-expiry positions
  charges/             # dated rate table + calculator
  cards.ts, cardsExtra.ts  # the 14 cards + summary
  periods.ts           # Samvat, calendar and financial-year views
  analyze.ts           # the whole pipeline, one view per period
  i18n.ts              # engine copy in English and Hindi
src/engine/journal/    # Journal analysis: rules, insights, weekly report, imports, notes
src/journal/           # Journal: on-device store, encryption, cloud clients, screens
src/worker/            # Web Workers: Wrapped analysis and the Journal (both languages)
supabase/              # Journal server: SQL migrations with RLS, Edge Functions
src/app/               # landing, privacy, progress, worker lifecycle, UI copy
src/cards/             # story viewer and card components
src/share/             # PNG export, per-card share, Web Share
build/                 # service-worker generator
public/                # manifest, icons, link-preview image
tests/unit/            # Vitest, named per docs/TEST_PLAN.md
tests/e2e/             # Playwright (incl. offline, privacy and axe accessibility)
tests/fixtures/        # synthetic Console-format files only
tests/golden/          # reviewed totals per fixture (money math)
scripts/               # fixture and brand-image generators; verify-real.ts (launch gate)
```

## Privacy

Files are read with the browser’s File API and processed in a Web Worker. The app has no backend, and a strict Content-Security-Policy blocks it from sending data to any other origin. Nothing is written to browser storage. Closing the tab or pressing **Clear data** removes everything.

---

## License

MIT © 2026 Vikas Pal. See [LICENSE](LICENSE).

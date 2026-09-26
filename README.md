# F&O Wrapped

Your F&O trading year, **Wrapped**, with honest numbers.

A free, no-signup web app. An Indian F&O trader drops in their broker’s trade file (Zerodha, Angel One, Upstox or Dhan) and gets shareable, story-style cards about their trading year. **Everything runs in the browser. No data ever leaves the device.**

Built by **Vikas Pal** (Software Engineer, Fintech).

| | |
|---|---|
| **Status** | v0.3: Zerodha tradebooks and P&L statement, Angel One, Upstox and Dhan (beta), 14 cards, period views, English and हिंदी, and it works offline. Pre-launch: the ±0.5% accuracy check on real accounts |
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

## What it is not

- Not a tax tool, not advice, not a broker integration
- No accounts, no server, no analytics
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
| Launch gate: ±0.5% vs Console on ≥ 5 real accounts | ◐ harness ready (`npm run verify:real`); needs real accounts |

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
src/worker/            # Web Worker that runs the engine (both languages)
src/app/               # landing, privacy, progress, worker lifecycle, UI copy
src/cards/             # story viewer and card components
src/share/             # PNG export, per-card share, Web Share
build/                 # service-worker generator
public/                # manifest, icons, link-preview image
tests/unit/            # Vitest, named per docs/TEST_PLAN.md
tests/e2e/             # Playwright (incl. offline, privacy and axe accessibility)
tests/fixtures/        # synthetic Console-format files only
scripts/               # fixture and brand-image generators; verify-real.ts (launch gate)
```

## Privacy

Files are read with the browser’s File API and processed in a Web Worker. The app has no backend, and a strict Content-Security-Policy blocks it from sending data to any other origin. Nothing is written to browser storage. Closing the tab or pressing **Clear data** removes everything.

---

## License

MIT © 2026 Vikas Pal. See [LICENSE](LICENSE).

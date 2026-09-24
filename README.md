# F&O Wrapped

Your F&O trading year, **Wrapped**, with honest numbers.

A free, no-signup web app. An Indian F&O trader drops in their Zerodha tradebook and gets 8 shareable, story-style cards about their trading year. **Everything runs in the browser. No data ever leaves the device.**

Built by **Vikas Pal** (Software Engineer, Fintech).

| | |
|---|---|
| **Status** | Docs-first. Spec v1 is locked; implementation pending |
| **Stack** | Vite · React · TypeScript · Web Worker · Zod |
| **Hosting** | GitHub Pages (static, no backend) |
| **License** | [MIT](LICENSE) |
| **Repo** | https://github.com/vikaspal1704/fo-wrapped |

---

## What it does

1. You download your **tradebook** from Zerodha Console (plus, optionally, your **P&L statement**).
2. You drop one or more files onto the page. Yearly files are merged, and duplicate trades are removed by `trade_id`.
3. A Web Worker parses, validates, and analyses the files on your device.
4. You swipe through 8 cards:

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

5. You download or share a summary card with 3 headline stats and your Samvat year. There are no percentile claims.
6. **Clear data** wipes everything from memory.

## What it is not

- Not a tax tool, not advice, not a broker integration
- No accounts, no server, no analytics
- v1 supports Zerodha F&O only (NSE/BSE equity derivatives)

## Why you can trust the numbers

- FIFO round-trip matching per instrument, with integer-paise arithmetic and IST timestamps
- Charges come from a versioned rate table with effective dates, and are labelled **estimated** unless you add your P&L statement
- Expired or open positions are **never** given an invented value. They're taken from your P&L statement or excluded, and the card says so
- **Launch gate:** net P&L must match Console within **0.5%** on at least 5 real accounts

---

## Documentation (start here)

| Doc | Audience | Purpose |
|-----|----------|---------|
| [`docs/AGENT_BRIEF.md`](docs/AGENT_BRIEF.md) | **AI coding agents** | Primary build instructions. Read this first |
| [`docs/PRD.md`](docs/PRD.md) | Product / recruiters | Goals, flow, cards, requirements, open decisions |
| [`docs/TRD.md`](docs/TRD.md) | Implementers | Stack, layout, numeric and time model, privacy controls, CI |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Implementers | Input schemas, engine types, errors, worker protocol |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Implementers / interviewers | Pipeline, FIFO worked example, charges, card formulas |
| [`docs/ACCEPTANCE_CRITERIA.md`](docs/ACCEPTANCE_CRITERIA.md) | QA / agents | Launch gate and the binary “done” checklist |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Implementers | Required unit and e2e test names, and edge cases |
| [`AGENTS.md`](AGENTS.md) | Agents | Short pointer to the brief |

---

## How to run (once implemented)

```bash
git clone https://github.com/vikaspal1704/fo-wrapped.git
cd fo-wrapped
npm ci
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run build        # static build in dist/
```

## Privacy

Files are read with the browser’s File API and processed in a Web Worker. The app has no backend, and a strict Content-Security-Policy blocks it from sending data to any other origin. Nothing is written to browser storage. Closing the tab or pressing **Clear data** removes everything.

---

## License

MIT © 2026 Vikas Pal. See [LICENSE](LICENSE).

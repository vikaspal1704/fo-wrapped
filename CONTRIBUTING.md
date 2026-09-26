# Contributing to F&O Wrapped

Thanks for helping. This project is about **honest numbers** and **privacy**, so contributions are judged on those first.

## Ground rules

1. **Never commit real trade data**, even anonymised: no tradebooks, P&L statements, contract notes or screenshots of them. Tests use synthetic fixtures only (`tests/fixtures/`, `npm run fixtures`).
2. **No code that sends user data off the device.** No network calls, storage, analytics or third-party scripts in the engine, the worker or the UI (see [`docs/TRD.md`](docs/TRD.md) §7; ESLint enforces much of it).
3. **Don’t guess.** If a file, column, symbol, expiry or rate can’t be determined, reject it with a clear message or exclude it with a visible notice.
4. **Formulas are documented before they ship.** A new or changed card needs its formula in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7 and named tests in [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).
5. **No advice.** Copy states facts about the user’s own trades. No tips, predictions or “you should”.

Direction and priorities live in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Setup

```bash
npm ci
npm run dev
```

Before opening a PR, run everything CI runs:

```bash
npm run lint && npm run typecheck && npm test && npm run test:tz && npm run test:e2e && npm run build
```

If your Chromium differs from the one Playwright expects, set `PW_CHROMIUM_PATH=/path/to/chrome`.

## Common contributions

### Charge rates changed
Rates live in `src/engine/charges/rates.ts`. Add a **new window** with `effectiveFrom` and close the old one with `effectiveTo`. Never edit an old window’s value unless it was wrong. Cite the circular or official page in `source`, and add a test either side of the change date.

### A new broker
Open a “New broker export” issue first. You’ll need the exact header row and value formats from **real** exports, recorded in `docs/API_CONTRACT.md`, plus a synthetic fixture that mirrors the format. Brokerage differs per broker, so the rate table needs to support that too.

### Reporting a wrong number
Use the “Accuracy report” issue template. Share **only the percentage difference** and the date range, never amounts, symbols or files.

## Commits and PRs

- Keep commits focused, and explain *why* in the message.
- Fill in the PR template, including the checklist.
- Docs and code change together. A PR that changes behaviour updates the doc that describes it.

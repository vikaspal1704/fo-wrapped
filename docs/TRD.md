# Technical Requirements Document (TRD)

**Product:** F&O Wrapped  
**Version:** 1.0

---

## 1. Language & runtime

- **TypeScript 5.x**, `"strict": true`, `noUncheckedIndexedAccess: true`
- Runs entirely in the browser: evergreen Chrome/Edge/Firefox, Android Chrome, iOS Safari 16+
- **Node 22.12+** for tooling only (build, tests, local verification harness); Vitest 5 requires it
- **TypeScript 5.9** is pinned: typescript-eslint does not support TypeScript 7 yet
- No backend, no serverless functions

## 2. Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Build | **Vite** | Static output to `dist/` |
| UI | **React 18+** | Function components + hooks; no global state library required |
| Styling | CSS Modules or plain CSS | No runtime CSS-in-JS |
| Validation | **Zod** | Every input row is parsed through a schema |
| CSV | **PapaParse** | Runs inside the worker |
| XLSX | **SheetJS (`xlsx`)** | Install from the official SheetJS CDN tarball (`https://cdn.sheetjs.com/`); the npm-registry `xlsx` package is outdated |
| Worker | Native **Web Worker** (`new Worker(new URL(..., import.meta.url), { type: 'module' })`) | Typed message protocol in `API_CONTRACT.md` §6 |
| Image export | **html-to-image** | Renders the card DOM to PNG |
| Unit tests | **Vitest** | Engine, parsers, charges, cards |
| E2E tests | **Playwright** | Upload → cards → share/clear, privacy (no network) |
| Lint / format | ESLint + Prettier | |
| Hosting | **GitHub Pages** | Deployed by GitHub Actions |
| Package manager | **npm** (`package-lock.json` committed) | |

No other runtime dependencies without updating this table.

## 3. Repository layout

```
fo-wrapped/
├── AGENTS.md
├── LICENSE
├── README.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .github/workflows/
│   ├── ci.yml                 # lint, typecheck, unit, e2e, build
│   └── pages.yml              # deploy dist/ to GitHub Pages on main
├── src/
│   ├── main.tsx
│   ├── app/                   # screens: Landing, Progress, Cards, Error
│   ├── cards/                 # one component per card + SummaryCard
│   ├── share/                 # image export + Web Share fallback
│   ├── worker/
│   │   ├── analysis.worker.ts # entry: receives files, posts progress/result
│   │   └── protocol.ts        # WorkerRequest / WorkerResponse types
│   └── engine/                # PURE: no DOM, no React, no I/O
│       ├── index.ts           # public engine API (re-exports)
│       ├── money.ts           # paise helpers
│       ├── time.ts            # IST parsing / bucketing
│       ├── parse/
│       │   ├── tradebook.ts   # header detection + Zod row schema
│       │   ├── pnlStatement.ts
│       │   └── symbol.ts      # Zerodha tradingsymbol → Instrument
│       ├── merge.ts           # merge files + dedupe by trade_id
│       ├── roundTrips.ts      # FIFO builder
│       ├── positions.ts       # open / settled-at-expiry classification
│       ├── charges/
│       │   ├── rates.ts       # versioned rate config
│       │   └── calculate.ts
│       ├── cards.ts           # card metrics
│       └── config/
│           ├── samvat.ts      # Samvat year boundaries
│           └── expiries.ts    # expiry-date overrides (holiday shifts)
├── tests/
│   ├── fixtures/              # SYNTHETIC files only — never real accounts
│   ├── unit/
│   └── e2e/
├── scripts/
│   └── verify-real.ts         # local-only launch-gate harness (see §9)
└── docs/
```

Rule: **`src/engine/` must not import React, the DOM, or anything from `src/app` / `src/cards`.** It must be runnable in Node for tests and the verification harness.

## 4. Numeric model

| Quantity | Type | Rule |
|----------|------|------|
| Money | `number` holding **integer paise** (`Paise` branded type) | Parse price strings directly into paise (`"123.45"` → `12345`). Never `parseFloat(price) * 100`. |
| Quantity | integer `number` | Units (not lots). |
| Value | `qty × pricePaise` | Must stay below `Number.MAX_SAFE_INTEGER`; assert and fail loudly otherwise. |
| Rates | rational `{ num: number; den: number }` | e.g. 0.03% = `{ num: 3, den: 10000 }`. Rounding is done once per charge per the rule in the rate config. |
| Percentages shown in UI | computed at render time | Engine returns raw paise values; UI formats. |

Console exports prices and quantities with 6 decimal places (`152.350000`, `20.000000`). Parse the string directly: a price whose 3rd–6th decimal digits are not all `0` is a validation error, and so is a quantity with any non-zero fractional digit. Equity F&O ticks are ₹0.05. IDs (`trade_id`, `order_id`) stay strings, because `order_id` can be 19 digits.

## 5. Time model

- Source timestamps are wall-clock **IST** strings. Parse them as IST explicitly (`+05:30`). Never rely on the device time zone.
- Store as epoch milliseconds (`number`) plus the IST calendar date string (`YYYY-MM-DD`) for day-level grouping.
- Market session for bucketing: **09:15–15:30 IST** → 25 buckets of 15 minutes. Fills outside the session (e.g. Muhurat trading) go to the nearest boundary bucket and are counted in a `outOfSessionCount` diagnostic.

## 6. Worker architecture

- The main thread reads files as `ArrayBuffer` and **transfers** them to the worker (zero-copy).
- The worker runs the whole pipeline and posts `progress` messages at each stage and at least every 2,000 rows.
- One analysis at a time. A new upload or “Clear data” calls `worker.terminate()` and creates a fresh worker.
- Errors are posted as a typed `error` message with a user-facing message; the worker never throws across the boundary.

## 7. Privacy & security

| Control | Requirement |
|---------|-------------|
| CSP | `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:` via `<meta http-equiv>` |
| Storage | No `localStorage`, `sessionStorage`, IndexedDB, cookies, or Cache API for user data. |
| Network | No `fetch` / XHR / beacon anywhere in `src/engine` or `src/worker` (enforced by ESLint `no-restricted-globals` and an e2e test). |
| Third parties | No analytics, fonts, or scripts from third-party origins. Self-host fonts. |
| Clear data | `worker.terminate()`, drop React state, `URL.revokeObjectURL` on any generated image. |
| Logging | No `console.log` of row data in production builds. |
| File names | Console file names contain the client ID (`tradebook-<CLIENT_ID>-FO.csv`). Show them only in on-screen upload status; never put them in share images, result objects that leave the worker for export, or logs. |

## 8. Charges configuration

- Lives in `src/engine/charges/rates.ts` as typed data (`ChargeRateTable`, see `API_CONTRACT.md` §4).
- Each rate has `effectiveFrom` (inclusive IST date) and optional `effectiveTo`. A fill is charged with the rate whose window contains its `trade_date`.
- A fill whose date has **no** matching rate is a hard error in tests and a visible “charges unavailable for dates before X” notice in the UI. Never fall back to a nearby rate silently.
- Every rate row carries a `source` string (URL or circular reference) and `verifiedOn` date.

## 9. Launch-gate verification harness

`scripts/verify-real.ts` runs locally against real exports that **never enter the repo**:

```bash
npm run verify:real -- --dir ../fo-wrapped-private
# expects: <dir>/<account-alias>/tradebook*.{csv,xlsx} + pnl*.xlsx
```

- Runs the engine without the P&L statement (estimated mode) and compares net P&L and charges against the P&L statement totals.
- Prints only the account alias, the percentage difference, and PASS/FAIL. **No trade data, symbols, or amounts are printed.**
- `.gitignore` excludes `*-private/`, `private-fixtures/`, and `verification-report*.json`.

## 10. CI (GitHub Actions)

`.github/workflows/ci.yml` MUST, on `push` and `pull_request`:

1. `npm ci`
2. `npm run lint` and `npm run typecheck`
3. `npm test` (Vitest, all required tests, no `.skip`), then `npm run test:tz` (the same suite under `TZ=America/New_York`)
4. `npx playwright test` (Chromium is enough in CI)
5. `npm run build`

`.github/workflows/pages.yml` deploys `dist/` to GitHub Pages on push to `main`. Vite `base` must be `/fo-wrapped/` for the project page.

## 11. Non-requirements (tech)

- No server, database, auth, or API routes
- No service worker / offline mode in v1
- No i18n framework (English copy only in v1; ₹ and Indian digit grouping via `Intl.NumberFormat('en-IN')`)
- No `Decimal` library; integer paise is sufficient

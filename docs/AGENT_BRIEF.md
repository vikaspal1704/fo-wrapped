# Agent Brief — F&O Wrapped

**Primary instructions for AI coding agents.**  
Author: Vikas Pal · Repo: https://github.com/vikaspal1704/fo-wrapped

Read this file completely before writing code.

---

## 1. Mission

Build a static, browser-only web app that turns a Zerodha Console F&O tradebook into 8 honest, shareable “Wrapped” cards. It must match [`API_CONTRACT.md`](API_CONTRACT.md) exactly, pass the acceptance tests, and **never send user data anywhere**.

**This repository may currently be docs-only.** You implement the code. Do not change engine semantics, card formulas, or privacy rules that are already locked in the docs.

---

## 2. Read order (mandatory)

1. [`PRD.md`](PRD.md): goals, MUST requirements, and **§10 decisions**
2. [`TRD.md`](TRD.md): stack, layout, numeric/time model, privacy controls, CI
3. [`API_CONTRACT.md`](API_CONTRACT.md): input schemas, types, errors, functions, worker protocol
4. [`ARCHITECTURE.md`](ARCHITECTURE.md): pipeline, FIFO worked example, charges, card formulas
5. [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md): launch gate and binary done checklist
6. [`TEST_PLAN.md`](TEST_PLAN.md): required test names and edge cases

Then implement. If the docs conflict, prefer **API_CONTRACT → ARCHITECTURE → PRD**.

---

## 3. Implementation phases

### Phase 0 — Verify inputs (before any parser code)

- Get 3–4 real Console F&O tradebook exports (CSV + XLSX, different years) and one P&L statement **from the owner**. Do not commit them.
- Record the confirmed headers and layout in `API_CONTRACT.md` §2–§3.
- Build **synthetic** fixtures in `tests/fixtures/` that reproduce the real structure.

### Phase 1 — Engine (pure, `src/engine/`)

- `money.ts`, `time.ts`: parsing strings to paise and to IST epoch values
- `parse/`: every broker’s file (`readFile.ts` routes by header row), P&L statement, symbol → instrument
- `merge.ts` → `roundTrips.ts` → `positions.ts` → `charges/` → `cards.ts` → `analyze()`
- `test_worked_example_canonical` first, then the rest of TEST_PLAN §2

### Phase 2 — Worker + UI

- `src/worker/`: protocol, progress, error mapping
- Screens: Landing (button, 3-step Console guide, on-device privacy line) → Progress → 8 cards → Summary with Download / Share → Clear data
- Mobile-first, story-style navigation

### Phase 3 — Privacy & e2e

- CSP meta tag, ESLint bans on network and storage APIs in `src/engine` and `src/worker`
- Playwright tests from TEST_PLAN §3

### Phase 4 — CI, Pages, README

- `ci.yml` + `pages.yml` per TRD §10
- Update the README status and add the live link

### Phase 5 — Launch gate (owner + agent)

- `scripts/verify-real.ts`; the owner runs it locally on ≥ 5 accounts
- Fix discrepancies (usually rate windows or rounding) until every account is within ±0.5%

---

## 4. Do

- Use integer paise and IST everywhere in the engine
- Validate every row with Zod and fail with the exact error types in API_CONTRACT §5
- Show *estimated*, *before charges*, and exclusion notes on the cards themselves
- Keep `src/engine` pure and runnable in Node
- Map every PRD MUST to a test
- Open a PR to `main` from a feature branch and cite the acceptance checklist in it

## 5. Don’t

- Don’t upload, log, persist, or `fetch` anything containing user data
- Don’t add analytics, trackers, third-party fonts, or CDNs at runtime
- Don’t guess a column, symbol, expiry, rate, or settlement price. Reject the input, or exclude it with a notice
- Don’t use `parseFloat` / floating-point numbers for money
- Don’t use the device time zone or `Date.now()` in the engine
- Don’t show percentile or “better than X%” claims
- Don’t commit real tradebooks or P&L statements, even anonymised ones
- Don’t change the public engine API without updating API_CONTRACT and the tests in the same change
- Don’t launch before the ±0.5% gate passes

---

## 6. Definition of done

Copy from ACCEPTANCE_CRITERIA:

```
DONE when:
1. Section B criteria pass via section C tests.
2. Section D non-functional checks pass.
3. Section E CI green and Pages deployed.
4. Section F docs match the implementation.
5. No public engine API divergence from API_CONTRACT.md.

LAUNCH only when DONE and section A (launch gate) passes.
```

---

## 7. Quick reference — engine API

```ts
import { readBrokerFile, analyze, RATES } from './engine';

const file = await readBrokerFile(name, bytes);          // any supported broker; throws FoWrappedError
// file.kind === 'fills' → { broker, fills, charges }; 'pnlStatement' → { statement }
const result = analyze({
  tradebooks: [file.fills],
  reportedCharges: file.charges ? [{ broker: file.broker, records: file.charges }] : [],
  pnlStatements: [],                                     // Zerodha P&L statements, optional
  rates: RATES,
  siteUrl: 'https://vikaspal1704.github.io/fo-wrapped/',
});
result.totals.source;          // 'ESTIMATED' | 'BROKER' | 'PNL_STATEMENT' | 'MIXED'
result.cards.revengeTrades;    // { status: 'OK', data: { count, combinedPnlPaise, … } } | INSUFFICIENT_DATA
```

Full types: [`API_CONTRACT.md`](API_CONTRACT.md). Worked example: [`ARCHITECTURE.md`](ARCHITECTURE.md) §4.3.

---

## 8. Git / PR expectations

- Suggested branches: `feat/engine`, `feat/ui`, `feat/privacy-e2e`, `chore/ci-pages`
- Keep commits focused (engine → tests → worker → UI → CI)
- Every PR description lists the acceptance items it covers
- Do not force-push `main`

---

## 9. Out of scope reminder

No backend, accounts, or storage. No brokers other than Zerodha, no equity, currency, or commodity data, and no tax computation. No percentiles or advice.  
Correct, honest numbers matter more than features.

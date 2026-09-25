# API Contract

**Normative.** Implementations MUST match these types and behaviours.

> **Implementation status (v0.1):** everything here is implemented except the **P&L statement** (§3) and **XLSX** tradebooks, which wait on verified sample exports. Until they land, `Totals.source` is always `'ESTIMATED'` and `analyze()` takes no `pnlStatement`. The TypeScript sources in `src/engine/` are the exact shapes; this document explains them.  
Import path: `src/engine/index.ts` (re-exports everything below). The engine is pure TypeScript with no DOM access.

---

## 1. Primitive types

```ts
/** Integer number of paise. ₹1 = 100. Never fractional. */
export type Paise = number & { readonly __brand: 'Paise' };

/** Calendar date in IST, 'YYYY-MM-DD'. */
export type IstDate = string & { readonly __brand: 'IstDate' };

/** Epoch milliseconds. Always derived from an IST wall-clock string. */
export type EpochMs = number;

export type Side = 'BUY' | 'SELL';
export type Exchange = 'NSE' | 'BSE';
export type InstrumentKind = 'FUT' | 'CE' | 'PE';
```

---

## 2. Input: Zerodha Console tradebook

> **Verification status**
> - ✅ **CSV, Sep 2026 export:** header row and value formats confirmed against one real Console F&O tradebook (NSE + BSE rows). Recorded below.
> - ⏳ **Still needed before coding the parser:** 2–3 more exports, including **XLSX** and an **older year** (to catch header variants), and one **P&L statement** (§3).
>
> Confirmed CSV header row, in this exact order:
>
> ```
> symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date
> ```

| Header (expected) | Required | Zod rule | Maps to |
|-------------------|----------|----------|---------|
| `symbol` | yes | non-empty string, parses via §2.2 | `Fill.instrument` |
| `isin` | column required | empty for F&O; ignored | — |
| `trade_date` | yes | `YYYY-MM-DD` | `Fill.tradeDate` |
| `exchange` | yes | `NSE` \| `BSE` | `Fill.exchange` |
| `segment` | yes | `FO`; anything else → `UnsupportedSegmentError` (§5) | — |
| `series` | column required | empty for F&O; ignored | — |
| `trade_type` | yes | `buy` \| `sell` (lowercase in exports; compare case-insensitively) | `Fill.side` |
| `auction` | yes | `true` \| `false` | `Fill.auction` |
| `quantity` | yes | decimal string with 6 dp (e.g. `20.000000`); must be a **positive whole number**, so all fractional digits are `0` | `Fill.qty` |
| `price` | yes | decimal string with 6 dp (e.g. `152.350000`); must be **exact paise**, so digits after the 2nd decimal place are `0` | `Fill.pricePaise` |
| `trade_id` | yes | digits only; **keep as string** | `Fill.tradeId` |
| `order_id` | yes | digits only, up to 19 seen (e.g. `1799000000000000123`); **keep as string**. It exceeds `Number.MAX_SAFE_INTEGER` | `Fill.orderId` |
| `order_execution_time` | yes | `YYYY-MM-DDTHH:mm:ss`, no offset, IST | `Fill.executedAt` |
| `expiry_date` | yes (present in CSV, **including weekly contracts**) | `YYYY-MM-DD` | `Instrument.expiry` |

CSV reading rules (confirmed): no preamble rows; comma-separated; a trailing empty line is ignored; blank lines elsewhere are an error. Parse with PapaParse `dynamicTyping: false` so no value is coerced to a number before Zod sees it.

**Never convert `trade_id` or `order_id` to `number`.** A 19-digit `order_id` silently loses precision, which would merge distinct orders for brokerage.

Header matching: trim, lowercase, and compare exactly. A small **explicit** alias map is allowed (e.g. `"trade type" → "trade_type"`) only for variants seen in real exports and recorded here. No fuzzy matching.

XLSX: Console puts a preamble (client id, date range) above the header row. Find the header row by locating the first row that contains **all** required headers, and give up after 30 rows.

### 2.1 Parsed fill

```ts
export interface Fill {
  tradeId: string;
  orderId: string;
  instrument: Instrument;
  exchange: Exchange;
  side: Side;
  auction: boolean;
  qty: number;           // positive integer, units
  pricePaise: Paise;     // positive
  tradeDate: IstDate;
  executedAt: EpochMs;
  sourceFile: string;    // file name, for error messages only
  sourceRow: number;     // 1-based row in that file
}
```

### 2.2 Instrument (from Zerodha trading symbol)

```ts
export interface Instrument {
  key: string;             // canonical: `${exchange}:${tradingSymbol}` — the FIFO grouping key
  tradingSymbol: string;   // e.g. NIFTY24NOV24000CE
  underlying: string;      // e.g. NIFTY, BANKNIFTY, RELIANCE
  kind: InstrumentKind;
  strikePaise: Paise | null;  // null for FUT
  expiry: IstDate;
}
```

Symbol shapes (✅ = seen in a real export):

| Shape | Example | Status |
|-------|---------|--------|
| Weekly option | `NIFTY2692223600CE`, `SENSEX2691074900CE` (`UNDERLYING` + `YY` + month code `1–9,O,N,D` + `DD` + strike + `CE`/`PE`) | ✅ NSE and BSE |
| Monthly option | `NIFTY26SEP23500CE` (`YY` + `MMM`) | ⏳ verify |
| Monthly future | `NIFTY26SEPFUT` | ⏳ verify |

**Expiry source:** the `expiry_date` column is authoritative. For weekly symbols, the date encoded in the symbol MUST equal `expiry_date`. A mismatch → `UnknownInstrumentError` naming the symbol. The expiry calendar config (`config/expiries.ts`) is only a fallback for export formats that lack `expiry_date` (none seen yet).

Parsing the underlying: take the longest leading run of `A–Z` / `&` / `-` characters before the 2-digit year. Strike = the digits between the date part and `CE`/`PE`. A symbol matching none of the shapes → `UnknownInstrumentError`. Never guess an expiry.

---

## 3. Input: Console P&L statement (optional)

> **Verify before coding** against real exports. Record the confirmed layout here.

```ts
export interface PnlStatement {
  periodFrom: IstDate;
  periodTo: IstDate;
  realizedPnlPaise: Paise;      // broker's realized P&L for F&O
  charges: ChargesBreakdown;    // broker's own charges
  netRealizedPnlPaise: Paise;   // realized − total charges, as reported (or computed if not reported)
  perSymbol: { tradingSymbol: string; realizedPnlPaise: Paise }[] | null;  // null if the export has no per-symbol rows
}
```

Rules:
- The statement’s period MUST overlap the tradebook’s date range; otherwise reject it with a message showing both ranges.
- **Settled-at-expiry valuation (PRD F-EN-2):** for a `SETTLED_AT_EXPIRY` position, if `perSymbol` has a row for its symbol, its value = that row’s `realizedPnlPaise` − Σ `grossPnlPaise` of round trips already closed by trades in the same symbol. It then becomes a `RoundTrip` with `exitKind: 'EXPIRY'`, `exitAt` = expiry date 15:30 IST. If `perSymbol` is `null` or has no row for it, the position stays excluded from per-trade cards, and a warning says so. Totals (cards 1–2) still use the statement totals, which already include it.
- If the statement’s period does not cover the whole tradebook range, cards 1–2 show the statement’s totals **with the period stated** and the note *“P&L statement covers {from}–{to}; tradebook covers {from}–{to}.”*

---

## 4. Charges

```ts
export interface ChargesBreakdown {
  brokerage: Paise;
  stt: Paise;
  exchangeTxn: Paise;
  sebi: Paise;
  stampDuty: Paise;
  gst: Paise;
  total: Paise;          // sum of the above
}

export interface Rational { num: number; den: number; }

export interface RateWindow<T> {
  effectiveFrom: IstDate;       // inclusive
  effectiveTo?: IstDate;        // inclusive; absent = open-ended
  value: T;
  source: string;               // URL / circular reference
  checked: 'primary' | 'secondary';  // launch requires 'primary' everywhere
  checkedOn: IstDate;
}

export interface ExchangeTxnRates {
  indexOptions: RateWindow<Rational>[];  // on premium
  stockOptions: RateWindow<Rational>[];  // on premium
  futures: RateWindow<Rational>[];       // on value
}

export interface ChargeRateTable {
  version: string;              // bump on any change, e.g. '2026.09.1'
  indexUnderlyings: Record<Exchange, readonly string[]>;  // charged at index-option rates
  brokerage: {
    optionsPerOrderPaise: RateWindow<Paise>[];
    futuresPerOrder: RateWindow<{ capPaise: Paise; pct: Rational }>[];  // min(cap, pct × value)
  };
  stt: {
    optionsSellOnPremium: RateWindow<Rational>[];
    futuresSell: RateWindow<Rational>[];
  };
  exchangeTxn: Record<Exchange, ExchangeTxnRates>;
  sebi: RateWindow<Rational>[];        // ₹10 per crore = 1 / 1,000,000
  stampDutyBuy: {
    options: RateWindow<Rational>[];
    futures: RateWindow<Rational>[];
  };
  gst: RateWindow<Rational>[];         // on brokerage + exchangeTxn + sebi
}

export function calculateCharges(fills: readonly Fill[], rates: ChargeRateTable): ChargesBreakdown;
```

Rules:
- Brokerage is charged **per executed order per trading day**: group by `(orderId, tradeDate)`.
- Every other charge is summed per `(day, charge, rate)` and multiplied once, rounding to the nearest paise (half up) with BigInt arithmetic. GST is then applied per day to that day’s rounded brokerage + exchange + SEBI.
- A fill with no matching rate window → throw `ChargesUnavailableError` (§5). The UI shows it; never substitute another window.
- Seed values and how to verify them: [`ARCHITECTURE.md`](ARCHITECTURE.md) §6.

---

## 5. Errors

```ts
export class FoWrappedError extends Error {
  readonly userMessage: string;         // plain-language, shown in the UI
}
export class UnrecognizedFileError extends FoWrappedError {}   // not a tradebook / P&L statement
export class UnsupportedSegmentError extends FoWrappedError {}  // equity / currency / commodity file
export class RowValidationError extends FoWrappedError {
  readonly file: string; readonly row: number; readonly field: string; readonly value: string;
}
export class ConflictingDuplicateError extends FoWrappedError {} // same exchange + trade_id, different fields
export class UnknownInstrumentError extends FoWrappedError {}    // symbol/expiry cannot be determined
export class ChargesUnavailableError extends FoWrappedError {}   // no rate window for a date
export class PeriodMismatchError extends FoWrappedError {}       // P&L statement doesn't overlap
```

Required user messages (wording can be polished; meaning cannot change):

| Error | Message |
|-------|---------|
| `UnrecognizedFileError` | “{file} doesn’t look like a Zerodha Console tradebook. In Console go to Reports → Tradebook, choose segment F&O, and download CSV or XLSX.” |
| `UnsupportedSegmentError` | “{file} is an {segment} tradebook. F&O Wrapped needs the F&O segment.” |
| `RowValidationError` | “{file}, row {row}: {field} ‘{value}’ isn’t valid. The file may have been edited. Please download a fresh copy.” |
| `ConflictingDuplicateError` | “Trade {trade_id} appears in two files with different details. Please re-download both files.” |

Validation is **all-or-nothing per file**: one bad row rejects that file. Other valid files are still reported as accepted in the UI, and the user decides whether to continue without the rejected file.

---

## 6. Engine outputs

```ts
export type PositionSide = 'LONG' | 'SHORT';

export interface RoundTrip {
  id: number;                     // 1..n, ordered by exitAt then instrument key
  instrument: Instrument;
  side: PositionSide;             // LONG = opened by BUY
  entryAt: EpochMs;               // first opening fill
  exitAt: EpochMs;                // fill that returned position to flat (or expiry 15:30 IST)
  exitKind: 'TRADE' | 'EXPIRY';   // EXPIRY only when valued from the P&L statement (§3)
  exitDate: IstDate;
  qty: number;                    // total units opened (= total units closed)
  avgEntryPaise: number;          // qty-weighted; may be fractional — display only
  avgExitPaise: number;           // qty-weighted; may be fractional — display only
  grossPnlPaise: Paise;           // exact integer: Σ FIFO lot P&L
  holdingMs: number;              // qty-weighted mean FIFO lot holding time (ARCHITECTURE §4)
  fillIds: string[];              // tradeIds that contributed
}

export type UnclosedStatus = 'OPEN' | 'SETTLED_AT_EXPIRY';

export interface UnclosedPosition {
  instrument: Instrument;
  side: PositionSide;
  qty: number;
  avgEntryPaise: number;
  openedAt: EpochMs;
  status: UnclosedStatus;
}

export interface Totals {
  source: 'ESTIMATED';             // 'PNL_STATEMENT' arrives with §3
  grossPnlPaise: Paise;            // Σ roundTrip.gross
  charges: ChargesBreakdown | null;        // null when any fill has no rate window
  netPnlPaise: Paise | null;               // gross − charges.total; null with charges
  chargesUnavailableReason: string | null; // user message when charges is null
  excludedUnclosedCount: number;   // unclosed positions left out of P&L; shown on cards 1–2 when > 0
}

export interface AnalysisResult {
  engineVersion: string;
  rateTableVersion: string;
  dateRange: { from: IstDate; to: IstDate };
  samvat: string | null;           // e.g. '2081' or '2081–82'; null outside the Samvat table
  fillCount: number;
  duplicateFillsDropped: number;
  roundTrips: RoundTrip[];
  unclosed: UnclosedPosition[];
  totals: Totals;
  cards: CardSet;
  warnings: string[];              // user-facing notices (estimated charges, exclusions, out-of-session fills)
}
```

### 6.1 Cards

Every card is either computed or explicitly insufficient. `null` numbers are never shown as `0`.

```ts
export type CardResult<T> =
  | { status: 'OK'; data: T; notes: string[] }
  | { status: 'INSUFFICIENT_DATA'; reason: string };

export interface CardSet {
  theNumber: CardResult<{ netPnlPaise: Paise; totalTrades: number; tradedValuePaise: Paise; estimated: boolean }>;
  whereMoneyWent: CardResult<{ grossPnlPaise: Paise; chargesPaise: Paise; chargesPctOfGrossProfit: number | null; estimated: boolean }>;
  rightButBroke: CardResult<{ winRate: number; avgWinPaise: number; avgLossPaise: number; wins: number; losses: number }>;
  expiryDay: CardResult<{ expiryPnlPaise: Paise; expiryTrades: number; otherPnlPaise: Paise; otherTrades: number }>;
  yourClock: CardResult<{ buckets: ClockBucket[]; bestIndex: number | null; worstIndex: number | null }>;
  revengeTrades: CardResult<{ count: number; combinedPnlPaise: Paise; medianLossPaise: Paise; triggers: number }>;
  holdingTime: CardResult<{ medianWinnerMs: number; medianLoserMs: number; winners: number; losers: number }>;
  bestWorstDay: CardResult<{ best: { date: IstDate; pnlPaise: Paise }; worst: { date: IstDate; pnlPaise: Paise } }>;
  summary: { headlines: [Headline, Headline, Headline]; samvat: string | null; siteUrl: string };
}

export interface ClockBucket { startMinuteIst: number; trades: number; pnlPaise: Paise; }
export interface Headline { label: string; value: string; }
```

Formulas and thresholds: [`ARCHITECTURE.md`](ARCHITECTURE.md) §7. When charges are unavailable, cards 1–2 are `INSUFFICIENT_DATA` with the charges message, and every other card still renders.

---

## 7. Public functions

```ts
export const RATES: ChargeRateTable;   // the versioned table from src/engine/charges/rates.ts
export function parseTradebook(fileName: string, bytes: ArrayBuffer): Fill[];          // throws FoWrappedError
// parsePnlStatement(fileName, bytes): PnlStatement arrives with §3.
export function mergeFills(files: readonly Fill[][]): { fills: Fill[]; duplicatesDropped: number };
export function buildRoundTrips(fills: readonly Fill[], asOf: IstDate): { roundTrips: RoundTrip[]; unclosed: UnclosedPosition[] };
export function calculateCharges(fills: readonly Fill[], rates: ChargeRateTable): ChargesBreakdown;
export function analyze(input: {
  tradebooks: readonly Fill[][];
  rates: ChargeRateTable;
  siteUrl: string;
}): AnalysisResult;
```

- `asOf` for `buildRoundTrips` is the **last `tradeDate` in the data**, never the current date (determinism, PRD F-EN-6).
- `mergeFills` sorts output by `(executedAt, exchange, tradeId)`, comparing trade IDs numerically without converting them to numbers.

---

## 8. Worker protocol

```ts
export type WorkerRequest =
  | { type: 'analyze'; files: { name: string; bytes: ArrayBuffer }[] };   // bytes are transferred

export type WorkerResponse =
  | { type: 'progress'; stage: 'reading' | 'validating' | 'matching' | 'cards'; pct: number }
  | { type: 'fileAccepted'; name: string; rows: number }
  | { type: 'fileRejected'; name: string; message: string }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string };
```

The worker parses each file itself; the UI never inspects file contents. A rejected file is reported and skipped, and analysis continues with the accepted files (PRD D-15). If none is accepted, the worker posts `error`. The UI terminates the worker as soon as `result` or `error` arrives.

---

## 9. Behavioural invariants

1. **Conservation:** for each instrument, Σ BUY qty − Σ SELL qty = signed qty of its `UnclosedPosition` (0 if none).
2. **Flat-to-flat gross:** for every `RoundTrip`, `grossPnlPaise` = Σ sell value − Σ buy value of the quantities it contains.
3. **Totals consistency (ESTIMATED):** `totals.grossPnlPaise` = Σ `roundTrips[].grossPnlPaise`.
4. **Dedupe idempotence:** `analyze` on files `[A, B]` equals `analyze` on `[A, B, A]` (modulo `duplicateFillsDropped`).
5. **Order independence:** file order does not change any output other than diagnostics.
6. **No invented numbers:** an `UnclosedPosition` never contributes to any P&L figure. A settled position counts only after it has been valued from the P&L statement (§3), and then it is a `RoundTrip` with `exitKind: 'EXPIRY'`.

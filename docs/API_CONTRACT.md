# API Contract

**Normative.** Implementations MUST match these types and behaviours.

> **Implementation status (engine 0.3.0):** everything here is implemented, including the Zerodha **P&L statement** (§3) and the **Angel One, Upstox and Dhan** exports (§3A, [`BROKERS.md`](BROKERS.md)). Layouts were established from redacted real exports; each still needs a check against a user’s own export before launch (ACCEPTANCE §A). The TypeScript sources in `src/engine/` are the exact shapes; this document explains them.  
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
> - ✅ **XLSX layout (from redacted real Console exports, equity segment):** a preamble with `Client ID` and a `Tradebook for <segment> from … to …` title, data starting in **column B**, and headers written **Title Case with spaces** (`Trade Date`, `Order Execution Time`). Header matching normalises both forms (below).
> - ✅ **P&L statement (§3):** layout recorded from a redacted real Console F&O export.
> - ⏳ **Still needed:** a real F&O **XLSX** tradebook and an **older year** (to catch header variants).
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

Header matching: trim, lowercase, turn runs of spaces into `_`, and compare exactly. So `Trade Date` (XLSX) and `trade_date` (CSV) are the same header; that is the only variant seen in real exports. No fuzzy matching. A tradebook with every header except `expiry_date` is another segment’s tradebook and is rejected with `UnsupportedSegmentError` naming it.

XLSX: Console puts a preamble (client id, date range) above the header row. Find the header row by locating the first row that contains **all** required headers, and give up after 30 rows.

### 2.1 Parsed fill

```ts
export type BrokerId = 'zerodha' | 'angelone' | 'upstox' | 'dhan';
export type TimePrecision = 'second' | 'date';   // 'date': the export has no trade times

export interface Fill {
  broker: BrokerId;
  tradeId: string;
  orderId: string | null;  // null when the export has no order IDs (Upstox, Dhan)
  instrument: Instrument;
  exchange: Exchange;
  side: Side;
  auction: boolean;
  qty: number;             // positive integer, units
  pricePaise: Paise;       // per unit; for daily-total rows the rounded average (display only)
  valuePaise: Paise;       // exact traded value; the engine computes with this
  tradeDate: IstDate;
  executedAt: EpochMs;     // for 'date' precision, midnight IST (order set by the engine)
  timePrecision: TimePrecision;
  sourceFile: string;      // file name, for error messages only
  sourceRow: number;       // 1-based row in that file
}
```

FIFO runs per **broker + instrument** (positions at different brokers never net) and allocates exact values, so rows that are daily totals stay exact. Fills with `timePrecision: 'date'` are first combined per contract, day and side, and the side that reduces the position carried in is applied first (`prepareDateOnlyFills`, [`BROKERS.md`](BROKERS.md) §3).

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

### 2.3 XLSX tradebooks

`parseTradebookFile(fileName, bytes): Promise<Fill[]>` accepts CSV or XLSX (detected by the zip signature). Both paths go through `parseTradebookRows()`, so the header rules, Zod schema and errors are identical.

| Topic | Rule |
|-------|------|
| Reader | `read-excel-file` (the official SheetJS build can’t be installed from here, and npm’s `xlsx` 0.18 has known CVEs for crafted files) |
| Sheet | The first sheet in a recognised layout (§3A), else the first sheet with any non-empty cell |
| Header row | The first row, within the first 30, that contains every required header (exports have a preamble) |
| Numbers | Kept as the **exact text** stored in the file (`parseNumber` is the identity). A number with more than 15 integer digits, or in exponent form, was rounded by Excel when saved, so it is rejected (this protects 19-digit order IDs stored as numbers) |
| Dates | Date cells are wall-clock times with no zone. They are rounded to the nearest second (Excel stores fractional days) and formatted as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss` |
| Row numbers | 1-based spreadsheet rows (preamble included) |
| Legacy `.xls` | Plain-language error asking for CSV or XLSX |

## 3. Input: Console P&L statement (optional)

✅ Layout recorded from a redacted real Console F&O export: [`BROKERS.md`](BROKERS.md) §2.4. Recognised by its title `P&L Statement for <segment> from YYYY-MM-DD to YYYY-MM-DD`; a segment other than F&O is rejected by name.

```ts
export interface PnlStatement {
  broker: 'zerodha';
  periodFrom: IstDate;
  periodTo: IstDate;
  realizedPnlPaise: Paise;           // Console's realised P&L, before charges
  charges: ChargesBreakdown;         // by account head; clearing and IPFT go to `other`
  otherCreditDebitPaise: Paise;      // shown in a note, never netted
  perSymbol: { tradingSymbol: string; realizedPnlPaise: Paise; openQuantity: number }[];
  unmappedHeads: string[];           // account heads we don't know (added to `other`)
}
```

Rules:
- Values carry up to 4 decimals and are **rounded to the nearest paise** (`decimalToPaiseRounded`). The account heads must add up to the printed `Charges` total (1 paise of drift per head), else the file is rejected.
- `checkStatementCoverage`: the statement is rejected if there is no Zerodha tradebook, or its period doesn’t overlap the tradebook’s dates (the message shows both ranges).
- **Where it applies:** a period view uses the statement only when the view holds exactly the Zerodha trades the statement covers. It is never split across periods; elsewhere charges stay estimated with the note *“Your P&L statement covers {from} to {to}, which doesn’t match this period.”*
- When it applies: gross P&L = the other brokers’ round trips + the statement’s realised P&L; charges = the statement’s; `Totals.source = 'PNL_STATEMENT'` (or `'MIXED'` with other brokers). If the tradebook’s own P&L differs from the statement by more than 0.5%, a warning says so and the statement is used.
- **Settled-at-expiry valuation (PRD F-EN-2):** for a Zerodha `SETTLED_AT_EXPIRY` position whose expiry is inside the statement period, if `perSymbol` has a row for its symbol, its value = that row’s `realizedPnlPaise` − Σ `grossPnlPaise` of round trips already closed by trades in the same symbol within the period. It then becomes a `RoundTrip` with `exitKind: 'EXPIRY'`, `exitAt` = expiry date 15:30 IST. Without a row, it stays excluded, with a warning.

## 3A. Input: other brokers

`readBrokerFile(fileName, bytes)` reads any supported file and recognises its layout by its header row, never by the file name. Layouts, sources and limits: [`BROKERS.md`](BROKERS.md).

```ts
export type BrokerFile =
  | { kind: 'fills'; broker: BrokerId; fills: Fill[]; charges: ChargeRecord[] | null }  // null: estimate charges
  | { kind: 'pnlStatement'; statement: PnlStatement };

/** A broker's own charges for one trade, order or bill (Angel One, Dhan). */
export interface ChargeRecord {
  broker: BrokerId;
  id: string;        // stable across exports, so overlapping files count it once
  date: IstDate;
  charges: ChargesBreakdown;
}
export interface ReportedCharges { broker: BrokerId; records: ChargeRecord[] }
```

| File | Recognised by | Fills | Charges |
|------|---------------|-------|---------|
| Zerodha tradebook (CSV/XLSX) | §2 headers | one per row, to the second | estimated (Zerodha rates) |
| Zerodha P&L statement (XLSX) | title row (§3) | – | the statement’s |
| Angel One Trades History (XLSX) | its 19-column header | one per trade row, date only | Angel One’s, per row; brokerage rows (qty 0) add charges only |
| Upstox trade report (XLSX) | its 14-column header | one per row, to the second; options only | estimated (Upstox rates; orders = same contract, side and second) |
| Dhan Global Transaction Report (CSV) | its 16-column header | up to two per row (the day’s buys and sells), date only | Dhan’s, per row, checked against `Gross Amount` |
| Groww | `Unique Client Code` preamble / order-history header | rejected with a “not supported yet” message | – |

Rows from other segments (equity, commodity) in mixed files are skipped. Contracts are parsed only in the grammar seen in real exports; futures from Angel One and Upstox are rejected until seen. Dates-only brokers hide the cards that need trade times (`CardResult.code = 'NO_TRADE_TIMES'`, PRD D-22).

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
// Other rejections (a P&L statement that doesn't overlap, a Groww file, a Dhan row
// that doesn't add up, no F&O rows) are plain FoWrappedError with their own message.
```

Required user messages (wording can be polished; meaning cannot change):

| Error | Message |
|-------|---------|
| `UnrecognizedFileError` | “{file} isn’t a file we can read. We read the Zerodha tradebook and P&L statement, Angel One Trades History, the Upstox trade report and Dhan’s Global Transaction Report. See “How to download” for each broker.” |
| `UnsupportedSegmentError` | “{file} is an {segment} tradebook. F&O Wrapped needs the F&O segment.” |
| `RowValidationError` | “{file}, row {row}: {field} ‘{value}’ isn’t valid. The file may have been edited. Please download a fresh copy.” |
| `ConflictingDuplicateError` | “Trade {trade_id} appears in two files with different details. Please re-download both files.” |

Validation is **all-or-nothing per file**: one bad row rejects that file. Other valid files are still reported as accepted in the UI, and the user decides whether to continue without the rejected file.

---

## 6. Engine outputs

```ts
export type PositionSide = 'LONG' | 'SHORT';

export interface RoundTrip {
  id: number;                     // 1..n, ordered by exitAt, broker, then instrument key
  broker: BrokerId;
  timePrecision: TimePrecision;   // 'date': one contract's activity on one day (no trade times)
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
  broker: BrokerId;
  instrument: Instrument;
  side: PositionSide;
  qty: number;
  avgEntryPaise: number;
  openedAt: EpochMs;
  status: UnclosedStatus;
}

export interface Totals {
  // ESTIMATED: from published rates · BROKER: the broker's own file (§3A)
  // PNL_STATEMENT: Zerodha P&L statement (§3) · MIXED: more than one of these
  source: 'ESTIMATED' | 'BROKER' | 'PNL_STATEMENT' | 'MIXED';
  grossPnlPaise: Paise;            // Σ roundTrip.gross (Zerodha part from the statement when it applies)
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
  cards: CardSet;                  // totals, cards and warnings are those of the 'all' view
  warnings: string[];              // user-facing notices (estimated charges, exclusions, out-of-session fills)
  views: PeriodView[];             // views[0] is 'all'; then Samvat, calendar and financial years with trades
  defaultViewId: string;           // latest Samvat year with ≥ 10 closed trades, else 'all'
}

export interface Period {
  id: string;                      // 'all' | 'samvat-2082' | 'cy-2026' | 'fy-2026' (FY 2026-27)
  kind: 'ALL' | 'SAMVAT' | 'CALENDAR' | 'FY';
  label: string;                   // localised, e.g. 'Samvat 2082' / 'संवत 2082'
  from: IstDate;
  to: IstDate;
}

export interface PeriodView {
  period: Period;
  title: string;                   // summary heading for the period
  dateRange: { from: IstDate; to: IstDate };
  roundTripCount: number;
  fillCount: number;
  totals: Totals;
  cards: CardSet;
  warnings: string[];
  comparison: Comparison | null;   // vs the previous period of the same kind, when both have trades
}

export interface Comparison {
  previous: Period;
  rows: {
    key: 'netPnl' | 'grossPnl' | 'charges' | 'trades' | 'winRate' | 'revengeTrades' | 'loserHoldMs';
    label: string;
    unit: 'paise' | 'count' | 'ratio' | 'ms';
    current: number | null;        // null = not enough data (shown as —, never 0)
    previous: number | null;
  }[];
}
```

View rules (which trades and charges fall in a period): [`ARCHITECTURE.md`](ARCHITECTURE.md) §7.2.

### 6.1 Cards

Every card is either computed or explicitly insufficient. `null` numbers are never shown as `0`.

```ts
export type CardResult<T> =
  | { status: 'OK'; data: T; notes: string[] }
  | { status: 'INSUFFICIENT_DATA'; reason: string; code?: 'NO_TRADE_TIMES' };  // the UI hides NO_TRADE_TIMES cards (PRD D-22)

export interface CardSet extends ExtraCards {   // ExtraCards: ARCHITECTURE §7.3
  theNumber: CardResult<{ netPnlPaise: Paise; totalTrades: number; tradedValuePaise: Paise; estimated: boolean }>;
  whereMoneyWent: CardResult<{ grossPnlPaise: Paise; chargesPaise: Paise; chargesPctOfGrossProfit: number | null; estimated: boolean }>;
  rightButBroke: CardResult<{ winRate: number; avgWinPaise: number; avgLossPaise: number; wins: number; losses: number }>;
  expiryDay: CardResult<{ expiryPnlPaise: Paise; expiryTrades: number; otherPnlPaise: Paise; otherTrades: number }>;
  yourClock: CardResult<{ buckets: ClockBucket[]; bestIndex: number | null; worstIndex: number | null }>;
  revengeTrades: CardResult<{ count: number; combinedPnlPaise: Paise; medianLossPaise: Paise; triggers: number }>;
  holdingTime: CardResult<{ medianWinnerMs: number; medianLoserMs: number; winners: number; losers: number }>;
  bestWorstDay: CardResult<{ best: { date: IstDate; pnlPaise: Paise }; worst: { date: IstDate; pnlPaise: Paise } }>;
  summary: { headlines: [Headline, Headline, Headline]; headlineOptions: Headline[]; samvat: string | null; periodTitle: string; siteUrl: string };
  // headlineOptions: every honest stat, defaults first; the user may pick any 3 for the image.
}

export interface ExtraCards {
  buyerVsSeller: CardResult<{ buyerPnlPaise: Paise; buyerTrades: number; sellerPnlPaise: Paise; sellerTrades: number }>;
  underlyings: CardResult<{ best: UnderlyingStat; worst: UnderlyingStat; split: { indexPnlPaise: Paise; indexTrades: number; stockPnlPaise: Paise; stockTrades: number } | null }>;
  busyDays: CardResult<{ busyThreshold: number; busyDays: number; busyAvgPnlPaise: number; otherDays: number; otherAvgPnlPaise: number }>;
  weekday: CardResult<{ days: WeekdayStat[]; best: WeekdayStat | null; worst: WeekdayStat | null }>;
  positionSize: CardResult<{ medianEntryValuePaise: number; big: SizeGroup; small: SizeGroup }>;
  chargesDrag: CardResult<{ chargesPaise: Paise; avgWinPaise: number; winsToCover: number; chargesPerTradePaise: number }>;
}

export interface ClockBucket { startMinuteIst: number; trades: number; pnlPaise: Paise; }
export interface Headline { label: string; value: string; }
```

Formulas and thresholds: [`ARCHITECTURE.md`](ARCHITECTURE.md) §7. When charges are unavailable, cards 1–2 are `INSUFFICIENT_DATA` with the charges message, and every other card still renders.

---

## 7. Public functions

```ts
export const RATES: ChargeRateTable;   // the versioned table from src/engine/charges/rates.ts
export function parseTradebook(fileName: string, bytes: ArrayBuffer): Fill[];                    // CSV only; throws FoWrappedError
export function parseTradebookFile(fileName: string, bytes: ArrayBuffer): Promise<Fill[]>;      // CSV or XLSX (§2.3)
export function withLocale<T>(locale: 'en' | 'hi', fn: () => T | Promise<T>): Promise<T>;       // engine strings in that language
export function readBrokerFile(fileName: string, bytes: ArrayBuffer): Promise<BrokerFile>;      // any supported file (§3A)
export function parsePnlStatement(fileName: string, bytes: ArrayBuffer): Promise<PnlStatement>; // §3
export function checkStatementCoverage(fileName: string, st: PnlStatement, zerodhaTradeDates: readonly IstDate[]): void;
export function mergeFills(files: readonly Fill[][]): { fills: Fill[]; duplicatesDropped: number };
export function buildRoundTrips(fills: readonly Fill[], asOf: IstDate): { roundTrips: RoundTrip[]; unclosed: UnclosedPosition[] };
export function calculateCharges(fills: readonly Fill[], rates: ChargeRateTable): ChargesBreakdown;
export function analyze(input: {
  tradebooks: readonly Fill[][];
  reportedCharges?: readonly ReportedCharges[];  // brokers whose files carry charges (never estimated)
  pnlStatements?: readonly PnlStatement[];       // Zerodha P&L statements (§3)
  rates: ChargeRateTable;
  siteUrl: string;
}): AnalysisResult;
```

- `asOf` for `buildRoundTrips` is the **last `tradeDate` in the data**, never the current date (determinism, PRD F-EN-6).
- Every user-facing engine string (notes, reasons, warnings, labels, errors) comes from `engine/i18n.ts` in the current locale. Numbers never depend on the locale.
- `mergeFills` dedupes by `broker + exchange + tradeId` and sorts output by `(executedAt, broker, exchange, tradeId)`, comparing trade IDs numerically without converting them to numbers.

---

## 8. Worker protocol

```ts
export type WorkerRequest =
  | { type: 'analyze'; files: { name: string; bytes: ArrayBuffer }[] };   // bytes are transferred

export type WorkerResponse =
  | { type: 'progress'; stage: 'reading' | 'validating' | 'matching' | 'cards'; pct: number }
  | { type: 'fileAccepted'; name: string; broker: BrokerId; rows: number; statement?: { from: IstDate; to: IstDate } }
  | { type: 'fileRejected'; name: string; message: Localized }
  | { type: 'result'; results: Record<'en' | 'hi', AnalysisResult> }   // analysed once per language
  | { type: 'error'; message: Localized };

type Localized = Record<'en' | 'hi', string>;
```

The worker reads each file itself with `readBrokerFile`; the UI never inspects file contents. P&L statements are accepted after the tradebooks, once `checkStatementCoverage` passes. A rejected file is reported and skipped, and analysis continues with the accepted files (PRD D-15). If none is accepted, the worker posts `error`. The UI terminates the worker as soon as `result` or `error` arrives, and keeps one fresh, empty spare worker ready (ARCHITECTURE §8).

---

## 9. Behavioural invariants

1. **Conservation:** for each instrument, Σ BUY qty − Σ SELL qty = signed qty of its `UnclosedPosition` (0 if none).
2. **Flat-to-flat gross:** for every `RoundTrip`, `grossPnlPaise` = Σ sell value − Σ buy value of the quantities it contains.
3. **Totals consistency (ESTIMATED):** `totals.grossPnlPaise` = Σ `roundTrips[].grossPnlPaise`.
4. **Dedupe idempotence:** `analyze` on files `[A, B]` equals `analyze` on `[A, B, A]` (modulo `duplicateFillsDropped`).
5. **Order independence:** file order does not change any output other than diagnostics.
6. **No invented numbers:** an `UnclosedPosition` never contributes to any P&L figure. A settled position counts only after it has been valued from the P&L statement (§3), and then it is a `RoundTrip` with `exitKind: 'EXPIRY'`.

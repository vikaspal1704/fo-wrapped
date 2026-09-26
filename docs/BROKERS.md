# Broker exports: research and support matrix

**Last updated:** 2026-09-26 · Roadmap item X1 · Owner: Vikas Pal

The engine can only be as honest as the files it reads. This page records what each broker’s F&O export actually contains, where that knowledge came from, and what F&O Wrapped can and can’t work out from it. A format is **never guessed**. A parser accepts only the layout recorded here and rejects anything else with a plain-language message.

---

## 1. How the formats were established

| Source | What it gave | Trust |
|--------|--------------|-------|
| The owner’s own Zerodha F&O tradebook (Sep 2026) | Zerodha CSV headers and value formats | **Primary**: a real export |
| Redacted real exports in the public test fixtures of [VYUHA-LOG](https://github.com/Thejesh-k463/VYUHA-LOG) (`tests/fixtures/redacted/`), read on 2026-09-26 | Sheet names, preambles, header rows, cell types and value grammar for Zerodha Console P&L, Angel One Trades History, Upstox trade report, Dhan Global Transaction Report, and Groww order history and P&L | **Real layouts; values redacted.** Used for structure only. No file or code was copied (the repository has no licence), and our fixtures are synthetic. |
| VYUHA-LOG parser comments on Upstox F&O rows (“verified 2026-09-16 on a populated report”) | Upstox option grammar | Secondary: another project’s notes |
| Broker help pages and API docs ([Groww Trade API](https://groww.in/trade-api/docs), [Groww F&O P&L report](https://groww.in/help/stocks,-f&o,-ipo-&-mtf/sx-reports/what-is-a-f-o-p-l-report--10)) | Where the reports live; API field names | Context only. The API is **not** used (ROADMAP P1: no broker connections) |
| Brokerage pages and news ([Upstox](https://upstox.com/brokerage-charges/)) | Brokerage rates for estimates | Secondary until checked against primary sources |

Every parser still needs a check against a real export from a user before launch (ACCEPTANCE §A).

---

## 2. What each export contains

| | Zerodha tradebook | Zerodha Console P&L | Angel One Trades History | Upstox trade report | Dhan Global Transaction Report | Groww |
|---|---|---|---|---|---|---|
| **File** | CSV / XLSX | XLSX, sheet `F&O` | XLSX, sheet `TradesAndCharges` | XLSX, sheet `TRADE` | CSV | XLSX |
| **One row is** | a fill | a contract (totals) | a fill (plus separate brokerage rows) | a fill | a contract **per day** (totals) | an order (stocks only) |
| **Trade time** | to the second | – | **date only** | to the second (`Trade Time`) | **date only** | to the minute |
| **Order ID** | yes | – | yes | **no** | no | exchange order ID |
| **Broker’s own charges** | no | **yes** (by head, incl. IPFT and clearing) | **yes**, per row | no | **yes**, per row | – |
| **F&O rows seen in a real file** | yes | yes | options (`OPTIDX`, `OPTSTK`, `BSXOPT`) | options (`European Call/Put`) | options and futures (`OPT …`, `FUT …`) | **no** |
| **Supported in F&O Wrapped** | ✅ | ✅ (P&L statement) | ✅ beta | ✅ beta, options only | ✅ beta | ❌ recognised, not supported yet |

### 2.1 Angel One: Trades History

- **Where:** Angel One app → Reports → Trades History → download XLSX.
- **Layout:** a preamble (client code, download date, date range, a charges summary), then a `TradeBook And Charges` title, then the header row:
  `Scrip/Contract | Buy/Sell | Buy Price | Sell Price | Quantity | Brokerage | GST | STT | Sebi Tax | Exchange Turnover Charges | Stamp Duty | Other Charges | IPFT Charges | Order Type | Segment | Exchange | Order ID | Trade ID | Date`
- **Rows:** `Segment` = `FUTURES` for F&O (`CAPITAL` = equity, skipped). The price sits in `Buy Price` or `Sell Price` depending on side. `Date` is a date cell with no time.
- **Brokerage rows:** a separate row per order with `Quantity` 0, an empty `Trade ID`, and the order’s brokerage and GST.
- **Contracts:** `OPTIDX NIFTY Aug 25 2026 24150.00 PE (BT)`, `OPTSTK ICICIBANK Sep 29 2026 1550.00 CE (BT)`, `BSXOPT SENSEX Aug 27 2026 77600.00 CE (BT)`. Futures (`FUTIDX` / `FUTSTK`) have not been seen, so they are rejected.
- **Footer:** `NOTE: Data Accurate Till | <date>`.

### 2.2 Upstox: trade report

- **Where:** Upstox → Reports → Trade → download XLSX.
- **Layout:** a 10-row preamble (company, UCC, name, PAN, `Report Time Period`, `Generated On`), then:
  `Date | Company | Amount | Exchange | Segment | Scrip Code | Instrument Type | Strike Price | Expiry | Trade Num | Trade Time | Side | Quantity | Price`
- **Options:** `Instrument Type` = `European Call` / `European Put`; `Strike Price` is a number; `Expiry` is `dd-mm-yyyy`; `Company` holds the underlying; SENSEX appears as BSE’s contract code `BSX` on exchange `FOB`.
- **Not seen:** futures rows, and NSE F&O exchange and segment labels. Futures are rejected; an option row is accepted on its `Instrument Type`, whatever the exchange label, with BSE detected by `FOB` or `BSX`.
- **No order IDs**, so brokerage (per executed order) is estimated by treating fills of the same contract and side in the same second as one order, and labelled *estimated*.

### 2.3 Dhan: Global Transaction Report

- **Where:** Dhan web → Reports → Global Transaction Report → download CSV.
- **Layout:** `Global transction report,From dd-mm-yyyy to dd-mm-yyyy` (sic), 5 preamble lines, then:
  `Date,Scrip Name,Exchange,Bill No.,Buy Qty.,Buy Value,Sell Qty.,Sell Value,Brokerage,GST,STT,SEBI Fees,Stamp Duty,Txn. Charges,Oth. Charges,Gross Amount`
- **Rows:** one row per contract per day, totals only; `Date` is `dd-mm-yyyy 00:00`. `OPT NIFTY 07 Apr 2026 23000 CE`, `OPT SENSEX 20 Aug 2026 77600 CE` (BSE), `FUT WIPRO 28 Apr 2026`. Equity and MCX rows are skipped.
- **Footer:** `Net P&L,…,Brokerage,…,Gross P&L,…,Total Charges,…` and a `NOTE : This sheet was downloaded at …` line.

### 2.4 Zerodha: Console P&L statement

- **Where:** Console → Reports → P&L → segment F&O → download XLSX.
- **Layout:** sheet `F&O`, with data starting in column B. `Client ID`, `P&L Statement for F&O from YYYY-MM-DD to YYYY-MM-DD`, then `Summary` (`Charges`, `Other Credit & Debit`, `Realized P&L`, `Unrealized P&L`), then `Charges` by `Account Head` (`Brokerage - Z`, `Exchange Transaction Charges - Z`, `Clearing Charges - Z`, `Central GST - Z`, `State GST - Z`, `Integrated GST - Z`, `Securities Transaction Tax - Z`, `SEBI Turnover Fees - Z`, `Stamp Duty - Z`, `IPFT`), then a per-symbol table:
  `Symbol | ISIN | Quantity | Buy Value | Sell Value | Realized P&L | Realized P&L Pct. | Previous Closing Price | Open Quantity | Open Quantity Type | Open Value | Unrealized P&L | Unrealized P&L Pct.`
- **Values** carry up to 4 decimals (e.g. `20099.9999`) and are rounded to the nearest paise on import.

### 2.5 Groww: not supported yet

Every public sample found is **stocks only**: an order history (`Stock name | Symbol | ISIN | Type | Quantity | Value | Exchange | Exchange Order Id | Execution date and time | Order status`, one row per order, time to the minute) and a stocks P&L. Groww’s F&O P&L report exists ([help page](https://groww.in/help/stocks,-f&o,-ipo-&-mtf/sx-reports/what-is-a-f-o-p-l-report--10)) but its layout hasn’t been seen. F&O Wrapped recognises Groww files and explains that F&O support needs a real F&O export, which can be shared through the “New broker export” issue template.

---

## 3. What F&O Wrapped can work out from each file

| Card or number | Zerodha | Angel One | Upstox | Dhan |
|----------------|---------|-----------|--------|------|
| Net P&L, charges | estimated (exact with P&L statement) | **exact** (broker charges) | estimated | **exact** (broker charges) |
| Win rate, expiry day, best/worst day, what you traded, position size, charges drag | ✅ | ✅ per contract-day | ✅ | ✅ per contract-day |
| Your clock, revenge trades, holding time, busy days, buyer or seller | ✅ | hidden: no trade times | ✅ | hidden: no trade times |

**Files without trade times** (Angel One, Dhan). All of a contract’s buys on a day are combined into one fill, and all its sells into another. Within a day, the side that reduces an existing position is applied first. When the contract starts the day flat, buys are applied before sells. So a “trade” is one contract’s activity on one day. Totals are unaffected, because realised P&L of a flat position doesn’t depend on the order of fills. The cards that need times or an opening direction are hidden, and one note says why (PRD D-22).

---

## 4. Next

- A real **Groww F&O export** (any user) → Groww parser.
- Real **Upstox futures** and **Angel One futures** rows → accept futures for those brokers.
- Checks against real exports from users for Angel One, Upstox and Dhan → drop the “beta” label.

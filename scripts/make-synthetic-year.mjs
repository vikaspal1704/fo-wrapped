// Generates tests/fixtures/synthetic-year.csv: a made-up (never real) year of
// Console-format F&O trades, dense enough for every card to render.
// Deterministic: same output on every run. Usage: node scripts/make-synthetic-year.mjs [fills]
import { writeFileSync } from 'node:fs';

const HEADER =
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date';
const CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'O', 'N', 'D'];

let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const iso = (d) => d.toISOString().slice(0, 10);

const target = Number(process.argv[2] ?? 240);
const out = process.argv[3] ?? 'tests/fixtures/synthetic-year.csv';
const rows = [HEADER];
let tradeId = 70_000_000;
let orderId = 1_300_000_000_000_000n;

// NIFTY weekly options, Tuesdays between 2025-11-04 and 2026-09-29.
const day = new Date(Date.UTC(2025, 10, 3));
while (rows.length - 1 < target && day < new Date(Date.UTC(2026, 8, 30))) {
  day.setUTCDate(day.getUTCDate() + 1);
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6 || rand() < 0.35) continue;
  // Expiry: the coming Tuesday (same day if Tuesday).
  const expiry = new Date(day);
  expiry.setUTCDate(expiry.getUTCDate() + ((2 - dow + 7) % 7));
  const e = iso(expiry);
  const yy = e.slice(2, 4);
  const code = CODES[Number(e.slice(5, 7)) - 1];
  const dd = e.slice(8, 10);

  let minute = 9 * 60 + 16 + Math.floor(rand() * 30);
  const tradesToday = 1 + Math.floor(rand() * 3);
  for (let t = 0; t < tradesToday && minute < 15 * 60 + 10; t++) {
    const strike = 24000 + 50 * Math.floor(rand() * 20);
    const type = pick(['CE', 'PE']);
    const symbol = `NIFTY${yy}${code}${dd}${strike}${type}`;
    const lots = 1 + Math.floor(rand() * 3);
    const qty = 75 * lots;
    const entry = 40 + Math.floor(rand() * 160) + pick([0, 0.05, 0.5, 0.25]);
    // Slightly more wins than losses, but bigger losses: "right but broke".
    const win = rand() < 0.58;
    const move = win ? 2 + rand() * 10 : -(4 + rand() * 18);
    const exit = Math.max(0.05, Math.round((entry + move) * 20) / 20);
    const hold = win ? 3 + Math.floor(rand() * 20) : 10 + Math.floor(rand() * 60);
    const short = rand() < 0.25;
    const [first, second] = short ? ['sell', 'buy'] : ['buy', 'sell'];
    const [p1, p2] = short ? [exit, entry] : [entry, exit];
    const at = (m) => `${iso(day)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(Math.floor(rand() * 60))}`;
    const row = (side, price, m) =>
      [symbol, '', iso(day), 'NSE', 'FO', '', side, 'false', `${qty}.000000`, `${price.toFixed(2)}0000`, ++tradeId, String(++orderId), at(m), e].join(',');
    rows.push(row(first, p1, minute));
    minute += hold;
    rows.push(row(second, p2, Math.min(minute, 15 * 60 + 29)));
    // After a loss, often jump straight back in (revenge-trade pattern).
    minute += win ? 20 + Math.floor(rand() * 60) : Math.floor(rand() * 14) + 1;
  }
}

writeFileSync(out, rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} fills to ${out}`);

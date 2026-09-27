import { classifyUnclosed } from './positions';
import { istDateOf } from './time';
import type {
  BrokerId,
  EpochMs,
  Fill,
  Instrument,
  IstDate,
  Paise,
  PositionSide,
  RoundTrip,
  TimePrecision,
  UnclosedPosition,
} from './types';

interface Lot {
  qty: number;
  /** Exact value of the remaining qty, in paise. */
  value: number;
  openedAt: EpochMs;
}

/** An in-progress round trip for one broker + instrument (ARCHITECTURE §4). */
interface Open {
  broker: BrokerId;
  instrument: Instrument;
  side: PositionSide;
  entryAt: EpochMs;
  timePrecision: TimePrecision;
  lots: Lot[];
  openedQty: number;
  entryValue: number;
  closedQty: number;
  exitValue: number;
  pnl: number;
  /** Σ chunk qty × holding ms. */
  holdingWeight: number;
  fillIds: string[];
}

type Draft = Omit<RoundTrip, 'id'>;

/**
 * Takes `q` of the `qty` units that remain in a (value, qty) pair and returns
 * their exact share of the value. Taking the whole remainder returns all of
 * it, so the parts of a split always add up to the original value.
 */
function take(value: number, qty: number, q: number): number {
  return q === qty ? value : Math.round((value * q) / qty);
}

/**
 * FIFO round-trip builder, per broker and instrument (positions at different
 * brokers never net). `fills` must be sorted (mergeFills does this). `asOf`
 * is the last trade date in the data. P&L is computed from exact values, so
 * rows that are daily totals (averaged prices) stay exact too.
 */
export function buildRoundTrips(
  fills: readonly Fill[],
  asOf: IstDate,
): { roundTrips: RoundTrip[]; unclosed: UnclosedPosition[] } {
  const open = new Map<string, Open>();
  const drafts: Draft[] = [];

  for (const fill of fills) {
    const key = `${fill.broker}|${fill.instrument.key}`;
    const fillSide: PositionSide = fill.side === 'BUY' ? 'LONG' : 'SHORT';
    let remainingQty = fill.qty;
    let remainingValue = fill.valuePaise as number;

    const current = open.get(key);
    if (current && current.side !== fillSide) {
      const used = close(current, fill, remainingQty, remainingValue);
      remainingQty -= used.qty;
      remainingValue -= used.value;
      if (current.lots.length === 0) {
        drafts.push(finish(current, fill.executedAt));
        open.delete(key);
      }
    }

    // Anything left opens (or adds to) a position in the fill's direction;
    // on a flip this starts a new round trip at the same time.
    if (remainingQty > 0) {
      let s = open.get(key);
      if (!s) {
        s = start(fill, fillSide);
        open.set(key, s);
      }
      s.lots.push({ qty: remainingQty, value: remainingValue, openedAt: fill.executedAt });
      s.openedQty += remainingQty;
      s.entryValue += remainingValue;
      if (fill.timePrecision === 'date') s.timePrecision = 'date';
      if (!s.fillIds.includes(fill.tradeId)) s.fillIds.push(fill.tradeId);
    }
  }

  drafts.sort(
    (a, b) =>
      a.exitAt - b.exitAt ||
      (a.broker < b.broker ? -1 : a.broker > b.broker ? 1 : 0) ||
      (a.instrument.key < b.instrument.key ? -1 : a.instrument.key > b.instrument.key ? 1 : 0),
  );
  const roundTrips = drafts.map((d, i) => ({ id: i + 1, ...d }));

  const unclosed: UnclosedPosition[] = [...open.values()]
    .map((s) => {
      const qty = s.lots.reduce((n, l) => n + l.qty, 0);
      const value = s.lots.reduce((v, l) => v + l.value, 0);
      return {
        broker: s.broker,
        instrument: s.instrument,
        side: s.side,
        qty,
        avgEntryPaise: value / qty,
        openedAt: s.entryAt,
        status: classifyUnclosed(s.instrument, asOf),
      };
    })
    .sort((a, b) => a.openedAt - b.openedAt || (a.instrument.key < b.instrument.key ? -1 : 1));

  return { roundTrips, unclosed };
}

function start(fill: Fill, side: PositionSide): Open {
  return {
    broker: fill.broker,
    instrument: fill.instrument,
    side,
    entryAt: fill.executedAt,
    timePrecision: fill.timePrecision,
    lots: [],
    openedQty: 0,
    entryValue: 0,
    closedQty: 0,
    exitValue: 0,
    pnl: 0,
    holdingWeight: 0,
    fillIds: [],
  };
}

/** Consumes lots from the front; returns the fill qty and value used. */
function close(s: Open, fill: Fill, qty: number, value: number): { qty: number; value: number } {
  let remainingQty = qty;
  let remainingValue = value;
  const direction = s.side === 'LONG' ? 1 : -1;
  while (remainingQty > 0 && s.lots.length > 0) {
    const lot = s.lots[0]!;
    const q = Math.min(lot.qty, remainingQty);
    const entry = take(lot.value, lot.qty, q);
    const exit = take(remainingValue, remainingQty, q);
    s.pnl += (exit - entry) * direction;
    s.holdingWeight += q * (fill.executedAt - lot.openedAt);
    s.closedQty += q;
    s.exitValue += exit;
    lot.qty -= q;
    lot.value -= entry;
    remainingQty -= q;
    remainingValue -= exit;
    if (lot.qty === 0) s.lots.shift();
  }
  if (fill.timePrecision === 'date') s.timePrecision = 'date';
  if (!s.fillIds.includes(fill.tradeId)) s.fillIds.push(fill.tradeId);
  return { qty: qty - remainingQty, value: value - remainingValue };
}

function finish(s: Open, exitAt: EpochMs): Draft {
  if (!Number.isSafeInteger(s.pnl)) throw new RangeError('P&L out of safe integer range');
  return {
    broker: s.broker,
    timePrecision: s.timePrecision,
    instrument: s.instrument,
    side: s.side,
    entryAt: s.entryAt,
    exitAt,
    exitDate: istDateOf(exitAt),
    exitKind: 'TRADE',
    qty: s.openedQty,
    avgEntryPaise: s.entryValue / s.openedQty,
    avgExitPaise: s.exitValue / s.closedQty,
    grossPnlPaise: s.pnl as Paise,
    holdingMs: Math.round(s.holdingWeight / s.closedQty),
    fillIds: s.fillIds,
  };
}

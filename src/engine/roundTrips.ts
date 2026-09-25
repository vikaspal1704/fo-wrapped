import { safeMul } from './money';
import { classifyUnclosed } from './positions';
import { istDateOf } from './time';
import type { EpochMs, Fill, Instrument, IstDate, Paise, PositionSide, RoundTrip, UnclosedPosition } from './types';

interface Lot {
  qty: number;
  pricePaise: number;
  openedAt: EpochMs;
}

/** An in-progress round trip for one instrument (ARCHITECTURE §4). */
interface Open {
  side: PositionSide;
  entryAt: EpochMs;
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
 * FIFO round-trip builder, per instrument. `fills` must be sorted
 * (mergeFills does this). `asOf` is the last trade date in the data.
 */
export function buildRoundTrips(
  fills: readonly Fill[],
  asOf: IstDate,
): { roundTrips: RoundTrip[]; unclosed: UnclosedPosition[] } {
  const open = new Map<string, { instrument: Instrument; state: Open }>();
  const drafts: Draft[] = [];

  for (const fill of fills) {
    const key = fill.instrument.key;
    const fillSide: PositionSide = fill.side === 'BUY' ? 'LONG' : 'SHORT';
    let remaining = fill.qty;

    const current = open.get(key);
    if (current && current.state.side !== fillSide) {
      remaining = close(current.state, fill, remaining);
      if (current.state.lots.length === 0) {
        drafts.push(finish(current.instrument, current.state, fill.executedAt));
        open.delete(key);
      }
    }

    // Anything left opens (or adds to) a position in the fill's direction;
    // on a flip this starts a new round trip at the same time and price.
    if (remaining > 0) {
      let entry = open.get(key);
      if (!entry) {
        entry = { instrument: fill.instrument, state: start(fillSide, fill.executedAt) };
        open.set(key, entry);
      }
      const s = entry.state;
      s.lots.push({ qty: remaining, pricePaise: fill.pricePaise, openedAt: fill.executedAt });
      s.openedQty += remaining;
      s.entryValue += safeMul(remaining, fill.pricePaise);
      if (!s.fillIds.includes(fill.tradeId)) s.fillIds.push(fill.tradeId);
    }
  }

  drafts.sort((a, b) => a.exitAt - b.exitAt || (a.instrument.key < b.instrument.key ? -1 : a.instrument.key > b.instrument.key ? 1 : 0));
  const roundTrips = drafts.map((d, i) => ({ id: i + 1, ...d }));

  const unclosed: UnclosedPosition[] = [...open.values()]
    .map(({ instrument, state }) => {
      const qty = state.lots.reduce((n, l) => n + l.qty, 0);
      const value = state.lots.reduce((v, l) => v + safeMul(l.qty, l.pricePaise), 0);
      return {
        instrument,
        side: state.side,
        qty,
        avgEntryPaise: value / qty,
        openedAt: state.entryAt,
        status: classifyUnclosed(instrument, asOf),
      };
    })
    .sort((a, b) => a.openedAt - b.openedAt || (a.instrument.key < b.instrument.key ? -1 : 1));

  return { roundTrips, unclosed };
}

function start(side: PositionSide, at: EpochMs): Open {
  return {
    side,
    entryAt: at,
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

/** Consumes lots from the front; returns the fill quantity left over. */
function close(s: Open, fill: Fill, qty: number): number {
  let remaining = qty;
  const direction = s.side === 'LONG' ? 1 : -1;
  while (remaining > 0 && s.lots.length > 0) {
    const lot = s.lots[0]!;
    const q = Math.min(lot.qty, remaining);
    s.pnl += safeMul(q, (fill.pricePaise - lot.pricePaise) * direction);
    s.holdingWeight += safeMul(q, fill.executedAt - lot.openedAt);
    s.closedQty += q;
    s.exitValue += safeMul(q, fill.pricePaise);
    lot.qty -= q;
    remaining -= q;
    if (lot.qty === 0) s.lots.shift();
  }
  if (!s.fillIds.includes(fill.tradeId)) s.fillIds.push(fill.tradeId);
  return remaining;
}

function finish(instrument: Instrument, s: Open, exitAt: EpochMs): Draft {
  return {
    instrument,
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

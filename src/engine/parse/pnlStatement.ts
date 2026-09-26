import readXlsxFile from 'read-excel-file/universal';
import type { ChargesBreakdown } from '../charges/types';
import { FoWrappedError, UnrecognizedFileError } from '../errors';
import { m } from '../i18n';
import { decimalToPaiseRounded } from '../money';
import { parseIstDate } from '../time';
import type { IstDate, Paise } from '../types';

/** A Zerodha Console P&L statement for F&O (docs/BROKERS.md §2.4). */
export interface PnlStatement {
  broker: 'zerodha';
  periodFrom: IstDate;
  periodTo: IstDate;
  /** Console's realised P&L before charges. */
  realizedPnlPaise: Paise;
  charges: ChargesBreakdown;
  /** Credits and debits outside trading (e.g. interest); shown, not netted. */
  otherCreditDebitPaise: Paise;
  perSymbol: { tradingSymbol: string; realizedPnlPaise: Paise; openQuantity: number }[];
  /** Account heads not mapped to a known charge (added to `other`). */
  unmappedHeads: string[];
}

const TITLE = /^P&L Statement for (.+?) from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/i;
const SYMBOL_HEADERS = ['symbol', 'quantity', 'buy value', 'sell value', 'realized p&l'];

/** Account head (without the " - Z" suffix) → charge field. */
const HEADS: Record<string, keyof Omit<ChargesBreakdown, 'total'>> = {
  brokerage: 'brokerage',
  'exchange transaction charges': 'exchangeTxn',
  'clearing charges': 'other',
  'central gst': 'gst',
  'state gst': 'gst',
  'integrated gst': 'gst',
  'securities transaction tax': 'stt',
  'sebi turnover fees': 'sebi',
  'stamp duty': 'stampDuty',
  ipft: 'other',
};

class Num {
  constructor(readonly text: string) {}
}

/** Heuristic sniff: is this XLSX a Console P&L statement? (Used to route files.) */
export function looksLikePnlStatement(rows: readonly (readonly unknown[])[]): boolean {
  return rows.slice(0, 20).some((r) => r.some((c) => typeof c === 'string' && TITLE.test(c.trim())));
}

export async function parsePnlStatement(fileName: string, bytes: ArrayBuffer): Promise<PnlStatement> {
  let sheets;
  try {
    sheets = await readXlsxFile(bytes, { parseNumber: (s: string) => new Num(s), trim: true });
  } catch {
    throw UnrecognizedFileError.forFile(fileName);
  }
  for (const sheet of sheets) {
    const rows = sheet.data.map((r) => r.map((c) => (c instanceof Num ? c : c === null ? '' : String(c))));
    const title = findTitle(rows);
    if (!title) continue;
    if (!/^f&o$/i.test(title.segment)) throw new FoWrappedError(m().pnlWrongSegment(fileName, title.segment));
    return readStatement(fileName, rows, title);
  }
  throw UnrecognizedFileError.forFile(fileName);
}

type Cell = string | Num;

function findTitle(rows: Cell[][]) {
  for (const r of rows.slice(0, 30)) {
    for (const c of r) {
      const hit = typeof c === 'string' ? TITLE.exec(c) : null;
      if (hit) {
        const from = parseIstDate(hit[2]!);
        const to = parseIstDate(hit[3]!);
        if (from && to) return { segment: hit[1]!.trim(), from, to };
      }
    }
  }
  return null;
}

function readStatement(fileName: string, rows: Cell[][], title: { from: IstDate; to: IstDate }): PnlStatement {
  const text = (c: Cell | undefined) => (c instanceof Num ? c.text : (c ?? '')).trim();
  const money = (c: Cell | undefined, what: string): Paise => {
    const v = decimalToPaiseRounded(text(c) || '0');
    if (v === null) throw new FoWrappedError(m().pnlBadValue(fileName, what, text(c)));
    return v;
  };
  /** The value to the right of the first cell labelled `label`. */
  const labelled = (label: string): Paise | null => {
    for (const r of rows) {
      const i = r.findIndex((c) => text(c).toLowerCase() === label);
      if (i >= 0 && i + 1 < r.length) return money(r[i + 1], label);
    }
    return null;
  };

  const realized = labelled('realized p&l');
  const totalCharges = labelled('charges');
  if (realized === null || totalCharges === null) throw UnrecognizedFileError.forFile(fileName);

  // Charges by account head.
  const charges = { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, gst: 0, other: 0 };
  const unmappedHeads: string[] = [];
  const headRow = rows.findIndex((r) => r.some((c) => text(c).toLowerCase() === 'account head'));
  if (headRow >= 0) {
    const col = rows[headRow]!.findIndex((c) => text(c).toLowerCase() === 'account head');
    for (let i = headRow + 1; i < rows.length; i++) {
      const head = text(rows[i]![col]);
      if (!head) break;
      const key = HEADS[head.replace(/\s*-\s*z$/i, '').toLowerCase()];
      if (!key) unmappedHeads.push(head);
      charges[key ?? 'other'] += money(rows[i]![col + 1], head);
    }
  }
  const sum = Object.values(charges).reduce((a, b) => a + b, 0);
  // Each head was rounded separately; allow 1 paise per head of drift from the printed total.
  if (headRow >= 0 && Math.abs(sum - totalCharges) > Object.keys(HEADS).length) {
    throw new FoWrappedError(m().pnlInconsistent(fileName));
  }

  // Per-symbol realised P&L.
  const perSymbol: PnlStatement['perSymbol'] = [];
  const symRow = rows.findIndex((r) => SYMBOL_HEADERS.every((h) => r.some((c) => text(c).toLowerCase() === h)));
  if (symRow >= 0) {
    const idx = (h: string) => rows[symRow]!.findIndex((c) => text(c).toLowerCase() === h);
    const [cSym, cReal, cOpen] = [idx('symbol'), idx('realized p&l'), idx('open quantity')];
    for (let i = symRow + 1; i < rows.length; i++) {
      const sym = text(rows[i]![cSym]);
      if (!sym) break;
      perSymbol.push({
        tradingSymbol: sym.toUpperCase(),
        realizedPnlPaise: money(rows[i]![cReal], `${sym} realized P&L`),
        openQuantity: cOpen >= 0 ? Number(text(rows[i]![cOpen]) || 0) : 0,
      });
    }
  }

  return {
    broker: 'zerodha',
    periodFrom: title.from,
    periodTo: title.to,
    realizedPnlPaise: realized,
    charges: { ...(charges as Record<keyof typeof charges, Paise>), total: sum as Paise },
    otherCreditDebitPaise: labelled('other credit & debit') ?? (0 as Paise),
    perSymbol,
    unmappedHeads,
  };
}

/**
 * Rejects a statement that can't apply to the uploaded tradebooks: none from
 * Zerodha, or no overlap with their dates (API_CONTRACT §3).
 */
export function checkStatementCoverage(fileName: string, st: PnlStatement, zerodhaTradeDates: readonly IstDate[]): void {
  if (zerodhaTradeDates.length === 0) throw new FoWrappedError(m().pnlNoTradebook(fileName));
  const from = zerodhaTradeDates.reduce((a, b) => (b < a ? b : a));
  const to = zerodhaTradeDates.reduce((a, b) => (b > a ? b : a));
  if (st.periodTo < from || st.periodFrom > to) {
    throw new FoWrappedError(m().pnlNoOverlap(fileName, st.periodFrom, st.periodTo, from, to));
  }
}

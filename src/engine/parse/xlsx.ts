import readXlsxFile from 'read-excel-file/universal';
import { UnrecognizedFileError } from '../errors';

const pad = (n: number) => String(n).padStart(2, '0');

/** A numeric cell, kept as the exact text stored in the file. */
class NumericText {
  constructor(readonly text: string) {}
}

/** Excel keeps 15 significant digits; longer numbers were rounded when saved. */
const MAX_EXACT_DIGITS = 15;

/**
 * Converts one XLSX cell to the string form the CSV export uses.
 * - Numbers come through as the exact text stored in the file, so no float
 *   rounding happens here. A number with more than 15 significant digits
 *   (e.g. a 19-digit order_id saved as a number) was already rounded by
 *   Excel; it is marked so validation rejects it instead of trusting it.
 * - Date cells hold a wall-clock time with no zone; read-excel-file returns
 *   them as UTC Dates, so the UTC fields are the IST wall-clock fields.
 *   Times are rounded to the nearest second (Excel stores fractional days).
 */
export function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof NumericText) {
    const integerDigits = cell.text.replace(/^[-+]?0*/, '').split('.')[0]!;
    const rounded = /e/i.test(cell.text) || integerDigits.length > MAX_EXACT_DIGITS;
    return rounded ? `${cell.text} (rounded by Excel)` : cell.text;
  }
  if (cell instanceof Date) {
    // Excel stores times as fractional days, so 11:02:10 can come back as
    // 11:02:09.999; round to the nearest second before reading the fields.
    const t = new Date(Math.round(cell.getTime() / 1000) * 1000);
    const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    const h = t.getUTCHours();
    const m = t.getUTCMinutes();
    const s = t.getUTCSeconds();
    return h === 0 && m === 0 && s === 0 ? date : `${date}T${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return String(cell);
}

/** Reads every sheet of an XLSX file as rows of strings. */
export async function readXlsxSheets(fileName: string, bytes: ArrayBuffer): Promise<{ name: string; rows: string[][] }[]> {
  let sheets;
  try {
    sheets = await readXlsxFile(bytes, { parseNumber: (s: string) => new NumericText(s), trim: true });
  } catch {
    throw UnrecognizedFileError.forFile(fileName);
  }
  return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((row) => row.map(cellToString)) }));
}

/** Reads the first non-empty sheet of an XLSX file as rows of strings. */
export async function readXlsxRows(fileName: string, bytes: ArrayBuffer): Promise<string[][]> {
  // Console exports hold the tradebook in one sheet; later sheets are only
  // used if the first is empty.
  const sheet = (await readXlsxSheets(fileName, bytes)).find((s) => s.rows.some((row) => row.some((c) => c !== '')));
  if (!sheet) throw UnrecognizedFileError.forFile(fileName);
  return sheet.rows;
}

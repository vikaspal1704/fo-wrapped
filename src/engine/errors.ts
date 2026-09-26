import { m } from './i18n';

/** Base class: every engine error carries a plain-language message for the UI. */
export class FoWrappedError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = new.target.name;
    this.userMessage = userMessage;
  }
}

export class UnrecognizedFileError extends FoWrappedError {
  static forFile(file: string): UnrecognizedFileError {
    return new UnrecognizedFileError(m().unrecognizedFile(file));
  }
}

export class UnsupportedSegmentError extends FoWrappedError {
  constructor(file: string, segment: string) {
    super(m().unsupportedSegment(file, segmentLabel(segment)));
  }
}

export class RowValidationError extends FoWrappedError {
  constructor(
    readonly file: string,
    readonly row: number,
    readonly field: string,
    readonly value: string,
    reason: string,
  ) {
    super(m().invalidRow(file, row, field, value), `${file}:${row} ${field}='${value}': ${reason}`);
  }
}

export class ConflictingDuplicateError extends FoWrappedError {
  constructor(tradeId: string) {
    super(m().conflictingDuplicate(tradeId));
  }
}

export class UnknownInstrumentError extends FoWrappedError {
  constructor(symbol: string, reason: string) {
    super(m().unknownContract(symbol, reason));
  }
}

function segmentLabel(segment: string): string {
  switch (segment.toUpperCase()) {
    case 'EQ':
      return m().segEquity;
    case 'CDS':
      return m().segCurrency;
    case 'COM':
    case 'MCX':
      return m().segCommodity;
    default:
      return `“${segment}”`;
  }
}

export class ChargesUnavailableError extends FoWrappedError {
  constructor(readonly date: string, what: string) {
    super(m().chargesUnavailableFor(date, what));
  }
}

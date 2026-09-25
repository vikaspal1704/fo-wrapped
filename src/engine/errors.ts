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
    return new UnrecognizedFileError(
      `${file} doesn’t look like a Zerodha Console tradebook. In Console go to Reports → Tradebook, ` +
        'choose segment F&O, and download CSV or XLSX.',
    );
  }
}

export class UnsupportedSegmentError extends FoWrappedError {
  constructor(file: string, segment: string) {
    super(`${file} is an ${segmentLabel(segment)} tradebook. F&O Wrapped needs the F&O segment.`);
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
    super(
      `${file}, row ${row}: ${field} ‘${value}’ isn’t valid. The file may have been edited. ` +
        'Please download a fresh copy.',
      `${file}:${row} ${field}='${value}': ${reason}`,
    );
  }
}

export class ConflictingDuplicateError extends FoWrappedError {
  constructor(tradeId: string) {
    super(`Trade ${tradeId} appears in two files with different details. Please re-download both files.`);
  }
}

export class UnknownInstrumentError extends FoWrappedError {
  constructor(symbol: string, reason: string) {
    super(`We couldn’t read the contract “${symbol}”. ${reason}`);
  }
}

function segmentLabel(segment: string): string {
  switch (segment.toUpperCase()) {
    case 'EQ':
      return 'Equity';
    case 'CDS':
      return 'Currency';
    case 'COM':
    case 'MCX':
      return 'Commodity';
    default:
      return `“${segment}”`;
  }
}

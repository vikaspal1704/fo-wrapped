/**
 * Engine messages in English and Hindi (ROADMAP X2).
 *
 * The locale is set once per analysis run by the worker (withLocale). Results
 * are still deterministic: the same files and locale give the same output.
 * Every Hindi entry is type-checked against the English one, so a missing
 * translation is a compile error. Hindi copy should be reviewed by a native
 * speaker before launch.
 */
import { formatInr } from './format';

export type Locale = 'en' | 'hi';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const en = {
  // Shared notes
  beforeCharges: 'Before charges.',
  chargesEstimated: 'Charges are estimated from published rates.',
  chargesEstimatedAddStatement: 'Charges are estimated from published rates. Add your P&L statement for exact numbers (coming soon).',
  chargesUnavailable: 'Charges unavailable.',
  excludedPositions: (n: number) => `${n} ${plural(n, 'position', 'positions')} that expired or are still open ${plural(n, 'isn’t', 'aren’t')} included.`,
  noClosedTrades: 'No closed trades yet.',
  noTradeTimes: 'Your broker’s file has no trade times.',
  onlyTimedTrades: 'Only trades from files with trade times are included.',
  noTimesWarning: 'Your broker’s file has no trade times, so time-of-day cards are skipped, and a trade here means one contract’s buys and sells on one day.',
  chargesFromBroker: 'Charges are your broker’s own figures from the file.',
  chargesMixed: 'Charges are partly your broker’s own figures and partly estimated from published rates.',

  // Core cards
  needsWinsAndLosses: (n: number) => `Needs at least ${n} closed trades with at least one win and one loss.`,
  scratchNote: 'Break-even trades aren’t counted as wins or losses.',
  noExpiryTrades: 'None of your trades closed on an expiry day.',
  allExpiryTrades: 'All of your trades closed on expiry day.',
  expiryNote: 'A trade counts as expiry-day if it closed on its contract’s expiry date.',
  needsClosedTrades: (n: number) => `Needs at least ${n} closed trades.`,
  clockEntryNote: 'Trades are placed by when you entered, in 15-minute slots (IST).',
  clockMinNote: (n: number) => `Best and worst slots need at least ${n} trades.`,
  needsLosses: (n: number) => `Needs at least ${n} losing trades.`,
  revengeNote: (medianLossPaise: number) =>
    `A revenge trade is any new entry within 15 minutes after a loss bigger than your median loss (${formatInr(medianLossPaise)}).`,
  needsWinnersAndLosers: (n: number) => `Needs at least ${n} winning and ${n} losing trades.`,
  holdingNote: 'Holding time is the quantity-weighted time each unit was held (FIFO).',
  needsTwoDays: 'Needs trades closed on at least 2 different days.',
  dayCloseNote: 'Each trade counts on the day it closed.',

  // Summary headlines
  hNetPnl: 'Net P&L',
  hGrossPnl: 'P&L before charges',
  hCharges: 'Charges paid',
  hWinRate: 'Win rate',
  hTrades: 'Trades',
  hTradedValue: 'Traded value',
  hDaysTraded: 'Days traded',

  // Extra cards
  needsOptionTrades: (n: number) => `Needs at least ${n} closed option trades.`,
  allOptionSells: 'All your option trades started with a sell.',
  allOptionBuys: 'All your option trades started with a buy.',
  optionsOnlyNote: 'Options only. A trade counts as selling if it opened with a sell.',
  oneUnderlying: 'You traded only one underlying.',
  needsTradingDays: (n: number) => `Needs trades on at least ${n} different days.`,
  sameEveryDay: 'You traded about the same number of times every day.',
  busyNote: (threshold: number) => `A busy day has more than ${threshold} closed ${plural(threshold, 'trade', 'trades')} (your median day).`,
  needsWeekdays: (trades: number, days: number) => `Needs at least ${trades} trades across ${days} weekdays.`,
  weekdayMinNote: (n: number) => `Best and worst days need at least ${n} trades.`,
  sameSize: 'Your positions were all about the same size.',
  sizeNote: 'Size is the value at entry (quantity × average entry price). Bigger means above your median.',
  needsWin: 'Needs at least one winning trade.',

  // Warnings
  settledExcluded: (n: number) => `${n} ${plural(n, 'position', 'positions')} expired without a closing trade and ${plural(n, 'isn’t', 'aren’t')} counted in P&L.`,
  openExcluded: (n: number) => `${n} ${plural(n, 'position is', 'positions are')} still open and not counted in P&L.`,
  outOfSession: (n: number) => `${n} ${plural(n, 'fill was', 'fills were')} outside 09:15–15:30 and placed in the nearest time slot.`,
  periodNote: 'Trades count in the period they closed; charges count in the period they were paid.',

  // Comparison rows
  cNetPnl: 'Net P&L',
  cGrossPnl: 'P&L before charges',
  cCharges: 'Charges',
  cTrades: 'Trades',
  cWinRate: 'Win rate',
  cRevenge: 'Revenge trades',
  cLoserHold: 'Median time holding losers',

  // Periods
  allTrades: 'All trades',
  samvat: (year: number | string) => `Samvat ${year}`,
  fy: (from: number, toShort: string) => `FY ${from}-${toShort}`,

  // Errors
  unrecognizedFile: (file: string) =>
    `${file} doesn’t look like a Zerodha Console tradebook. In Console go to Reports → Tradebook, choose segment F&O, and download CSV or XLSX.`,
  unsupportedSegment: (file: string, segment: string) => `${file} is an ${segment} tradebook. F&O Wrapped needs the F&O segment.`,
  segEquity: 'Equity',
  segCurrency: 'Currency',
  segCommodity: 'Commodity',
  invalidRow: (file: string, row: number, field: string, value: string) =>
    `${file}, row ${row}: ${field} ‘${value}’ isn’t valid. The file may have been edited. Please download a fresh copy.`,
  conflictingDuplicate: (tradeId: string) => `Trade ${tradeId} appears in two files with different details. Please re-download both files.`,
  unknownContract: (symbol: string, reason: string) => `We couldn’t read the contract “${symbol}”. ${reason}`,
  symbolExpiryMismatch: (expiry: string) => `It doesn’t match its expiry date ${expiry}.`,
  symbolAmbiguous: 'The symbol can be read in more than one way.',
  symbolBadStrike: (strike: string) => `Strike “${strike}” isn’t valid.`,
  chargesUnavailableFor: (date: string, what: string) => `We can’t estimate charges for trades on ${date} (${what}). Add your P&L statement for exact numbers.`,
  chargeBrokerage: 'brokerage',
  chargeStt: 'STT',
  chargeTxn: (exchange: string) => `${exchange} transaction charges`,
  chargeSebi: 'SEBI fees',
  chargeStamp: 'stamp duty',
  chargeGst: 'GST',
  legacyXls: (file: string) => `${file} is an old .xls file. Please download the tradebook from Console as CSV or XLSX.`,
  noFilesRead: 'None of the files could be read. See the details above.',
  genericFailure: 'Something went wrong while reading your files. Please try again with a fresh download.',
};

export type EngineMessages = typeof en;

const hi: EngineMessages = {
  beforeCharges: 'चार्जेस से पहले।',
  chargesEstimated: 'चार्जेस प्रकाशित दरों से अनुमानित हैं।',
  chargesEstimatedAddStatement: 'चार्जेस प्रकाशित दरों से अनुमानित हैं। सटीक आँकड़ों के लिए अपना P&L स्टेटमेंट जोड़ें (जल्द आ रहा है)।',
  chargesUnavailable: 'चार्जेस उपलब्ध नहीं हैं।',
  excludedPositions: (n) => `एक्सपायर हुई या अभी खुली ${n} पोज़िशन शामिल नहीं ${plural(n, 'है', 'हैं')}।`,
  noClosedTrades: 'अभी कोई बंद ट्रेड नहीं है।',
  noTradeTimes: 'आपके ब्रोकर की फ़ाइल में ट्रेड का समय नहीं है।',
  onlyTimedTrades: 'सिर्फ़ उन फ़ाइलों के ट्रेड शामिल हैं जिनमें ट्रेड का समय है।',
  noTimesWarning: 'आपके ब्रोकर की फ़ाइल में ट्रेड का समय नहीं है, इसलिए समय वाले कार्ड छोड़ दिए गए हैं, और यहाँ एक ट्रेड का मतलब है एक दिन में एक कॉन्ट्रैक्ट की सारी ख़रीद-बिक्री।',
  chargesFromBroker: 'चार्जेस फ़ाइल में दिए गए आपके ब्रोकर के अपने आँकड़े हैं।',
  chargesMixed: 'चार्जेस कुछ आपके ब्रोकर के अपने आँकड़े हैं और कुछ प्रकाशित दरों से अनुमानित।',

  needsWinsAndLosses: (n) => `कम से कम ${n} बंद ट्रेड चाहिए, जिनमें कम से कम एक जीत और एक हार हो।`,
  scratchNote: 'बराबरी पर बंद हुए ट्रेड न जीत में गिने जाते हैं, न हार में।',
  noExpiryTrades: 'आपका कोई भी ट्रेड एक्सपायरी के दिन बंद नहीं हुआ।',
  allExpiryTrades: 'आपके सभी ट्रेड एक्सपायरी के दिन बंद हुए।',
  expiryNote: 'ट्रेड एक्सपायरी-डे का गिना जाता है अगर वह अपने कॉन्ट्रैक्ट की एक्सपायरी तारीख पर बंद हुआ।',
  needsClosedTrades: (n) => `कम से कम ${n} बंद ट्रेड चाहिए।`,
  clockEntryNote: 'ट्रेड इस हिसाब से रखे गए हैं कि आपने कब एंट्री की, 15-मिनट के स्लॉट में (IST)।',
  clockMinNote: (n) => `सबसे अच्छे और सबसे बुरे स्लॉट के लिए कम से कम ${n} ट्रेड चाहिए।`,
  needsLosses: (n) => `कम से कम ${n} घाटे वाले ट्रेड चाहिए।`,
  revengeNote: (m) => `रिवेंज ट्रेड यानी आपके मीडियन घाटे (${formatInr(m)}) से बड़े घाटे के 15 मिनट के भीतर ली गई कोई भी नई एंट्री।`,
  needsWinnersAndLosers: (n) => `कम से कम ${n} मुनाफ़े वाले और ${n} घाटे वाले ट्रेड चाहिए।`,
  holdingNote: 'होल्डिंग समय हर यूनिट को होल्ड करने का मात्रा-भारित समय है (FIFO)।',
  needsTwoDays: 'कम से कम 2 अलग-अलग दिनों में बंद हुए ट्रेड चाहिए।',
  dayCloseNote: 'हर ट्रेड उस दिन गिना जाता है जिस दिन वह बंद हुआ।',

  hNetPnl: 'नेट P&L',
  hGrossPnl: 'चार्जेस से पहले P&L',
  hCharges: 'चुकाए गए चार्जेस',
  hWinRate: 'जीत दर',
  hTrades: 'ट्रेड',
  hTradedValue: 'ट्रेड की गई वैल्यू',
  hDaysTraded: 'ट्रेडिंग के दिन',

  needsOptionTrades: (n) => `कम से कम ${n} बंद ऑप्शन ट्रेड चाहिए।`,
  allOptionSells: 'आपके सभी ऑप्शन ट्रेड सेल से शुरू हुए।',
  allOptionBuys: 'आपके सभी ऑप्शन ट्रेड बाय से शुरू हुए।',
  optionsOnlyNote: 'सिर्फ़ ऑप्शन। जो ट्रेड सेल से खुला, वह सेलिंग गिना जाता है।',
  oneUnderlying: 'आपने सिर्फ़ एक अंडरलाइंग में ट्रेड किया।',
  needsTradingDays: (n) => `कम से कम ${n} अलग-अलग दिनों के ट्रेड चाहिए।`,
  sameEveryDay: 'आपने लगभग हर दिन उतनी ही बार ट्रेड किया।',
  busyNote: (t) => `व्यस्त दिन वह है जिसमें ${t} से ज़्यादा ट्रेड बंद हुए (आपका मीडियन दिन)।`,
  needsWeekdays: (trades, days) => `${days} कामकाजी दिनों में कम से कम ${trades} ट्रेड चाहिए।`,
  weekdayMinNote: (n) => `सबसे अच्छे और सबसे बुरे दिन के लिए कम से कम ${n} ट्रेड चाहिए।`,
  sameSize: 'आपकी सभी पोज़िशन लगभग एक ही साइज़ की थीं।',
  sizeNote: 'साइज़ यानी एंट्री पर वैल्यू (मात्रा × औसत एंट्री प्राइस)। बड़ी यानी आपके मीडियन से ऊपर।',
  needsWin: 'कम से कम एक मुनाफ़े वाला ट्रेड चाहिए।',

  settledExcluded: (n) => `${n} पोज़िशन बिना क्लोज़िंग ट्रेड के एक्सपायर हुईं और P&L में नहीं गिनी गईं।`,
  openExcluded: (n) => `${n} पोज़िशन अभी खुली ${plural(n, 'है', 'हैं')} और P&L में नहीं गिनी गईं।`,
  outOfSession: (n) => `${n} फ़िल 09:15–15:30 के बाहर थे और पास वाले टाइम स्लॉट में रखे गए।`,
  periodNote: 'ट्रेड उस अवधि में गिने जाते हैं जिसमें वे बंद हुए; चार्जेस उस अवधि में जिसमें चुकाए गए।',

  cNetPnl: 'नेट P&L',
  cGrossPnl: 'चार्जेस से पहले P&L',
  cCharges: 'चार्जेस',
  cTrades: 'ट्रेड',
  cWinRate: 'जीत दर',
  cRevenge: 'रिवेंज ट्रेड',
  cLoserHold: 'घाटे वाले ट्रेड होल्ड करने का मीडियन समय',

  allTrades: 'सभी ट्रेड',
  samvat: (year) => `संवत ${year}`,
  fy: (from, toShort) => `वित्त वर्ष ${from}-${toShort}`,

  unrecognizedFile: (file) =>
    `${file} Zerodha Console की ट्रेडबुक नहीं लगती। Console में Reports → Tradebook पर जाएँ, सेगमेंट F&O चुनें, और CSV या XLSX डाउनलोड करें।`,
  unsupportedSegment: (file, segment) => `${file} ${segment} ट्रेडबुक है। F&O Wrapped को F&O सेगमेंट चाहिए।`,
  segEquity: 'इक्विटी',
  segCurrency: 'करेंसी',
  segCommodity: 'कमोडिटी',
  invalidRow: (file, row, field, value) =>
    `${file}, पंक्ति ${row}: ${field} ‘${value}’ सही नहीं है। हो सकता है फ़ाइल बदली गई हो। कृपया नई कॉपी डाउनलोड करें।`,
  conflictingDuplicate: (tradeId) => `ट्रेड ${tradeId} दो फ़ाइलों में अलग-अलग जानकारी के साथ है। कृपया दोनों फ़ाइलें फिर से डाउनलोड करें।`,
  unknownContract: (symbol, reason) => `हम कॉन्ट्रैक्ट “${symbol}” नहीं पढ़ पाए। ${reason}`,
  symbolExpiryMismatch: (expiry) => `यह अपनी एक्सपायरी तारीख ${expiry} से मेल नहीं खाता।`,
  symbolAmbiguous: 'यह सिंबल एक से ज़्यादा तरीक़ों से पढ़ा जा सकता है।',
  symbolBadStrike: (strike) => `स्ट्राइक “${strike}” सही नहीं है।`,
  chargesUnavailableFor: (date, what) => `हम ${date} के ट्रेड के चार्जेस (${what}) का अनुमान नहीं लगा सकते। सटीक आँकड़ों के लिए अपना P&L स्टेटमेंट जोड़ें।`,
  chargeBrokerage: 'ब्रोकरेज',
  chargeStt: 'STT',
  chargeTxn: (exchange) => `${exchange} ट्रांज़ैक्शन चार्जेस`,
  chargeSebi: 'SEBI फ़ीस',
  chargeStamp: 'स्टांप ड्यूटी',
  chargeGst: 'GST',
  legacyXls: (file) => `${file} पुरानी .xls फ़ाइल है। कृपया Console से ट्रेडबुक CSV या XLSX में डाउनलोड करें।`,
  noFilesRead: 'कोई भी फ़ाइल पढ़ी नहीं जा सकी। ऊपर विवरण देखें।',
  genericFailure: 'आपकी फ़ाइलें पढ़ते समय कुछ गड़बड़ हुई। कृपया नई डाउनलोड की हुई फ़ाइल के साथ फिर कोशिश करें।',
};

const CATALOGS: Record<Locale, EngineMessages> = { en, hi };
let current: Locale = 'en';

/** Messages for the current locale. */
export function m(): EngineMessages {
  return CATALOGS[current];
}

export function getLocale(): Locale {
  return current;
}

/** Runs `fn` with `locale` as the engine locale, then restores the previous one. */
export async function withLocale<T>(locale: Locale, fn: () => T | Promise<T>): Promise<T> {
  const previous = current;
  current = locale;
  try {
    return await fn();
  } finally {
    current = previous;
  }
}

/** Synchronous variant for pure, synchronous engine calls (e.g. tests). */
export function withLocaleSync<T>(locale: Locale, fn: () => T): T {
  const previous = current;
  current = locale;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

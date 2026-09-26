import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '../engine';

/**
 * UI copy in English and Hindi (ROADMAP X2). Hindi entries are type-checked
 * against English, so none can go missing. The chosen language lives only in
 * the URL (?lang=hi), never in storage, in line with the privacy promise.
 */
const en = {
  langName: 'English',
  switchTo: 'हिंदी',
  switchToLabel: 'हिंदी में देखें',

  // Landing
  eyebrow: 'Your trading year, Wrapped',
  tagline: 'Honest, shareable cards about your F&O year: charges, win rate, expiry days, revenge trades and more.',
  drop: 'Drop your tradebook',
  privacyLine: 'Files are processed on your device and never uploaded.',
  howToCheck: 'How to check',
  filesLabel: 'Files',
  howTitle: 'How to download from Zerodha Console',
  how1: (b: (s: string) => ReactNode) => <>Open {b('console.zerodha.com')} and go to {b('Reports → Tradebook')}.</>,
  how2: (b: (s: string) => ReactNode) => <>Choose segment {b('F&O')} and a date range of up to 365 days.</>,
  how3: (b: (s: string) => ReactNode) => <>Download as {b('CSV')} or {b('XLSX')}. For more than a year, repeat and drop all the files together.</>,
  footer1: 'Free and open source. No sign-up, no tracking. Not investment, trading or tax advice.',
  footer2: 'Independent project, not affiliated with Zerodha, NSE or BSE.',
  privacyAbout: 'Privacy & about',
  tradesRead: (n: number) => `${n} trades read`,

  // Progress
  stageReading: 'Reading your files…',
  stageValidating: 'Checking every row…',
  stageMatching: 'Matching trades and estimating charges…',
  stageCards: 'Building your cards…',
  onDevice: 'Everything is happening on this device.',

  // Story chrome
  period: 'Period',
  kindSamvat: 'Samvat year',
  kindFy: 'Financial year',
  kindCalendar: 'Calendar year',
  skip: 'Skip ›',
  skipLabel: 'Skip to end',
  clear: 'Clear',
  clearData: 'Clear data',
  prevCard: 'Previous card',
  nextCard: 'Next card',
  back: '← Back',
  slideLabel: (i: number, n: number, title: string) => `${i} of ${n}: ${title}`,
  fileSkipped: 'One file was skipped:',
  filesSkipped: (n: number) => `${n} files were skipped:`,
  genericError: 'Something went wrong. Please try again.',

  // Card frame
  notEnough: 'Not enough trades to say.',
  share: 'Share',
  shareCard: (title: string) => `Share this card: ${title}`,
  imageSaved: 'Image saved.',
  imageFailed: 'Couldn’t create the image.',

  // Card titles
  tNumber: 'The number',
  tMoney: 'Where the money went',
  tRightBroke: 'Right but broke',
  tExpiry: 'Expiry day',
  tClock: 'Your clock',
  tRevenge: 'Revenge trades',
  tHolding: 'Diamond hands, paper hands',
  tBestWorst: 'Best day, worst day',
  tBuyerSeller: 'Buyer or seller',
  tUnderlyings: 'What you traded',
  tBusy: 'Busy days',
  tWeekday: 'Day of the week',
  tSize: 'Position size',
  tDrag: 'Charges drag',
  tChanged: 'What changed',
  tYear: 'Your year',

  // The number
  netAfterCharges: 'net P&L after all charges',
  trades: 'Trades',
  tradedValue: 'Traded value',

  // Where the money went
  paidPct: (charges: string, pct: number) => (
    <>
      You paid <strong>{charges}</strong> in charges, which is <strong>{pct}%</strong> of your gross profit.
    </>
  ),
  paidOnLoss: (charges: string, loss: string) => (
    <>
      You paid <strong>{charges}</strong> in charges on top of a gross loss of <strong>{loss}</strong>.
    </>
  ),
  grossPnl: 'Gross P&L',
  charges: 'Charges',

  // Right but broke
  winRateLine: (w: number, l: number) => `win rate: ${w} wins, ${l} losses`,
  avgWin: 'Average win',
  avgLoss: 'Average loss',
  vMoreWinsSmaller: 'Right more often than not, but your losses are bigger than your wins.',
  vFewerWinsBigger: 'You lose more often, but your wins are bigger than your losses.',
  vMoreWinsBigger: 'More wins, and bigger ones.',
  vFewerWinsSmaller: 'Fewer wins, and smaller ones.',

  // Expiry
  onExpiryDays: 'On expiry days',
  otherDays: 'All other days',
  nTrades: (n: number) => `${n} trades`,
  eLostOtherMade: 'Expiry days lost money while the other days made it.',
  eMadeOtherLost: 'Expiry days made money while the other days lost it.',
  eBothLost: 'You lost money on expiry days and on the other days.',
  eBothMade: 'You made money on expiry days and on the other days.',

  // Clock
  clockAria: 'P&L by entry time, 15-minute slots',
  slotLine: (slot: string, n: number, pnl: string) => `${slot}: ${n} trades, ${pnl}`,
  bestSlot: 'Best slot',
  worstSlot: 'Worst slot',

  // Revenge
  noRevenge: 'revenge trades. After your big losses, you waited more than 15 minutes every time.',
  revengeLine: (triggers: number) => `trades entered within 15 minutes of a big loss (${triggers} big loss${triggers === 1 ? '' : 'es'})`,
  togetherMade: 'Together they made',

  // Holding
  medianHeld: 'Median time you held…',
  winners: 'Winners',
  losers: 'Losers',
  holdRatio: (r: string) => `You hold losers ${r}× longer than winners.`,
  cutLosersFaster: 'You cut losers faster than you take profits.',
  holdSame: 'You hold winners and losers for about the same time.',

  // Best/worst day
  bestDay: 'Best day',
  worstDay: 'Worst day',

  // Extra cards
  byHowOpened: 'Your option trades, by how they opened',
  bought: (n: number) => `Bought (${n})`,
  sold: (n: number) => `Sold (${n})`,
  bsLevel: 'Buying and selling options ended level.',
  bsBuyBetter: 'Buying options did better than selling them.',
  bsSellBetter: 'Selling options did better than buying them.',
  bestUnderlying: 'Best underlying',
  leastBadUnderlying: 'Least bad underlying',
  worstUnderlying: 'Worst underlying',
  weakestUnderlying: 'Weakest underlying',
  indexN: (n: number) => `Index (${n})`,
  stocksN: (n: number) => `Stocks (${n})`,
  avgPerDay: 'Average P&L per day',
  busyN: (n: number) => `Busy days (${n})`,
  otherN: (n: number) => `Other days (${n})`,
  busyWorse: 'Your busiest days were worse on average than your quieter ones.',
  busyBetter: 'Your busiest days were better on average than your quieter ones.',
  weekdayNames: { Sun: 'Sun', Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat' } as Record<string, string>,
  bestWorstWeekday: (best: ReactNode, worst: ReactNode) => (
    <>
      Best on {best}, worst on {worst}.
    </>
  ),
  avgPerTrade: 'Average P&L per trade',
  biggerN: (n: number) => `Bigger (${n})`,
  smallerN: (n: number) => `Smaller (${n})`,
  winRateBigger: 'Win rate, bigger',
  winRateSmaller: 'Win rate, smaller',
  medianPosition: (v: string) => `Median position: ${v}`,
  dragLine: (avgWin: string, charges: string) => `average winning trades (${avgWin} each) went just to pay ${charges} in charges.`,
  perTrade: (v: string) => `That’s ${v} per trade.`,

  // What changed
  measure: 'Measure',
  changedNote1: 'P&L is before charges where charges can’t be estimated for either period.',
  changedNote2: '“—” means that period didn’t have enough trades for the number.',

  // Summary
  myYear: (year: string) => `My F&O year · ${year}`,
  downloadImage: 'Download image',
  shareSummary: 'Share',
  shareText: (url: string) => `My F&O year, Wrapped · ${url}`,
  savedFallback: 'Sharing isn’t available here, so the image was saved instead.',
  imageFailedRetry: 'Couldn’t create the image. Please try again.',
  versions: (engine: string, rates: string) => `Engine ${engine} · rates ${rates}`,
  siEyebrow: 'My F&O year, Wrapped',
  chooseStats: 'Choose stats',
  chooseStatsHint: 'Pick any 3 for your image.',

  // Dates
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

  // Privacy page
  pTitle: 'Your data stays on your device',
  pWhatHappens: 'What happens to your file',
  pW1: 'Your browser reads the file you pick. It is never uploaded; there is no server that could receive it.',
  pW2: 'All the maths runs in a background thread (a Web Worker) inside this tab. The worker is shut down as soon as your cards are ready.',
  pW3: (b: (s: string) => ReactNode) => <>Nothing is saved: no cookies, no local storage, no database. Closing the tab or pressing {b('Clear data')} removes everything.</>,
  pW4: 'There are no analytics, trackers, ads or third-party scripts.',
  pW5: 'To work offline, your browser keeps a copy of this app’s own code (its HTML, scripts and icons). Your files and results are never put in that cache.',
  pCheck: 'Check it yourself',
  pC1: (b: (s: string) => ReactNode) => (
    <>
      {b('Airplane-mode test:')} open this site, then switch off Wi-Fi and mobile data. Drop your tradebook: it still works, because nothing needs
      the internet. After your first visit you can even open the site offline, or install it to your home screen.
    </>
  ),
  pC2: (b: (s: string) => ReactNode) => (
    <>
      {b('Network tab:')} on a computer, open the browser’s developer tools (F12) → Network, then drop your file. You’ll see no request that
      carries your data.
    </>
  ),
  pC3: (b: (s: string) => ReactNode, link: ReactNode) => (
    <>
      {b('Read the code:')} everything is open source at {link}. A strict Content-Security-Policy stops the page from contacting any other
      website.
    </>
  ),
  pNumbers: 'What the numbers are (and aren’t)',
  pN1: (b: (s: string) => ReactNode) => <>Charges are {b('estimated')} from published rates unless you add your broker’s P&amp;L statement.</>,
  pN2: 'Positions that expired or are still open are left out rather than guessed.',
  pN3: 'This is a mirror of your own trades, not investment, trading or tax advice.',
  pAffiliation: 'Not affiliated',
  pA1:
    'F&O Wrapped is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Zerodha Broking Ltd, NSE, BSE or Spotify. “Zerodha” and “Console” are trademarks of their owners and are used only to describe which files work.',
  pTranslation: '',
};

export type UiMessages = typeof en;

const hi: UiMessages = {
  langName: 'हिंदी',
  switchTo: 'English',
  switchToLabel: 'View in English',

  eyebrow: 'आपका ट्रेडिंग साल, Wrapped',
  tagline: 'आपके F&O साल के बारे में ईमानदार, शेयर करने लायक़ कार्ड: चार्जेस, जीत दर, एक्सपायरी के दिन, रिवेंज ट्रेड और बहुत कुछ।',
  drop: 'अपनी ट्रेडबुक डालें',
  privacyLine: 'फ़ाइलें आपके डिवाइस पर ही प्रोसेस होती हैं, कभी अपलोड नहीं होतीं।',
  howToCheck: 'कैसे जाँचें',
  filesLabel: 'फ़ाइलें',
  howTitle: 'Zerodha Console से कैसे डाउनलोड करें',
  how1: (b) => <>{b('console.zerodha.com')} खोलें और {b('Reports → Tradebook')} पर जाएँ।</>,
  how2: (b) => <>सेगमेंट {b('F&O')} चुनें और 365 दिन तक की तारीख़ सीमा चुनें।</>,
  how3: (b) => <>{b('CSV')} या {b('XLSX')} में डाउनलोड करें। एक साल से ज़्यादा के लिए यह दोहराएँ और सारी फ़ाइलें एक साथ डालें।</>,
  footer1: 'मुफ़्त और ओपन सोर्स। न साइन-अप, न ट्रैकिंग। यह निवेश, ट्रेडिंग या टैक्स सलाह नहीं है।',
  footer2: 'स्वतंत्र प्रोजेक्ट, Zerodha, NSE या BSE से संबद्ध नहीं।',
  privacyAbout: 'प्राइवेसी और परिचय',
  tradesRead: (n) => `${n} ट्रेड पढ़े गए`,

  stageReading: 'आपकी फ़ाइलें पढ़ी जा रही हैं…',
  stageValidating: 'हर पंक्ति जाँची जा रही है…',
  stageMatching: 'ट्रेड मिलाए जा रहे हैं और चार्जेस का अनुमान लगाया जा रहा है…',
  stageCards: 'आपके कार्ड बन रहे हैं…',
  onDevice: 'सब कुछ इसी डिवाइस पर हो रहा है।',

  period: 'अवधि',
  kindSamvat: 'संवत वर्ष',
  kindFy: 'वित्त वर्ष',
  kindCalendar: 'कैलेंडर वर्ष',
  skip: 'छोड़ें ›',
  skipLabel: 'आख़िर तक जाएँ',
  clear: 'हटाएँ',
  clearData: 'डेटा हटाएँ',
  prevCard: 'पिछला कार्ड',
  nextCard: 'अगला कार्ड',
  back: '← वापस',
  slideLabel: (i, n, title) => `${n} में से ${i}: ${title}`,
  fileSkipped: 'एक फ़ाइल छोड़ी गई:',
  filesSkipped: (n) => `${n} फ़ाइलें छोड़ी गईं:`,
  genericError: 'कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।',

  notEnough: 'कहने के लिए पर्याप्त ट्रेड नहीं हैं।',
  share: 'शेयर',
  shareCard: (title) => `यह कार्ड शेयर करें: ${title}`,
  imageSaved: 'इमेज सेव हो गई।',
  imageFailed: 'इमेज नहीं बन पाई।',

  tNumber: 'आपका आँकड़ा',
  tMoney: 'पैसा कहाँ गया',
  tRightBroke: 'सही, फिर भी घाटा',
  tExpiry: 'एक्सपायरी का दिन',
  tClock: 'आपकी घड़ी',
  tRevenge: 'रिवेंज ट्रेड',
  tHolding: 'डायमंड हैंड्स, पेपर हैंड्स',
  tBestWorst: 'सबसे अच्छा दिन, सबसे बुरा दिन',
  tBuyerSeller: 'बायर या सेलर',
  tUnderlyings: 'आपने क्या ट्रेड किया',
  tBusy: 'व्यस्त दिन',
  tWeekday: 'हफ़्ते का दिन',
  tSize: 'पोज़िशन साइज़',
  tDrag: 'चार्जेस का बोझ',
  tChanged: 'क्या बदला',
  tYear: 'आपका साल',

  netAfterCharges: 'सभी चार्जेस के बाद नेट P&L',
  trades: 'ट्रेड',
  tradedValue: 'ट्रेड की गई वैल्यू',

  paidPct: (charges, pct) => (
    <>
      आपने चार्जेस में <strong>{charges}</strong> चुकाए, जो आपके ग्रॉस मुनाफ़े का <strong>{pct}%</strong> है।
    </>
  ),
  paidOnLoss: (charges, loss) => (
    <>
      आपने <strong>{loss}</strong> के ग्रॉस घाटे के ऊपर चार्जेस में <strong>{charges}</strong> चुकाए।
    </>
  ),
  grossPnl: 'ग्रॉस P&L',
  charges: 'चार्जेस',

  winRateLine: (w, l) => `जीत दर: ${w} जीत, ${l} हार`,
  avgWin: 'औसत जीत',
  avgLoss: 'औसत हार',
  vMoreWinsSmaller: 'आप ज़्यादातर सही रहे, लेकिन आपके घाटे आपके मुनाफ़ों से बड़े हैं।',
  vFewerWinsBigger: 'आप ज़्यादा बार हारते हैं, लेकिन आपकी जीत आपके घाटों से बड़ी है।',
  vMoreWinsBigger: 'ज़्यादा जीत, और बड़ी जीत।',
  vFewerWinsSmaller: 'कम जीत, और छोटी जीत।',

  onExpiryDays: 'एक्सपायरी के दिन',
  otherDays: 'बाक़ी सभी दिन',
  nTrades: (n) => `${n} ट्रेड`,
  eLostOtherMade: 'एक्सपायरी के दिनों में घाटा हुआ, जबकि बाक़ी दिनों में मुनाफ़ा।',
  eMadeOtherLost: 'एक्सपायरी के दिनों में मुनाफ़ा हुआ, जबकि बाक़ी दिनों में घाटा।',
  eBothLost: 'एक्सपायरी के दिनों और बाक़ी दिनों, दोनों में घाटा हुआ।',
  eBothMade: 'एक्सपायरी के दिनों और बाक़ी दिनों, दोनों में मुनाफ़ा हुआ।',

  clockAria: 'एंट्री के समय के हिसाब से P&L, 15-मिनट के स्लॉट',
  slotLine: (slot, n, pnl) => `${slot}: ${n} ट्रेड, ${pnl}`,
  bestSlot: 'सबसे अच्छा स्लॉट',
  worstSlot: 'सबसे बुरा स्लॉट',

  noRevenge: 'रिवेंज ट्रेड। बड़े घाटों के बाद आपने हर बार 15 मिनट से ज़्यादा इंतज़ार किया।',
  revengeLine: (triggers) => `ट्रेड बड़े घाटे के 15 मिनट के भीतर लिए गए (${triggers} बड़े घाटे)`,
  togetherMade: 'इन सबका कुल नतीजा',

  medianHeld: 'आपने मीडियन इतनी देर होल्ड किया…',
  winners: 'मुनाफ़े वाले',
  losers: 'घाटे वाले',
  holdRatio: (r) => `आप घाटे वाले ट्रेड मुनाफ़े वालों से ${r}× ज़्यादा देर होल्ड करते हैं।`,
  cutLosersFaster: 'आप घाटा मुनाफ़े से जल्दी काटते हैं।',
  holdSame: 'आप मुनाफ़े और घाटे वाले ट्रेड लगभग बराबर समय होल्ड करते हैं।',

  bestDay: 'सबसे अच्छा दिन',
  worstDay: 'सबसे बुरा दिन',

  byHowOpened: 'आपके ऑप्शन ट्रेड, वे कैसे खुले उसके हिसाब से',
  bought: (n) => `ख़रीदे (${n})`,
  sold: (n) => `बेचे (${n})`,
  bsLevel: 'ऑप्शन ख़रीदना और बेचना बराबर रहा।',
  bsBuyBetter: 'ऑप्शन ख़रीदना बेचने से बेहतर रहा।',
  bsSellBetter: 'ऑप्शन बेचना ख़रीदने से बेहतर रहा।',
  bestUnderlying: 'सबसे अच्छा अंडरलाइंग',
  leastBadUnderlying: 'सबसे कम बुरा अंडरलाइंग',
  worstUnderlying: 'सबसे बुरा अंडरलाइंग',
  weakestUnderlying: 'सबसे कमज़ोर अंडरलाइंग',
  indexN: (n) => `इंडेक्स (${n})`,
  stocksN: (n) => `स्टॉक (${n})`,
  avgPerDay: 'प्रति दिन औसत P&L',
  busyN: (n) => `व्यस्त दिन (${n})`,
  otherN: (n) => `बाक़ी दिन (${n})`,
  busyWorse: 'आपके सबसे व्यस्त दिन औसतन शांत दिनों से बुरे रहे।',
  busyBetter: 'आपके सबसे व्यस्त दिन औसतन शांत दिनों से बेहतर रहे।',
  weekdayNames: { Sun: 'रवि', Mon: 'सोम', Tue: 'मंगल', Wed: 'बुध', Thu: 'गुरु', Fri: 'शुक्र', Sat: 'शनि' },
  bestWorstWeekday: (best, worst) => (
    <>
      सबसे अच्छा {best}, सबसे बुरा {worst}।
    </>
  ),
  avgPerTrade: 'प्रति ट्रेड औसत P&L',
  biggerN: (n) => `बड़ी (${n})`,
  smallerN: (n) => `छोटी (${n})`,
  winRateBigger: 'जीत दर, बड़ी',
  winRateSmaller: 'जीत दर, छोटी',
  medianPosition: (v) => `मीडियन पोज़िशन: ${v}`,
  dragLine: (avgWin, charges) => `औसत मुनाफ़े वाले ट्रेड (हर एक ${avgWin}) सिर्फ़ ${charges} के चार्जेस चुकाने में गए।`,
  perTrade: (v) => `यानी हर ट्रेड पर ${v}।`,

  measure: 'माप',
  changedNote1: 'जहाँ किसी भी अवधि के चार्जेस का अनुमान नहीं लग सकता, वहाँ P&L चार्जेस से पहले का है।',
  changedNote2: '“—” का मतलब है उस अवधि में इस आँकड़े के लिए पर्याप्त ट्रेड नहीं थे।',

  myYear: (year) => `मेरा F&O साल · ${year}`,
  downloadImage: 'इमेज डाउनलोड करें',
  shareSummary: 'शेयर करें',
  shareText: (url) => `मेरा F&O साल, Wrapped · ${url}`,
  savedFallback: 'यहाँ शेयरिंग उपलब्ध नहीं है, इसलिए इमेज सेव कर दी गई।',
  imageFailedRetry: 'इमेज नहीं बन पाई। कृपया फिर कोशिश करें।',
  versions: (engine, rates) => `इंजन ${engine} · दरें ${rates}`,
  siEyebrow: 'मेरा F&O साल, Wrapped',
  chooseStats: 'आँकड़े चुनें',
  chooseStatsHint: 'अपनी इमेज के लिए कोई भी 3 चुनें।',

  months: ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'],

  pTitle: 'आपका डेटा आपके डिवाइस पर ही रहता है',
  pWhatHappens: 'आपकी फ़ाइल के साथ क्या होता है',
  pW1: 'आपका ब्राउज़र आपकी चुनी हुई फ़ाइल पढ़ता है। वह कभी अपलोड नहीं होती; कोई सर्वर है ही नहीं जो उसे ले सके।',
  pW2: 'सारा हिसाब इसी टैब के अंदर एक बैकग्राउंड थ्रेड (Web Worker) में होता है। कार्ड तैयार होते ही वह वर्कर बंद कर दिया जाता है।',
  pW3: (b) => <>कुछ भी सेव नहीं होता: न कुकीज़, न लोकल स्टोरेज, न डेटाबेस। टैब बंद करने या {b('डेटा हटाएँ')} दबाने पर सब कुछ मिट जाता है।</>,
  pW4: 'कोई एनालिटिक्स, ट्रैकर, विज्ञापन या थर्ड-पार्टी स्क्रिप्ट नहीं है।',
  pW5: 'ऑफ़लाइन चलने के लिए आपका ब्राउज़र इस ऐप के अपने कोड (HTML, स्क्रिप्ट और आइकन) की कॉपी रखता है। आपकी फ़ाइलें और नतीजे उस कैश में कभी नहीं जाते।',
  pCheck: 'ख़ुद जाँचें',
  pC1: (b) => (
    <>
      {b('एयरप्लेन-मोड टेस्ट:')} यह साइट खोलें, फिर वाई-फ़ाई और मोबाइल डेटा बंद कर दें। अपनी ट्रेडबुक डालें: यह फिर भी चलती है, क्योंकि
      किसी चीज़ को इंटरनेट की ज़रूरत नहीं। पहली बार के बाद आप साइट ऑफ़लाइन भी खोल सकते हैं या होम स्क्रीन पर इंस्टॉल कर सकते हैं।
    </>
  ),
  pC2: (b) => (
    <>
      {b('नेटवर्क टैब:')} कंप्यूटर पर ब्राउज़र के डेवलपर टूल (F12) → Network खोलें, फिर अपनी फ़ाइल डालें। आपको ऐसी कोई रिक्वेस्ट नहीं
      दिखेगी जो आपका डेटा ले जाए।
    </>
  ),
  pC3: (b, link) => (
    <>
      {b('कोड पढ़ें:')} सब कुछ {link} पर ओपन सोर्स है। एक सख़्त Content-Security-Policy पेज को किसी दूसरी वेबसाइट से संपर्क करने से रोकती है।
    </>
  ),
  pNumbers: 'आँकड़े क्या हैं (और क्या नहीं)',
  pN1: (b) => <>जब तक आप अपने ब्रोकर का P&amp;L स्टेटमेंट नहीं जोड़ते, चार्जेस प्रकाशित दरों से {b('अनुमानित')} हैं।</>,
  pN2: 'एक्सपायर हुई या अभी खुली पोज़िशन का अंदाज़ा लगाने के बजाय उन्हें छोड़ दिया जाता है।',
  pN3: 'यह आपके अपने ट्रेड का आईना है, निवेश, ट्रेडिंग या टैक्स सलाह नहीं।',
  pAffiliation: 'संबद्ध नहीं',
  pA1:
    'F&O Wrapped एक स्वतंत्र ओपन-सोर्स प्रोजेक्ट है। यह Zerodha Broking Ltd, NSE, BSE या Spotify से संबद्ध, समर्थित या प्रायोजित नहीं है। “Zerodha” और “Console” उनके मालिकों के ट्रेडमार्क हैं और यहाँ सिर्फ़ यह बताने के लिए इस्तेमाल हुए हैं कि कौन-सी फ़ाइलें काम करती हैं।',
  pTranslation: 'हिंदी अनुवाद की समीक्षा जारी है। अगर कुछ ग़लत लगे तो GitHub पर बताएँ।',
};

const CATALOGS: Record<Locale, UiMessages> = { en, hi };

/** ?lang=hi|en wins; otherwise the browser's language. Never stored. */
export function detectLocale(): Locale {
  const param = new URLSearchParams(window.location.search).get('lang');
  if (param === 'hi' || param === 'en') return param;
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

interface LocaleState {
  locale: Locale;
  t: UiMessages;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleState>({ locale: 'en', t: en, setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  useEffect(() => {
    document.documentElement.lang = locale === 'hi' ? 'hi-IN' : 'en-IN';
  }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', l);
    window.history.replaceState(null, '', url);
    setLocaleState(l);
  }, []);
  const value = useMemo(() => ({ locale, t: CATALOGS[locale], setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}

/** The current UI messages. */
export function useT(): UiMessages {
  return useContext(LocaleContext).t;
}

/** A small language switch (English ⇄ हिंदी). */
export function LanguageToggle() {
  const { locale, t, setLocale } = useLocale();
  return (
    <button type="button" className="link lang-toggle" lang={locale === 'en' ? 'hi' : 'en'} aria-label={t.switchToLabel} onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}>
      {t.switchTo}
    </button>
  );
}

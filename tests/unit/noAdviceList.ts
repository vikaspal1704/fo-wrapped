/** Shared no-advice phrase list (docs/SPEC.md §1.3), used by every wording test. */

/** Trading instructions, recommendations, predictions and rankings. */
export const BANNED: readonly RegExp[] = [
  /\byou should\b/i,
  /\brecommend/i,
  /\bshould (buy|sell|trade|hold|avoid|stop|take)\b/i,
  /\b(buy|sell|hold) (this|now|more|less)\b/i,
  /\bavoid (trading|expiry|options|futures|selling|buying)\b/i,
  /\bstop trading\b/i,
  /\b(will|going to) (make|lose|earn|profit|win)\b/i,
  /\bguarantee/i,
  /\bpredict/i,
  /\b(top|better than|beat|beats) \d+ ?%/i,
  /\bpercentile\b/i,
  /\btarget price\b/i,
  /सलाह देते/,
  /सुझाव देते/,
  /(खरीदें|बेचें|ट्रेड करें|ट्रेड न करें|ट्रेडिंग बंद करें)/,
  /करना चाहिए/,
  /गारंटी/,
];

/** Every banned phrase found in `text`, with a little context. */
export function violations(text: string): string[] {
  return BANNED.filter((re) => re.test(text)).map((re) => {
    const m = text.match(re)!;
    const at = m.index ?? 0;
    return `${re} near “${text.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, ' ')}”`;
  });
}

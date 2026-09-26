import { describe, expect, it } from 'vitest';
import { RATES, analyze, getLocale, parseTradebook, parseTradebookFile, withLocale, withLocaleSync } from '../../src/engine';
import type { AnalysisResult } from '../../src/engine';
import { HEADER, csv, csvRow, fixture } from './helpers';

const DEVANAGARI = /[ऀ-ॿ]/;

/** Every user-facing string the engine produced for a result. */
function engineStrings(r: AnalysisResult): string[] {
  const out: string[] = [];
  for (const v of r.views) {
    out.push(v.period.label, v.title, ...v.warnings);
    for (const card of Object.values(v.cards)) {
      if ('status' in card) {
        if (card.status === 'OK') out.push(...card.notes);
        else out.push(card.reason);
      }
    }
    out.push(...v.cards.summary.headlines.map((h) => h.label), v.cards.summary.periodTitle);
    if (v.comparison) out.push(...v.comparison.rows.map((row) => row.label), v.comparison.previous.label);
  }
  return out;
}

describe('i18n', () => {
  const year = parseTradebook('y.csv', fixture('synthetic-two-fy.csv'));
  const small = parseTradebook('s.csv', fixture('zerodha-fo-tradebook.synthetic.csv'));

  it('hindi_result_has_no_english_copy', () => {
    for (const books of [[year], [small]]) {
      const r = withLocaleSync('hi', () => analyze({ tradebooks: books, rates: RATES, siteUrl: 'x' }));
      const strings = engineStrings(r).filter((s) => !/^\d{4}$/.test(s)); // calendar-year labels are just digits
      const english = strings.filter((s) => !DEVANAGARI.test(s));
      expect(english).toEqual([]);
    }
  });

  it('english_is_default_and_locale_is_restored', () => {
    expect(getLocale()).toBe('en');
    withLocaleSync('hi', () => expect(getLocale()).toBe('hi'));
    expect(getLocale()).toBe('en');
    expect(() => withLocaleSync('hi', () => { throw new Error('x'); })).toThrow('x');
    expect(getLocale()).toBe('en');
  });

  it('numbers_do_not_depend_on_locale', () => {
    const en = analyze({ tradebooks: [year], rates: RATES, siteUrl: 'x' });
    const hi = withLocaleSync('hi', () => analyze({ tradebooks: [year], rates: RATES, siteUrl: 'x' }));
    expect(hi.totals).toEqual({ ...en.totals, chargesUnavailableReason: hi.totals.chargesUnavailableReason });
    expect(hi.roundTrips).toEqual(en.roundTrips);
    expect(hi.views.map((v) => v.period.id)).toEqual(en.views.map((v) => v.period.id));
  });

  it('errors_are_translated', async () => {
    const bad = csv(HEADER, csvRow({ segment: 'EQ' }));
    const en = await parseTradebookFile('eq.csv', bad).catch((e: { userMessage: string }) => e.userMessage);
    const hi = await withLocale('hi', () => parseTradebookFile('eq.csv', bad).catch((e: { userMessage: string }) => e.userMessage));
    expect(en).toMatch(/Equity tradebook/);
    expect(hi).toMatch(/इक्विटी ट्रेडबुक/);
  });
});

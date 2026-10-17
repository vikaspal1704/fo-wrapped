/**
 * The no-advice rule (docs/SPEC.md §1.3, NA-1 to NA-4) checked against every
 * user-facing catalogue and the launch posts. A phrase list can't prove copy is
 * advice-free, but it catches the common slips; review still applies.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { violations } from './noAdviceList';

const ROOT = join(__dirname, '../..');

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const SOURCES = ['src/app/i18n.tsx', 'src/engine/i18n.ts'];
const launchDocs = () => readdirSync(join(ROOT, 'docs/launch')).filter((f) => f.endsWith('.md')).map((f) => `docs/launch/${f}`);

describe('no advice (SPEC §1.3)', () => {
  it('no_advice_wordlist_catches_examples', () => {
    for (const bad of ['You should avoid expiry days.', 'We recommend selling options.', 'You will make money on Mondays.', 'You beat 80% of traders.', 'एक्सपायरी पर ट्रेड न करें।', 'आपको बेचना करना चाहिए।']) {
      expect(violations(bad), bad).not.toEqual([]);
    }
    for (const fine of ['Buying options did better than selling them.', 'Not investment, trading or tax advice.', 'कम से कम 5 बंद ट्रेड चाहिए।', 'इमेज डाउनलोड करें']) {
      expect(violations(fine), fine).toEqual([]);
    }
  });

  it('copy_passes_no_advice_wordlist', () => {
    const files = [...SOURCES, ...launchDocs()];
    expect(launchDocs().length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const raw = readFileSync(join(ROOT, f), 'utf8');
      expect(violations(f.endsWith('.md') ? raw : stripComments(raw)), f).toEqual([]);
    }
  });
});

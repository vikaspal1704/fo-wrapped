/** Trade Journal, local-only build (docs/SPEC.md §4). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const YEAR = fileURLToPath(new URL('../fixtures/synthetic-year.csv', import.meta.url));
const SMALL = fileURLToPath(new URL('../fixtures/zerodha-fo-tradebook.synthetic.csv', import.meta.url));
const EQUITY = fileURLToPath(new URL('../fixtures/zerodha-eq-tradebook.synthetic.csv', import.meta.url));

async function openJournal(page: Page) {
  await page.goto('./#journal');
  await expect(page.getByRole('heading', { name: 'Trade Journal' })).toBeVisible();
}

async function enableAndImport(page: Page, file = YEAR) {
  await openJournal(page);
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await page.getByTestId('journal-file-input').setInputFiles(file);
  await expect(page.getByRole('status').filter({ hasText: 'new trades added' })).toBeVisible();
}

const dbNames = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

test('e2e_wrapped_needs_no_account', async ({ page }) => {
  // AC-2.1.1, AC-2.2.2: Wrapped works signed out and the Journal's store is never created.
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await expect(page.getByText(/sign in/i)).toHaveCount(0);
  expect(await dbNames(page)).not.toContain('fo-journal');
  // Opening the Journal doesn't create it either, until the user opts in.
  await page.goto('./#journal');
  await expect(page.getByRole('button', { name: 'Save on this device' })).toBeVisible();
  expect(await dbNames(page)).not.toContain('fo-journal');
});

test('e2e_journal_import_and_reload', async ({ page }) => {
  // AC-2.2.1, AC-2.4.1 to AC-2.4.3, AC-2.2.4
  await enableAndImport(page);
  await expect(page.getByRole('status')).toHaveText('240 new trades added, 0 already saved.');
  await page.reload();
  await expect(page.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(1);
  // The same file again adds nothing.
  await page.getByTestId('journal-file-input').setInputFiles(YEAR);
  await expect(page.getByRole('status')).toHaveText('No new trades in these files.');
  // A client ID in the file name is masked in history.
  await page.getByTestId('journal-file-input').setInputFiles({ name: 'tradebook-AB1234-FO.csv', mimeType: 'text/csv', buffer: readFileSync(SMALL) });
  const rows = page.getByRole('list', { name: 'History' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('tradebook-•••-FO.csv');
  await expect(page.getByText('AB1234')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo import tradebook-•••-FO.csv' }).click();
  await expect(rows).toHaveCount(1);
  // Delete everything, with a confirmation step.
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('button', { name: 'Yes, delete everything on this device' }).click();
  await expect(page.getByRole('button', { name: 'Save on this device' })).toBeVisible();
  expect(await dbNames(page)).not.toContain('fo-journal');
});

test('e2e_journal_rules', async ({ page }) => {
  // US-2.5 in the browser.
  await enableAndImport(page);
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await page.getByLabel('Max trades in a day').fill('1');
  await page.getByRole('button', { name: 'Save rules' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rules saved.' })).toBeVisible();
  await expect(page.getByTestId('breaches').getByRole('listitem').first()).toContainText('more than your limit of 1');
  await page.getByLabel('Max trades in a day').fill('-3');
  await page.getByRole('button', { name: 'Save rules' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Use whole numbers above zero.' })).toBeVisible();
});

test('e2e_weekly_report', async ({ page }) => {
  // AC-2.7.1: built on the device, with a share image that carries the disclaimer.
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await enableAndImport(page);
  await page.getByRole('button', { name: 'Weekly report' }).click();
  await expect(page.getByRole('heading', { name: /^Week of / })).toBeVisible();
  await expect(page.locator('.headlines').getByText('Trades closed')).toBeVisible();
  await expect(page.getByTestId('journal-share-image')).toContainText('Not investment, trading or tax advice.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download image' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fo-journal-week-\d{4}-\d\d-\d\d\.png$/);
  // Everything happened on the device: only same-origin GETs for the app's own files.
  const origin = new URL(page.url()).origin;
  for (const r of requests) expect(r.startsWith('GET ') && r.slice(4).startsWith(origin), r).toBe(true);
});

test('e2e_journal_notes_search', async ({ page }) => {
  // AC-2.8.1, AC-2.8.2
  await enableAndImport(page);
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByLabel('Date').fill('2026-05-04');
  await page.getByLabel('Note', { exact: true }).fill('Chased the gap at open');
  await page.getByLabel('Tags (comma separated)').fill('#FOMO, open');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByLabel('A trade').check();
  await page.getByRole('combobox', { name: 'Trade' }).selectOption({ index: 1 });
  await page.getByLabel('Note', { exact: true }).fill('Held too long');
  await page.getByRole('button', { name: 'Save note' }).click();
  const list = page.getByTestId('note-list').getByRole('listitem');
  await expect(list).toHaveCount(2);
  await page.getByLabel('Search notes').fill('#fomo');
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Chased the gap at open');
  await page.reload();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByTestId('note-list').getByRole('listitem')).toHaveCount(2);
});

test('e2e_journal_hindi', async ({ page }) => {
  await page.goto('./?lang=hi#journal');
  await expect(page.getByRole('heading', { name: 'ट्रेड जर्नल' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'इसी डिवाइस पर सहेजें' })).toBeVisible();
});

test('a11y_journal_screens', async ({ page }) => {
  const check = async (where: string) => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The off-screen share-image source is aria-hidden and never seen.
      .exclude('[data-testid="journal-share-image"]')
      .analyze();
    expect(violations.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  };
  await openJournal(page);
  await check('enable');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await page.getByTestId('journal-file-input').setInputFiles(YEAR);
  await expect(page.getByRole('status').filter({ hasText: 'new trades added' })).toBeVisible();
  await page.getByTestId('journal-file-input').setInputFiles(EQUITY);
  await expect(page.getByRole('status').filter({ hasText: '10 new trades added' })).toBeVisible();
  for (const tab of ['History', 'Equity', 'Rules', 'Weekly report', 'Notes']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await check(tab);
  }
});

test('e2e_journal_named_trade_journal', async ({ page }) => {
  // AC-3.5.1: the paid product is the Trade Journal; Wrapped keeps its name.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /F&O Wrapped/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trade Journal/ })).toBeVisible();
  await openJournal(page);
  await expect(page.getByRole('button', { name: '← F&O Wrapped' })).toBeVisible();
});

test('e2e_journal_equity', async ({ page }) => {
  // US-3.1 in the browser: F&O and equity side by side, every gap in words, all on the device.
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await enableAndImport(page, SMALL);
  await page.getByTestId('journal-file-input').setInputFiles({ name: 'tradebook-AB1234-EQ.csv', mimeType: 'text/csv', buffer: readFileSync(EQUITY) });
  await expect(page.getByRole('status')).toHaveText('10 new trades added, 0 already saved.');

  await page.getByRole('button', { name: 'Equity', exact: true }).click();
  await expect(page.getByText('10 equity trades from 2026-10-05 to 2026-10-09.')).toBeVisible();
  const headlines = page.getByTestId('equity-headlines');
  await expect(headlines.getByText('Intraday P&L').locator('..')).toContainText('₹79');
  await expect(headlines.getByText('Delivery P&L (sold)').locator('..')).toContainText('₹126');
  await expect(headlines.getByText('Charges (estimated)').locator('..')).toContainText('₹6');
  await expect(headlines.getByText('Net after estimated charges').locator('..')).toContainText('₹199');
  const gaps = page.getByTestId('equity-gaps');
  await expect(gaps).toContainText('may be up to ₹2 lower');
  await expect(gaps).toContainText('DP charges aren’t included');
  await expect(gaps).toContainText('(3 here)');
  await expect(page.getByTestId('equity-unmatched')).toHaveText('2026-10-09 · TESTB · 5 shares');
  await expect(page.getByTestId('equity-holdings')).toHaveText('TESTC · 2 shares · average buy ₹190 · cost ₹380');
  await expect(page.getByText('no current prices are fetched')).toBeVisible();
  await expect(page.getByTestId('equity-sales').getByRole('listitem')).toHaveText([
    '2026-10-07 · TESTA · 7 shares · ₹46 (bought 2026-10-05)',
    '2026-10-06 · TESTA · 8 shares · ₹80 (bought 2026-10-05)',
  ]);
  await expect(page.getByTestId('equity-intraday').getByRole('listitem')).toHaveCount(3);

  // Rules and the weekly report say they cover F&O only (AC-3.1.15).
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(page.getByText('Rules and the weekly report cover F&O trades only for now.')).toBeVisible();

  // The same file again adds nothing; reload keeps it; Hindi shows the same facts.
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByTestId('journal-file-input').setInputFiles(EQUITY);
  await expect(page.getByRole('status')).toHaveText('No new trades in these files.');
  await page.goto('./?lang=hi#journal');
  await page.getByRole('button', { name: 'इक्विटी', exact: true }).click();
  await expect(page.getByTestId('equity-holdings')).toHaveText('TESTC · 2 शेयर · औसत खरीद ₹190 · लागत ₹380');

  // Undo removes exactly that import's equity trades.
  await page.goto('./#journal');
  await page.getByRole('button', { name: 'Undo import tradebook-•••-EQ.csv' }).click();
  await page.getByRole('button', { name: 'Equity', exact: true }).click();
  await expect(page.getByText('No equity trades yet.')).toBeVisible();

  const origin = new URL(page.url()).origin;
  for (const r of requests) expect(r.startsWith('GET ') && r.slice(4).startsWith(origin), r).toBe(true);
});

/** Phase 1 launch polish (docs/SPEC.md §3). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const YEAR = fileURLToPath(new URL('../fixtures/synthetic-year.csv', import.meta.url));
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const EN_DISCLAIMER = 'Not investment, trading or tax advice.';
const HI_DISCLAIMER = 'यह निवेश, ट्रेडिंग या टैक्स सलाह नहीं है।';

async function toSummary(page: Page, title = 'Your year') {
  const total = Number((await page.getByTestId('slide-count').textContent())!.split('/')[1]);
  for (let i = 1; i < total; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('share_image_has_disclaimer_in_its_language', async ({ page }) => {
  // AC-1.2.2, NA-5: summary image and a single-card image, English and Hindi.
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  const frame = page.getByTestId('card-share-image');
  const sharing = page.getByRole('button', { name: 'Share this card: The number' }).click();
  await expect(frame).toContainText(EN_DISCLAIMER);
  await sharing;
  await toSummary(page);
  await expect(page.getByTestId('share-image')).toContainText(EN_DISCLAIMER);

  await page.goto('./?lang=hi');
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.locator('section.card .card-title').first()).toBeVisible();
  await toSummary(page, 'आपका साल');
  await expect(page.getByTestId('share-image')).toContainText(HI_DISCLAIMER);
});

test('share_image_has_no_file_names', async ({ page }) => {
  // AC-1.2.3, PV-3: the client ID in the file name never reaches an image.
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'tradebook-AB1234-FO.csv', mimeType: 'text/csv', buffer: readFileSync(YEAR) });
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  const frame = page.getByTestId('card-share-image');
  const sharing = page.getByRole('button', { name: 'Share this card: The number' }).click();
  await expect(frame).toBeAttached();
  const cardImage = (await frame.textContent()) ?? '';
  await sharing;
  await toSummary(page);
  const summaryImage = (await page.getByTestId('share-image').textContent()) ?? '';
  for (const text of [cardImage, summaryImage]) {
    expect(text).not.toContain('AB1234');
    expect(text).not.toContain('tradebook');
  }
});

test('e2e_error_links_to_export_guide', async ({ page }) => {
  // AC-1.3.2
  await page.goto('./');
  const header = readFileSync(YEAR, 'utf8').split('\n')[0];
  await page.getByTestId('file-input').setInputFiles({ name: 'tradebook-EQ.csv', mimeType: 'text/csv', buffer: Buffer.from(`${header}\nINFY,INE009A01021,2026-09-22,NSE,EQ,EQ,buy,false,10.000000,1500.000000,1,2,2026-09-22T10:00:00,\n`) });
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'How to export from your broker' }).click();
  await expect(page.getByRole('heading', { name: 'How to download your trades' })).toBeFocused();
});

test('e2e_no_request_carries_file_data', async ({ page, baseURL }) => {
  // AC-1.4.2, PV-1: a marker inside the file never appears in any request.
  const MARKER = 'ZQ7MARK3R9';
  const lines = readFileSync(YEAR, 'utf8').split('\n');
  const cols = lines[0]!.split(',');
  const markerCol = cols.indexOf('isin');
  const row = lines[1]!.split(',');
  row[markerCol] = MARKER;
  lines[1] = row.join(',');

  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const requests: { url: string; method: string; body: string }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? '' }));
  await page.getByTestId('file-input').setInputFiles({ name: 'marked.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await page.getByRole('button', { name: 'Share this card: The number' }).click();
  await toSummary(page);
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download image' }).click()]);

  const origin = new URL(baseURL!).origin;
  for (const r of requests) {
    expect(new URL(r.url).origin, r.url).toBe(origin);
    expect(r.method, r.url).toBe('GET');
    expect(r.url, r.url).not.toContain(MARKER);
    expect(r.body, r.url).not.toContain(MARKER);
  }
});

test('build_has_no_third_party_origins', () => {
  // AC-1.4.3: no analytics, trackers or third-party scripts in the built site.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html|css|webmanifest)$/.test(f)) files.push(p);
    }
  };
  walk(DIST);
  expect(files.length).toBeGreaterThan(3);
  const trackers = /google-analytics|googletagmanager|gtag\(|plausible|mixpanel|segment\.io|hotjar|clarity\.ms|posthog|amplitude|sentry/i;
  for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(trackers);
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  expect(html).not.toMatch(/<script[^>]+src="https?:/);
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/);
  expect(html).toContain("connect-src 'self'");
});

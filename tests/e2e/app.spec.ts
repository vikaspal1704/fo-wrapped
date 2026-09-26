import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const YEAR = fixture('synthetic-year.csv');
const TITLES = [
  'The number',
  'Where the money went',
  'Right but broke',
  'Expiry day',
  'Your clock',
  'Revenge trades',
  'Diamond hands, paper hands',
  'Best day, worst day',
  'Your year',
];

async function upload(page: Page, files: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(files);
}

async function toSummary(page: Page) {
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  const total = Number((await page.getByTestId('slide-count').textContent())!.split('/')[1]);
  for (let i = 1; i < total; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Your year' })).toBeVisible();
}

test('e2e_upload_to_cards', async ({ page }) => {
  await upload(page, YEAR);
  const core = TITLES.slice(0, 8);
  for (const title of core) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Not enough trades to say.')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
  }
  // Optional cards appear only with enough data, so never as "not enough".
  const extras: string[] = [];
  while (!(await page.getByRole('heading', { name: 'Your year' }).isVisible())) {
    extras.push((await page.locator('section.card .card-title').first().textContent())!);
    await expect(page.getByText('Not enough trades to say.')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
  }
  expect(extras).toEqual(['Buyer or seller', 'Busy days', 'Day of the week', 'Position size', 'Charges drag']);
  await expect(page.getByTestId('slide-count')).toHaveText(`${core.length + extras.length + 1} / ${core.length + extras.length + 1}`);
  await expect(page.getByRole('button', { name: 'Download image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(page.locator('section.card').getByText('My F&O year · Samvat 2082')).toBeVisible();
});

test('e2e_skip_to_end', async ({ page }) => {
  await upload(page, YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(page.getByRole('heading', { name: 'Your year' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip to end' })).toHaveCount(0);
});

test('e2e_no_network_during_analysis', async ({ page, baseURL }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));

  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await toSummary(page);

  const origin = new URL(baseURL!).origin;
  for (const r of requests) {
    const url = new URL(r.url);
    expect(url.origin, r.url).toBe(origin);
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
    expect(url.search, r.url).toBe('');
  }
});

test('e2e_no_storage_writes', async ({ page }) => {
  await upload(page, YEAR);
  await toSummary(page);
  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
    cookies: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, idb: 0, cookies: '' });
});

test('e2e_clear_data_resets', async ({ page }) => {
  await upload(page, YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  // The worker that saw the data is terminated when the result arrives;
  // only one fresh, empty spare worker remains.
  await expect.poll(() => page.workers().length).toBe(1);
  await page.getByRole('button', { name: 'Clear data' }).click();
  await expect(page.getByRole('button', { name: 'Drop your tradebook' })).toBeVisible();
  await expect(page.getByText('₹')).toHaveCount(0);
  expect(page.workers()).toHaveLength(1);
});

test('e2e_rejects_wrong_file_with_message', async ({ page }) => {
  const header = readFileSync(YEAR, 'utf8').split('\n')[0];
  const equity = `${header}\nINFY,INE009A01021,2026-09-22,NSE,EQ,EQ,buy,false,10.000000,1500.000000,1,2,2026-09-22T10:00:00,\n`;
  await upload(page, { name: 'tradebook-EQ.csv', mimeType: 'text/csv', buffer: Buffer.from(equity) });
  await expect(page.getByText(/is an Equity tradebook\. F&O Wrapped needs the F&O segment/)).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('e2e_download_image', async ({ page }) => {
  await upload(page, YEAR);
  await toSummary(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download image' }).click()]);
  expect(download.suggestedFilename()).toBe('fo-wrapped-samvat-2082.png');
  const png = readFileSync((await download.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test('e2e_mobile_viewport_swipe', async ({ page }) => {
    await upload(page, YEAR);
    const card = page.locator('section.card');
    await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
    const box = (await card.boundingBox())!;
    const y = box.y + box.height / 2;
    const swipe = async (from: number, to: number) => {
      await page.mouse.move(from, y);
      await page.mouse.down();
      await page.mouse.move(to, y, { steps: 5 });
      await page.mouse.up();
    };
    await swipe(box.x + box.width * 0.8, box.x + box.width * 0.2);
    await expect(page.getByRole('heading', { name: 'Where the money went' })).toBeVisible();
    await swipe(box.x + box.width * 0.2, box.x + box.width * 0.8);
    await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
    // Tapping the right side also advances.
    await card.click({ position: { x: box.width * 0.85, y: box.height * 0.5 } });
    await expect(page.getByRole('heading', { name: 'Where the money went' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test('e2e_works_offline_after_load', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await toSummary(page);
  await context.setOffline(false);
});

test('e2e_privacy_page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Privacy & about' }).click();
  await expect(page.getByRole('heading', { name: 'Your data stays on your device' })).toBeVisible();
  await expect(page.getByText(/not affiliated with, endorsed by or sponsored by Zerodha/)).toBeVisible();
  await expect(page).toHaveURL(/#privacy$/);
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('button', { name: 'Drop your tradebook' })).toBeVisible();
});

test('e2e_upload_xlsx', async ({ page }) => {
  const { default: writeExcelFile } = await import('write-excel-file/node');
  const [header, ...rows] = readFileSync(YEAR, 'utf8').trim().split('\n').map((l) => l.split(','));
  const typed = rows.map((r) =>
    r.map((v, i) => {
      const name = header![i];
      if (v === '') return null;
      if (name === 'trade_date' || name === 'expiry_date') return { value: new Date(`${v}T00:00:00Z`), type: Date, format: 'yyyy-mm-dd' };
      if (name === 'order_execution_time') return { value: new Date(`${v}Z`), type: Date, format: 'yyyy-mm-dd hh:mm:ss' };
      if (name === 'quantity' || name === 'price') return Number(v);
      return v;
    }),
  );
  const buffer: Buffer = await writeExcelFile([['Tradebook'], [], header!, ...typed] as never).toBuffer();
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'tradebook-FO.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  // Same numbers as the CSV version of the same year.
  await toSummary(page);
  await expect(page.getByText('−₹4,491').first()).toBeVisible();
});

test('e2e_period_picker_and_comparison', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(fixture('synthetic-two-fy.csv'));
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  const picker = page.getByLabel('Period');
  // Default: the latest Samvat year with at least 10 trades.
  await expect(picker).toHaveValue('samvat-2082');
  await picker.selectOption({ label: 'FY 2026-27' });
  await expect(page.locator('section.card').getByText(/· FY 2026-27/)).toBeVisible();
  // The comparison card sits just before the summary.
  const total = Number((await page.getByTestId('slide-count').textContent())!.split('/')[1]);
  for (let i = 1; i < total - 1; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('FY 2025-26');
  await expect(page.getByRole('rowheader', { name: 'Trades', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Your year' })).toBeVisible();
  await expect(page.getByText('My F&O year · FY 2026-27')).toBeVisible();
});

test('e2e_share_single_card', async ({ page }) => {
  await upload(page, YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Right but broke' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Share this card: Right but broke' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('fo-wrapped-samvat-2082-right-but-broke.png');
  const path = (await download.path())!;
  const png = readFileSync(path);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  if (process.env.SHOTS_DIR) (await import('node:fs')).copyFileSync(path, `${process.env.SHOTS_DIR}/card-share.png`);
  // The off-screen frame exists only while exporting.
  await expect(page.getByTestId('card-share-image')).toHaveCount(0);
  // The card is still interactive afterwards.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Expiry day' })).toBeVisible();
});

test('e2e_pwa_reload_offline', async ({ page, context }) => {
  await page.goto('./');
  // Wait for the service worker to install and control the page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Drop your tradebook' })).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  await context.setOffline(false);
});

test('e2e_manifest_is_installable', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
  expect(manifest).toMatchObject({ name: 'F&O Wrapped', display: 'standalone', start_url: './' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});

test('e2e_hindi_toggle_and_url', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'हिंदी में देखें' }).click();
  await expect(page).toHaveURL(/\?lang=hi/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-IN');
  await expect(page.getByRole('button', { name: 'अपनी ट्रेडबुक डालें' })).toBeVisible();

  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'आपका आँकड़ा' })).toBeVisible();
  await expect(page.locator('section.card').getByText('संवत 2082')).toBeVisible();

  // Switching language on the cards screen is instant: both languages were computed.
  await page.goto('./?lang=en');
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  // Nothing stored: a fresh load without ?lang follows the browser (English here).
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Drop your tradebook' })).toBeVisible();
});

test.describe('hindi browser', () => {
  test.use({ locale: 'hi-IN' });
  test('e2e_hindi_follows_browser_language', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'अपनी ट्रेडबुक डालें' })).toBeVisible();
    const { readFileSync: read } = await import('node:fs');
    const header = read(YEAR, 'utf8').split('\n')[0];
    const equity = `${header}\nINFY,INE009A01021,2026-09-22,NSE,EQ,EQ,buy,false,10.000000,1500.000000,1,2,2026-09-22T10:00:00,\n`;
    await page.getByTestId('file-input').setInputFiles({ name: 'eq.csv', mimeType: 'text/csv', buffer: Buffer.from(equity) });
    await expect(page.getByText(/इक्विटी ट्रेडबुक है/).first()).toBeVisible();
  });
});

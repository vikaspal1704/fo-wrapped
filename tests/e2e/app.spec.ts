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
  for (let i = 1; i < TITLES.length; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Your year' })).toBeVisible();
}

test('e2e_upload_to_cards', async ({ page }) => {
  await upload(page, YEAR);
  for (const [i, title] of TITLES.entries()) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(`${i + 1} / ${TITLES.length}`)).toBeVisible();
    await expect(page.getByText('Not enough trades to say.')).toHaveCount(0);
    if (i < TITLES.length - 1) await page.keyboard.press('ArrowRight');
  }
  await expect(page.getByRole('button', { name: 'Download image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(page.getByText('Samvat 2082').first()).toBeVisible();
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
  expect(download.suggestedFilename()).toBe('fo-wrapped-2082.png');
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

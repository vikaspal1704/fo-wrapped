/**
 * F&O Journal, cloud build, against a mocked Supabase (docs/SPEC.md US-2.1,
 * US-2.3). The build is given VITE_SUPABASE_URL=https://cloud.test, so its CSP
 * allows exactly that origin; Playwright answers for it.
 */
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';

const YEAR = fileURLToPath(new URL('../fixtures/synthetic-year.csv', import.meta.url));
const USER = '00000000-0000-0000-0000-00000000000a';

function mockSupabase(page: Page, opts: { active: boolean }) {
  const sent: { method: string; url: string; body: string }[] = [];
  const profiles: unknown[] = [];
  const records: Record<string, unknown>[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  return {
    sent,
    install: () =>
      page.route('https://cloud.test/**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        sent.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (url.pathname === '/auth/v1/authorize') {
          return route.fulfill({ status: 302, headers: { location: `${url.searchParams.get('redirect_to')}&code=TESTCODE` } });
        }
        if (url.pathname === '/auth/v1/token') return json(route, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: USER, email: 'trader@example.invalid' } });
        if (url.pathname === '/rest/v1/entitlements') {
          return json(route, opts.active ? [{ status: 'active', plan: 'annual', current_period_end: '2099-01-01T00:00:00Z' }] : []);
        }
        if (url.pathname === '/rest/v1/journal_profiles') {
          if (req.method() === 'POST') {
            profiles.push(JSON.parse(req.postData()!));
            return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
          }
          return json(route, profiles);
        }
        if (url.pathname === '/rest/v1/journal_records') {
          if (req.method() === 'POST') {
            for (const r of JSON.parse(req.postData()!) as Record<string, unknown>[]) records.push({ ...r, updated_at: new Date().toISOString() });
            return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
          }
          return json(route, records);
        }
        if (url.pathname === '/functions/v1/create-subscription') return json(route, { id: 'sub_1', url: 'https://rzp.io/i/test' });
        return json(route, { error: 'not mocked' }, 404);
      }),
  };
}

async function enable(page: Page) {
  await page.goto('./#journal');
  await page.getByRole('button', { name: 'Save on this device' }).click();
}

test('e2e_cloud_locked_until_plan_then_subscribe', async ({ page }) => {
  const sb = mockSupabase(page, { active: false });
  await sb.install();
  await page.route('https://rzp.io/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Razorpay hosted page</h1>' }));
  await enable(page);
  await expect(page.getByText('Sign in and choose a plan to use the Journal on this site.')).toBeVisible();
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  // Back from the (mocked) Google sign-in with a PKCE code.
  await expect(page.getByText('Signed in as trader@example.invalid')).toBeVisible();
  const tokenCall = sb.sent.find((r) => r.url.includes('/auth/v1/token'))!;
  expect(JSON.parse(tokenCall.body)).toMatchObject({ auth_code: 'TESTCODE' });
  expect(JSON.parse(tokenCall.body).code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: /Subscribe Monthly/ }).click();
  await expect(page.getByRole('heading', { name: 'Razorpay hosted page' })).toBeVisible();
});

test('e2e_key_loss_warning_shown_and_sync_sends_only_ciphertext', async ({ page }) => {
  // AC-2.3.1, AC-2.3.3
  const sb = mockSupabase(page, { active: true });
  await sb.install();
  await enable(page);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByText(/plan is active until 2099-01-01/)).toBeVisible();
  await expect(page.getByTestId('key-loss-warning')).toContainText('can’t be recovered by anyone');
  await page.getByText('Forgot your passphrase?').click();
  await expect(page.getByText('Synced data can’t be recovered without the passphrase.')).toBeVisible();

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByTestId('journal-file-input').setInputFiles(YEAR);
  await expect(page.getByRole('status').filter({ hasText: 'new trades added' })).toBeVisible();
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByLabel('Sync passphrase (at least 12 characters)').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/^Synced: \d+ sent/)).toBeVisible({ timeout: 30_000 });

  const uploads = sb.sent.filter((r) => r.method === 'POST' && r.url.includes('/rest/v1/')).map((r) => r.body).join('\n');
  expect(uploads.length).toBeGreaterThan(1000);
  for (const plain of ['NIFTY', 'trade_id', 'tradeId', 'synthetic-year', 'correct horse']) expect(uploads).not.toContain(plain);
  // Wrapped's own pages still talk to nobody but the site and the configured project.
  for (const r of sb.sent) expect(new URL(r.url).origin).toBe('https://cloud.test');
});

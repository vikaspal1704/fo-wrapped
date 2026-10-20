/**
 * The complete user journey (docs/SPEC.md AC-2.11.1), against the local stack
 * in tests/journey/stack.ts: the cloud build of the app, the shipped migration
 * on Postgres, the real PostgREST enforcing RLS, and the real Edge Function
 * handlers. Google's consent screen, Razorpay's checkout and email are
 * simulated by the stack.
 */
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const STACK = 'http://127.0.0.1:54321';
const CRON_SECRET = 'journey-cron-secret';
const YEAR = fileURLToPath(new URL('../fixtures/synthetic-year.csv', import.meta.url));
const EMAIL = 'trader@example.invalid';
const PASSPHRASE = 'monsoon tiffin auto rickshaw';

const sql = async <T = Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> =>
  (await fetch(`${STACK}/test/sql`, { method: 'POST', body: JSON.stringify({ q, params }) })).json() as Promise<T[]>;
const userId = async () => (await sql<{ id: string }>('select id from auth.users where email = $1', [EMAIL]))[0]?.id ?? null;

/** Razorpay's short links redirect to its checkout; here, to the stack's checkout double. */
async function routeRazorpay(context: BrowserContext) {
  await context.route('https://rzp.io/i/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ status: 302, headers: { location: `${STACK}/razorpay/i/${id}` } });
  });
}

async function openJournalAccount(page: Page) {
  await page.goto('./#journal');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await expect(page.getByText('Sign in and choose a plan to use the Journal on this site.')).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
}

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with Google' })).toBeVisible();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
}

async function sync(page: Page, passphrase = PASSPHRASE) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByLabel('Sync passphrase (at least 12 characters)').fill(passphrase);
  await page.getByRole('button', { name: 'Sync now' }).click();
}

/** Syncs and waits for this sync's own result (the old message is cleared when a sync starts). */
async function syncAndWait(page: Page, passphrase = PASSPHRASE) {
  await sync(page, passphrase);
  await expect(page.getByText(/^Synced: \d+ sent, \d+ received\./)).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial' });

test('e2e_journey_complete_user_flow', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const deviceA = await browser.newContext({ baseURL, acceptDownloads: true });
  const deviceB = await browser.newContext({ baseURL });
  await routeRazorpay(deviceA);
  await routeRazorpay(deviceB);
  const a = await deviceA.newPage();
  const b = await deviceB.newPage();
  let weekHeading = '';
  let weekNet = '';

  await test.step('Wrapped works signed out and talks to nobody', async () => {
    await a.goto('./');
    await a.waitForLoadState('networkidle');
    const requests: string[] = [];
    a.on('request', (r) => requests.push(r.url()));
    await a.getByTestId('file-input').setInputFiles(YEAR);
    await expect(a.getByRole('heading', { name: 'The number' })).toBeVisible();
    await a.getByRole('button', { name: 'Skip to end' }).click();
    const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Download image' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(requests.filter((u) => !u.startsWith(new URL(baseURL!).origin))).toEqual([]);
    await a.getByRole('button', { name: 'Clear data' }).first().click();
  });

  await test.step('Journal: opt in, then sign in with Google (PKCE)', async () => {
    await openJournalAccount(a);
    await signIn(a);
    await expect(a.getByText('The Journal needs a plan on this site.')).toBeVisible();
    expect(await userId()).not.toBeNull();
  });

  await test.step('Subscribe monthly on Razorpay; the signed webhook activates the plan', async () => {
    await a.getByRole('button', { name: /Subscribe Monthly/ }).click();
    await expect(a.getByRole('heading', { name: 'Razorpay Checkout' })).toBeVisible();
    await a.getByRole('button', { name: 'Pay with UPI' }).click();
    await expect(a.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
    await a.getByRole('link', { name: 'Back to F&O Journal' }).click();
    await a.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(a.getByText(/Your Monthly plan is active until \d{4}-\d\d-\d\d\./)).toBeVisible();
    const [ent] = await sql('select status, plan, cancel_at_period_end from entitlements where user_id = $1', [await userId()]);
    expect(ent).toEqual({ status: 'active', plan: 'monthly', cancel_at_period_end: false });
  });

  await test.step('Import, rules, notes and the weekly report on device A', async () => {
    await a.getByRole('button', { name: 'History', exact: true }).click();
    await a.getByTestId('journal-file-input').setInputFiles(YEAR);
    await expect(a.getByRole('status').filter({ hasText: '240 new trades added' })).toBeVisible();
    await a.getByRole('button', { name: 'Rules', exact: true }).click();
    await a.getByLabel('Max trades in a day').fill('2');
    await a.getByRole('button', { name: 'Save rules' }).click();
    await expect(a.getByTestId('breaches').getByRole('listitem').first()).toContainText('more than your limit of 2');
    await a.getByRole('button', { name: 'Notes', exact: true }).click();
    await a.getByLabel('Date').fill('2026-03-04');
    await a.getByLabel('Note', { exact: true }).fill('Entered before the plan said so');
    await a.getByLabel('Tags (comma separated)').fill('fomo');
    await a.getByRole('button', { name: 'Save note' }).click();
    await a.getByRole('button', { name: 'Weekly report' }).click();
    weekHeading = (await a.getByRole('heading', { level: 2 }).textContent()) ?? '';
    weekNet = (await a.locator('.headlines dd').first().textContent()) ?? '';
    expect(weekHeading).toMatch(/^Week of /);
  });

  await test.step('Reminders on; the choice is saved on the server and shown again', async () => {
    await a.getByRole('button', { name: 'Account', exact: true }).click();
    await a.getByLabel(/Email me when my weekly report is ready/).check();
    await expect.poll(async () => (await sql('select weekly from reminder_prefs where user_id = $1', [await userId()]))[0]).toEqual({ weekly: true });
    await a.reload();
    await a.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(a.getByLabel(/Email me when my weekly report is ready/)).toBeChecked();
  });

  await test.step('Sync from device A: the server gets ciphertext only', async () => {
    await sync(a);
    await expect(a.getByText(/^Synced: 3 sent/)).toBeVisible({ timeout: 60_000 });
    const rows = await sql<{ collection: string; record_id: string; ciphertext: string }>('select collection, record_id, ciphertext from journal_records where user_id = $1 order by collection', [await userId()]);
    expect(rows.map((r) => r.collection)).toEqual(['imports', 'notes', 'rules']);
    const stored = JSON.stringify(rows);
    for (const plain of ['NIFTY', 'Entered before', 'fomo', 'synthetic-year', 'maxTradesPerDay', PASSPHRASE]) expect(stored).not.toContain(plain);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.record_id))).toBe(true);
  });

  await test.step('Device B: same account, wrong passphrase refused, right one restores everything', async () => {
    await openJournalAccount(b);
    await signIn(b);
    await expect(b.getByText(/Your Monthly plan is active until/)).toBeVisible();
    await expect(b.getByLabel(/Email me when my weekly report is ready/)).toBeChecked();
    await sync(b, 'not the right passphrase');
    await expect(b.getByRole('alert')).toContainText('doesn’t open your synced Journal');
    await sync(b);
    await expect(b.getByText(/^Synced: \d+ sent, 3 received\./)).toBeVisible({ timeout: 60_000 });
    await b.getByRole('button', { name: 'History', exact: true }).click();
    await expect(b.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(1);
    await b.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(b.getByTestId('note-list')).toContainText('Entered before the plan said so');
    await b.getByRole('button', { name: 'Rules', exact: true }).click();
    await expect(b.getByLabel('Max trades in a day')).toHaveValue('2');
    await b.getByRole('button', { name: 'Weekly report' }).click();
    await expect(b.getByRole('heading', { level: 2 })).toHaveText(weekHeading);
    await expect(b.locator('.headlines dd').first()).toHaveText(weekNet);
  });

  await test.step('Two-way: a note written on B reaches A', async () => {
    await b.getByRole('button', { name: 'Notes', exact: true }).click();
    await b.getByLabel('Date').fill('2026-03-03');
    await b.getByLabel('Note', { exact: true }).fill('Written on the second device');
    await b.getByRole('button', { name: 'Save note' }).click();
    await syncAndWait(b);
    await syncAndWait(a);
    await a.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(a.getByTestId('note-list')).toContainText('Written on the second device');
  });

  await test.step('A replayed Razorpay webhook changes nothing', async () => {
    const [sub] = (await (await fetch(`${STACK}/test/subs`)).json()) as { id: string }[];
    const send = () => fetch(`${STACK}/test/razorpay/event`, { method: 'POST', body: JSON.stringify({ subscriptionId: sub!.id, event: 'subscription.charged', eventId: 'evt_replay_1' }) }).then((r) => r.json());
    expect(await send()).toEqual({ status: 200, body: 'ok' });
    expect(await send()).toEqual({ status: 200, body: 'duplicate' });
  });

  await test.step('Weekly reminder: one email, no numbers, and its unsubscribe link works', async () => {
    const res = await fetch(`${STACK}/functions/v1/weekly-reminder`, { method: 'POST', headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(await res.json()).toEqual({ sent: 1 });
    const [mail] = (await (await fetch(`${STACK}/test/outbox`)).json()) as { to: string; subject: string; text: string }[];
    expect(mail!.to).toBe(EMAIL);
    expect(`${mail!.subject}\n${mail!.text}`.replace(/https?:\/\/\S+/g, '')).not.toMatch(/\d|₹|NIFTY/);
    const unsubscribe = /Stop these emails: (\S+)/.exec(mail!.text)![1]!;
    await a.goto(unsubscribe);
    await expect(a.getByText('You will not get weekly reminder emails any more.')).toBeVisible();
    expect((await sql('select weekly from reminder_prefs where user_id = $1', [await userId()]))[0]).toEqual({ weekly: false });
    await a.goto('./#journal');
    await a.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(a.getByLabel(/Email me when my weekly report is ready/)).not.toBeChecked();
  });

  await test.step('Cancel: no renewal, plan runs to the end of the period', async () => {
    await a.getByRole('button', { name: 'Cancel subscription' }).click();
    await a.getByRole('button', { name: 'Yes, stop renewing' }).click();
    await expect(a.getByText(/Your plan won’t renew\. It ends on \d{4}-\d\d-\d\d\./)).toBeVisible();
    const subs = (await (await fetch(`${STACK}/test/subs`)).json()) as { cancelAtCycleEnd: boolean }[];
    expect(subs[0]!.cancelAtCycleEnd).toBe(true);
    expect((await sql('select status, cancel_at_period_end from entitlements where user_id = $1', [await userId()]))[0]).toEqual({ status: 'active', cancel_at_period_end: true });
  });

  await test.step('Delete the synced copy from device B; local data stays', async () => {
    await b.reload();
    await b.getByRole('button', { name: 'Account', exact: true }).click();
    await b.getByRole('button', { name: 'Delete the synced copy' }).click();
    await b.getByRole('button', { name: 'Yes, delete the synced copy' }).click();
    await expect(b.getByText('The synced copy was deleted from the server.')).toBeVisible();
    const id = await userId();
    expect(await sql('select count(*)::int as n from journal_records where user_id = $1', [id])).toEqual([{ n: 0 }]);
    expect(await sql('select count(*)::int as n from journal_profiles where user_id = $1', [id])).toEqual([{ n: 0 }]);
    await b.getByRole('button', { name: 'History', exact: true }).click();
    await expect(b.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(1);
  });

  await test.step('The period ends: the Journal locks, but local data can still be deleted', async () => {
    const [sub] = (await (await fetch(`${STACK}/test/subs`)).json()) as { id: string }[];
    await fetch(`${STACK}/test/razorpay/event`, { method: 'POST', body: JSON.stringify({ subscriptionId: sub!.id, event: 'subscription.cancelled', status: 'cancelled' }) });
    expect((await sql('select status from entitlements where user_id = $1', [await userId()]))[0]).toEqual({ status: 'cancelled' });
    await b.reload();
    await expect(b.getByText('Sign in and choose a plan to use the Journal on this site.')).toBeVisible();
    await b.getByRole('button', { name: 'Delete everything' }).click();
    await b.getByRole('button', { name: 'Yes, delete everything on this device' }).click();
    await expect(b.getByRole('button', { name: 'Save on this device' })).toBeVisible();
    expect(await b.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('fo-journal');
  });

  await test.step('Delete the account from device A: everything on the server goes', async () => {
    const id = await userId();
    await a.reload();
    await a.getByRole('button', { name: 'Account', exact: true }).click();
    await a.getByRole('button', { name: 'Delete my account' }).click();
    await a.getByRole('button', { name: 'Yes, delete my account' }).click();
    await expect(a.getByText('Your account was deleted.')).toBeVisible();
    await expect(a.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    for (const table of ['entitlements', 'reminder_prefs', 'journal_records', 'journal_profiles']) {
      expect(await sql(`select count(*)::int as n from ${table} where user_id = $1`, [id]), table).toEqual([{ n: 0 }]);
    }
    expect(await userId()).toBeNull();
    // The function logs never held payment or personal data.
    const logs = JSON.stringify(await (await fetch(`${STACK}/test/logs`)).json());
    for (const secret of [EMAIL, id!, 'plan_journey_monthly']) expect(logs).not.toContain(secret);
  });

  await deviceA.close();
  await deviceB.close();
});

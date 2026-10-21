/**
 * A local, self-contained stand-in for the Journal's cloud, for the end-to-end
 * journey test (docs/SPEC.md US-2.11). Test tooling only.
 *
 * Real: the shipped SQL migration on Postgres (PGlite) with Supabase's default
 * privileges, the real PostgREST server enforcing RLS with real JWTs, and the
 * real Edge Function handlers from supabase/functions/_shared.
 * Simulated: Google's consent screen (PKCE is checked for real), Razorpay's
 * checkout page and API (webhooks are HMAC-signed for real), and the email
 * provider (an outbox).
 *
 *   node --experimental-strip-types tests/journey/stack.ts
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { handleCancelSubscription, handleDeleteAccount } from '../../supabase/functions/_shared/account.ts';
import type { SafeLogFields } from '../../supabase/functions/_shared/log.ts';
import { billingStore, cancelAtRazorpay, deleteAuthUser, markCancelAtPeriodEnd, turnOffReminders, userFromToken, weeklyRecipients } from '../../supabase/functions/_shared/postgrest.ts';
import { handleWebhook, type Plan } from '../../supabase/functions/_shared/razorpay.ts';
import { handleUnsubscribe, runWeeklyReminders, type ReminderEmail } from '../../supabase/functions/_shared/reminders.ts';
import { handleCreateSubscription } from '../../supabase/functions/_shared/subscription.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const GATEWAY_PORT = 54321;
const PG_PORT = 54329;
const PGRST_PORT = 54330;
const GATEWAY = `http://127.0.0.1:${GATEWAY_PORT}`;
const SITE = process.env.JOURNEY_SITE ?? 'http://localhost:4176/fo-wrapped/';
const JWT_SECRET = 'journey-test-jwt-secret-0123456789abcdef';
const WEBHOOK_SECRET = 'whsec_journey_test';
const RZP = { keyId: 'rzp_test_journey', keySecret: 'rzp_test_journey_secret' };
const PLANS: Record<Plan, string> = { monthly: 'plan_journey_monthly', annual: 'plan_journey_annual' };
export const CRON_SECRET = 'journey-cron-secret';

// ---- JWTs (HS256), as Supabase issues them -------------------------------

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');
function sign(claims: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${b64url(createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest())}`;
}
function verify(token: string): Record<string, unknown> | null {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  if (b64url(createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest()) !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
  return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() ? claims : null;
}
const SERVICE_KEY = sign({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 86_400 });

// ---- Database ------------------------------------------------------------

const BOOTSTRAP = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique not null, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const db = await PGlite.create();
await db.exec(BOOTSTRAP);
for (const f of readdirSync(`${ROOT}supabase/migrations`).sort()) await db.exec(readFileSync(`${ROOT}supabase/migrations/${f}`, 'utf8'));
const socket = new PGLiteSocketServer({ db, port: PG_PORT, host: '127.0.0.1' });
await socket.start();

/** Direct SQL for the stack itself (users, test assertions), never inside PostgREST's transactions. */
async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
  while (db.isInTransaction()) await new Promise((r) => setTimeout(r, 5));
  return (await db.query<T>(q, params)).rows;
}

const pgrstBin = execFileSync('node', [`${ROOT}scripts/get-postgrest.mjs`], { encoding: 'utf8' }).trim();
const pgrst = spawn(pgrstBin, [], {
  env: {
    PGRST_DB_URI: `postgres://postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_DB_POOL: '1',
    PGRST_DB_CHANNEL_ENABLED: 'false',
    PGRST_DB_PREPARED_STATEMENTS: 'false',
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_SERVER_PORT: String(PGRST_PORT),
    PGRST_LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PGRST_PORT}/`, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } })).ok) break;
  } catch {
    /* starting */
  }
  if (i > 200) throw new Error('PostgREST did not start');
  await new Promise((r) => setTimeout(r, 100));
}

// ---- Simulated Google, Razorpay and email ---------------------------------

const codes = new Map<string, { userId: string; email: string; challenge: string }>();
const refreshTokens = new Map<string, { userId: string; email: string }>();
interface Sub {
  id: string;
  planId: string;
  userId: string;
  status: string;
  cancelAtCycleEnd: boolean;
  currentEnd: number;
}
const subs = new Map<string, Sub>();
const outbox: (ReminderEmail & { to: string })[] = [];
const functionLogs: SafeLogFields[] = [];
const log = (f: SafeLogFields) => void functionLogs.push(f);
let eventClock = Math.floor(Date.now() / 1000);

function issueTokens(user: { userId: string; email: string }) {
  const refresh = randomBytes(24).toString('hex');
  refreshTokens.set(refresh, user);
  const access = sign({ role: 'authenticated', aud: 'authenticated', sub: user.userId, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: refresh, user: { id: user.userId, email: user.email } };
}

/** Sends a Razorpay-shaped, HMAC-signed subscription event to the real webhook handler. */
async function sendEvent(sub: Sub, event: string, opts: { eventId?: string; createdAt?: number } = {}) {
  const body = JSON.stringify({
    entity: 'event',
    event,
    created_at: opts.createdAt ?? ++eventClock,
    payload: { subscription: { entity: { id: sub.id, plan_id: sub.planId, status: sub.status, current_end: sub.currentEnd, notes: { user_id: sub.userId } } } },
  });
  const res = await fetch(`${GATEWAY}/functions/v1/razorpay-webhook`, {
    method: 'POST',
    headers: { 'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'), 'x-razorpay-event-id': opts.eventId ?? `evt_${randomBytes(8).toString('hex')}` },
    body,
  });
  return { status: res.status, body: await res.text() };
}

/** The Razorpay API as the Edge Functions call it (Basic auth checked). */
async function fakeRazorpay(url: URL, init: RequestInit): Promise<Response> {
  if (init.headers && (init.headers as Record<string, string>).Authorization !== `Basic ${btoa(`${RZP.keyId}:${RZP.keySecret}`)}`) return new Response('{"error":"auth"}', { status: 401 });
  const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
  if (url.pathname === '/v1/subscriptions') {
    const id = `sub_${randomBytes(7).toString('hex')}`;
    subs.set(id, { id, planId: String(body.plan_id), userId: String((body.notes as { user_id: string }).user_id), status: 'created', cancelAtCycleEnd: false, currentEnd: 0 });
    return Response.json({ id, short_url: `https://rzp.io/i/${id}`, status: 'created' });
  }
  const cancel = /^\/v1\/subscriptions\/([^/]+)\/cancel$/.exec(url.pathname);
  if (cancel) {
    const sub = subs.get(cancel[1]!);
    if (!sub) return new Response('{"error":"not found"}', { status: 404 });
    if (body.cancel_at_cycle_end === 1) sub.cancelAtCycleEnd = true;
    else {
      sub.status = 'cancelled';
      setTimeout(() => void sendEvent(sub, 'subscription.cancelled'), 10);
    }
    return Response.json({ id: sub.id, status: sub.status });
  }
  return new Response('{"error":"unknown"}', { status: 404 });
}

const stackFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.razorpay.com') return fakeRazorpay(url, init);
  return fetch(input, init);
};

const rest = { url: GATEWAY, serviceKey: SERVICE_KEY, anonKey: 'journey-anon-key', fetch: stackFetch };
const accountDeps = {
  userFromToken: (t: string) => userFromToken(rest, t),
  getEntitlement: (u: string) => billingStore(rest).getEntitlement(u),
  cancelAtRazorpay: (id: string, atEnd: boolean) => cancelAtRazorpay({ ...RZP, fetch: stackFetch }, id, atEnd),
  markCancelAtPeriodEnd: (u: string) => markCancelAtPeriodEnd(rest, u),
  deleteUser: (u: string) => deleteAuthUser(rest, u),
  log,
};

// ---- HTTP gateway ---------------------------------------------------------

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', 'access-control-expose-headers': 'content-range' };
const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};
const send = (res: ServerResponse, status: number, body: string, type = 'application/json', extra: Record<string, string> = {}) => {
  res.writeHead(status, { ...CORS, 'content-type': type, ...extra });
  res.end(body);
};
const html = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main>${body}</main></body></html>`;
const bearer = (req: IncomingMessage) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', GATEWAY);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // PostgREST, as Supabase's gateway exposes it.
  if (path.startsWith('/rest/v1/')) {
    const headers: Record<string, string> = {};
    for (const h of ['authorization', 'content-type', 'prefer', 'accept']) if (req.headers[h]) headers[h] = String(req.headers[h]);
    const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : await readBody(req);
    const up = await fetch(`http://127.0.0.1:${PGRST_PORT}${path.slice('/rest/v1'.length)}${url.search}`, { method: req.method, headers, body });
    const extra: Record<string, string> = {};
    const range = up.headers.get('content-range');
    if (range) extra['content-range'] = range;
    return send(res, up.status, await up.text(), up.headers.get('content-type') ?? 'application/json', extra);
  }

  // Supabase Auth with a simulated Google consent screen.
  if (path === '/auth/v1/authorize') {
    const p = url.searchParams;
    if (p.get('provider') !== 'google' || p.get('code_challenge_method') !== 's256' || !p.get('code_challenge')) return send(res, 400, '{"error":"bad authorize request"}');
    return send(
      res,
      200,
      html(
        'Choose an account – Google (test double)',
        `<h1>Sign in with Google</h1><p>Test double for Google's consent screen.</p>
         <form method="post" action="/auth/v1/authorize/consent">
           <input type="hidden" name="redirect_to" value="${p.get('redirect_to')}">
           <input type="hidden" name="code_challenge" value="${p.get('code_challenge')}">
           <label>Email <input name="email" type="email" required></label>
           <button type="submit">Continue</button>
         </form>`,
      ),
      'text/html; charset=utf-8',
    );
  }
  if (path === '/auth/v1/authorize/consent' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const email = form.get('email')!.toLowerCase();
    await sql('insert into auth.users (email) values ($1) on conflict (email) do nothing', [email]);
    const [user] = await sql<{ id: string }>('select id from auth.users where email = $1', [email]);
    const code = randomBytes(16).toString('hex');
    codes.set(code, { userId: user!.id, email, challenge: form.get('code_challenge')! });
    const to = form.get('redirect_to')!;
    return send(res, 303, '', 'text/plain', { location: `${to}${to.includes('?') ? '&' : '?'}code=${code}` });
  }
  if (path === '/auth/v1/token' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as Record<string, string>;
    const grant = url.searchParams.get('grant_type');
    if (grant === 'pkce') {
      const entry = codes.get(body.auth_code ?? '');
      codes.delete(body.auth_code ?? '');
      const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url');
      if (!entry || entry.challenge !== challenge) return send(res, 400, '{"error":"invalid_grant"}');
      return send(res, 200, JSON.stringify(issueTokens(entry)));
    }
    if (grant === 'refresh_token') {
      const entry = refreshTokens.get(body.refresh_token ?? '');
      if (!entry) return send(res, 400, '{"error":"invalid_grant"}');
      refreshTokens.delete(body.refresh_token!);
      return send(res, 200, JSON.stringify(issueTokens(entry)));
    }
    return send(res, 400, '{"error":"unsupported_grant_type"}');
  }
  if (path === '/auth/v1/user') {
    const claims = verify(bearer(req));
    if (!claims || claims.role !== 'authenticated') return send(res, 401, '{"error":"invalid token"}');
    const [user] = await sql<{ id: string; email: string }>('select id, email from auth.users where id = $1', [claims.sub]);
    return user ? send(res, 200, JSON.stringify(user)) : send(res, 404, '{"error":"user not found"}');
  }
  if (path === '/auth/v1/logout') return send(res, 204, '');
  const admin = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(path);
  if (admin && req.method === 'DELETE') {
    if (verify(bearer(req))?.role !== 'service_role') return send(res, 403, '{"error":"forbidden"}');
    await sql('delete from auth.users where id = $1', [admin[1]]);
    return send(res, 200, '{}');
  }

  // Edge Functions: the real handlers.
  if (path.startsWith('/functions/v1/')) {
    const name = path.slice('/functions/v1/'.length);
    const auth = req.headers.authorization ?? null;
    const body = req.method === 'POST' ? await readBody(req) : '';
    let out: { status: number; body: string };
    if (name === 'create-subscription') {
      out = await handleCreateSubscription({ authorization: auth, body }, { ...RZP, planIds: PLANS, userFromToken: (t) => userFromToken(rest, t), fetch: stackFetch, log });
    } else if (name === 'razorpay-webhook') {
      const planOf = (id: string): Plan | null => (id === PLANS.monthly ? 'monthly' : id === PLANS.annual ? 'annual' : null);
      out = await handleWebhook(
        { rawBody: body, signature: (req.headers['x-razorpay-signature'] as string) ?? null, eventId: (req.headers['x-razorpay-event-id'] as string) ?? null },
        { secret: WEBHOOK_SECRET, store: billingStore(rest), log, planOf },
      );
    } else if (name === 'cancel-subscription') {
      out = await handleCancelSubscription(auth, accountDeps);
    } else if (name === 'delete-account') {
      out = await handleDeleteAccount(auth, accountDeps);
    } else if (name === 'weekly-reminder') {
      if (auth !== `Bearer ${CRON_SECRET}`) return send(res, 403, 'forbidden', 'text/plain');
      const sent = await runWeeklyReminders({
        siteUrl: SITE,
        functionsUrl: `${GATEWAY}/functions/v1`,
        listRecipients: () => weeklyRecipients(rest),
        send: async (to, email) => void outbox.push({ to, ...email }),
        log,
      });
      out = { status: 200, body: JSON.stringify({ sent }) };
    } else if (name === 'unsubscribe') {
      const r = await handleUnsubscribe(url.searchParams.get('token'), (t) => turnOffReminders(rest, t), log);
      return send(res, r.status, html('Unsubscribe', `<p>${r.body}</p>`), 'text/html; charset=utf-8');
    } else return send(res, 404, '{"error":"no such function"}');
    return send(res, out.status, out.body);
  }

  // Razorpay's hosted checkout (rzp.io redirects here in the test).
  const checkout = /^\/razorpay\/i\/(sub_[0-9a-f]+)(\/pay)?$/.exec(path);
  if (checkout) {
    const sub = subs.get(checkout[1]!);
    if (!sub) return send(res, 404, html('Not found', '<p>Unknown subscription</p>'), 'text/html');
    if (!checkout[2]) {
      return send(res, 200, html('Razorpay Checkout (test double)', `<h1>Razorpay Checkout</h1><p>Plan ${sub.planId}</p><form method="post" action="${path}/pay"><button type="submit">Pay with UPI</button></form>`), 'text/html; charset=utf-8');
    }
    sub.status = 'active';
    sub.currentEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    for (const e of ['subscription.authenticated', 'subscription.activated', 'subscription.charged']) await sendEvent(sub, e);
    return send(res, 200, html('Payment successful', `<h1>Payment successful</h1><a href="${SITE}?journal=1">Back to Trade Journal</a>`), 'text/html; charset=utf-8');
  }

  // Test controls.
  if (path === '/test/health') return send(res, 200, '{"ok":true}');
  if (path === '/test/outbox') return send(res, 200, JSON.stringify(outbox));
  if (path === '/test/logs') return send(res, 200, JSON.stringify(functionLogs));
  if (path === '/test/subs') return send(res, 200, JSON.stringify([...subs.values()]));
  if (path === '/test/sql' && req.method === 'POST') {
    const { q, params } = JSON.parse(await readBody(req)) as { q: string; params?: unknown[] };
    return send(res, 200, JSON.stringify(await sql(q, params ?? [])));
  }
  if (path === '/test/razorpay/event' && req.method === 'POST') {
    const input = JSON.parse(await readBody(req)) as { subscriptionId: string; event: string; eventId?: string; createdAt?: number; status?: string };
    const sub = subs.get(input.subscriptionId);
    if (!sub) return send(res, 404, '{"error":"no such subscription"}');
    if (input.status) sub.status = input.status;
    return send(res, 200, JSON.stringify(await sendEvent(sub, input.event, { eventId: input.eventId, createdAt: input.createdAt })));
  }
  return send(res, 404, '{"error":"not found"}');
}

const server = createServer((req, res) => {
  route(req, res).catch((e: unknown) => {
    console.error('stack error', e);
    send(res, 500, JSON.stringify({ error: String(e) }));
  });
});
server.listen(GATEWAY_PORT, '127.0.0.1', () => console.log(`journey stack ready on ${GATEWAY}`));

const stop = () => {
  pgrst.kill();
  server.close();
  void socket.stop().then(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

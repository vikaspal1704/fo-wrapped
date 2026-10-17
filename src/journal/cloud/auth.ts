/**
 * Sign-in with Google through Supabase Auth, PKCE flow (docs/SPEC.md AC-2.1.2).
 * Only the tokens, user ID and email are kept.
 */
import type { CloudConfig } from './config';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  userId: string;
  email: string | null;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: base64url(digest) };
}

/** The URL to send the browser to; keep `verifier` until the user comes back. */
export async function signInUrl(cfg: CloudConfig, redirectTo: string): Promise<{ url: string; verifier: string }> {
  const { verifier, challenge } = await pkcePair();
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' });
  return { url: `${cfg.url}/auth/v1/authorize?${q}`, verifier };
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id?: string; email?: string };
}

function toSession(r: TokenResponse, now: number): Session {
  if (!r.access_token || !r.refresh_token || !r.user?.id) throw new Error('Sign-in did not complete. Please try again.');
  return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: now + r.expires_in * 1000, userId: r.user.id, email: r.user.email ?? null };
}

async function token(cfg: CloudConfig, grant: string, body: Record<string, string>, now: number): Promise<Session> {
  const res = await cfg.fetch(`${cfg.url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Sign-in did not complete. Please try again.');
  return toSession((await res.json()) as TokenResponse, now);
}

export function completeSignIn(cfg: CloudConfig, code: string, verifier: string, now = Date.now()): Promise<Session> {
  return token(cfg, 'pkce', { auth_code: code, code_verifier: verifier }, now);
}

export function refreshSession(cfg: CloudConfig, s: Session, now = Date.now()): Promise<Session> {
  return token(cfg, 'refresh_token', { refresh_token: s.refreshToken }, now);
}

export async function signOut(cfg: CloudConfig, s: Session): Promise<void> {
  await cfg.fetch(`${cfg.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: `Bearer ${s.accessToken}` } }).catch(() => undefined);
}

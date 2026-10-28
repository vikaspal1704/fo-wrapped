/**
 * End-to-end encryption for sync (ADR-0002). Web Crypto only: PBKDF2-SHA256
 * stretches the passphrase into an AES-256-GCM key and an HMAC-SHA256 key,
 * neither of which can be exported. The passphrase is never stored or sent.
 */
export const MIN_PASSPHRASE = 12;
export const KDF_ITERATIONS = 600_000;
const CHECK_TEXT = 'fo-journal key check v1';

export interface JournalKeys {
  aes: CryptoKey;
  hmac: CryptoKey;
}

/** Where a record lives; bound into the ciphertext so it can't be moved. */
export interface Slot {
  userId: string;
  collection: string;
  recordId: string;
}

export interface Sealed {
  iv: string;
  ciphertext: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKeys(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = KDF_ITERATIONS): Promise<JournalKeys> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`The passphrase needs at least ${MIN_PASSPHRASE} characters.`);
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const aes = await subtle().importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const hmac = await subtle().importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  bits.fill(0);
  return { aes, hmac };
}

const aad = (slot: Slot) => enc.encode(`fo-journal|v1|${slot.userId}|${slot.collection}|${slot.recordId}`);

export async function encryptRecord(keys: JournalKeys, slot: Slot, value: unknown): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(slot) }, keys.aes, enc.encode(JSON.stringify(value)));
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ct)) };
}

/** Throws if the key is wrong or the record was moved or altered. */
export async function decryptRecord<T = unknown>(keys: JournalKeys, slot: Slot, sealed: Sealed): Promise<T> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: aad(slot) }, keys.aes, fromBase64(sealed.ciphertext));
  return JSON.parse(dec.decode(pt)) as T;
}

/** An opaque, stable server-side ID for a local record: HMAC(localId), hex. */
export async function recordId(keys: JournalKeys, localId: string): Promise<string> {
  const sig = new Uint8Array(await subtle().sign('HMAC', keys.hmac, enc.encode(localId)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CHECK_SLOT = (userId: string): Slot => ({ userId, collection: 'profile', recordId: 'key-check' });

export function makeKeyCheck(keys: JournalKeys, userId: string): Promise<Sealed> {
  return encryptRecord(keys, CHECK_SLOT(userId), CHECK_TEXT);
}

/** true when these keys open the stored check value, i.e. the passphrase is right. */
export async function verifyKeyCheck(keys: JournalKeys, userId: string, check: Sealed): Promise<boolean> {
  try {
    return (await decryptRecord<string>(keys, CHECK_SLOT(userId), check)) === CHECK_TEXT;
  } catch {
    return false;
  }
}

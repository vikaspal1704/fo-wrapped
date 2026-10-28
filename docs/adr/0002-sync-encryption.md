# ADR-0002: End-to-end encrypted sync

**Status:** Accepted (proposed by Claude, pending owner review) · 2026-10-17

## Context

Journal principle J2: synced data is encrypted on the device; the server stores ciphertext, the account and the subscription only. Only the Web Crypto API is available without new dependencies.

## Options

| Option | For | Against |
|--------|-----|---------|
| Argon2id via a WASM library | Memory-hard, best practice | New dependency and bundle size; harder to audit |
| **PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023), built into Web Crypto** | No dependency, available in every target browser and Node | Not memory-hard; mitigated by a 12-character minimum passphrase and a per-user salt |
| Server-held keys | Recovery possible | The server could read data; breaks J2 |

## Decision

- **Key derivation:**
  - `PBKDF2(passphrase, salt, 600_000, SHA-256)` → 512 bits.
  - The first 256 bits become an **AES-256-GCM** key and the next 256 bits an **HMAC-SHA256** key. Both are non-extractable `CryptoKey`s.
  - The 16-byte random salt and the iteration count are stored, in clear, in `journal_profiles`.
- **Records:**
  - Each synced record is `AES-GCM(key, iv = 12 random bytes, plaintext = JSON, additionalData = "fo-journal|v1|<user id>|<collection>|<record id>")`.
  - The additional data binds a ciphertext to its owner and slot, so rows can't be swapped.
- **Record IDs:** `record_id = HMAC(hmacKey, localId)` in hex. Contract names and trade IDs never appear on the server.
- **Passphrase check:** a fixed check value is encrypted the same way and stored, so a wrong passphrase is refused before any data is read or written.
- **Change times:** the server stamps `updated_at` with a trigger, ignoring the client's value. Devices' clocks differ, and a pull cursor built from client times could skip a change from a device whose clock runs behind (found by the journey test).
- **Key loss:** there is no recovery. The app says so before sync is turned on and again on the "forgot passphrase" screen (AC-2.3.3). The only way forward is to delete the synced copy and start again from a device that still has the data.
- **Passphrase rules:** at least 12 characters. It is never stored, and never sent anywhere, the server included.

## Revisit when

Web Crypto gains a memory-hard KDF, or a security review asks for Argon2id.

# ADR-0003: Local storage layout and migrations

**Status:** Accepted (proposed by Claude, pending owner review) · 2026-10-17

## Context

Journal principle J1: history lives on the device. It must survive app updates, and a failed upgrade must never lose data (AC-2.2.3).

## Decision

One IndexedDB database, **`fo-journal`**, opened only after the user turns on "Save on this device" (AC-2.2.1).

| Store | Key | Holds | Indexes |
|-------|-----|-------|---------|
| `meta` | `key` | `{ key: 'schema', version }`, the sync cursor, the device ID | – |
| `imports` | `id` | One import: `{ id, at, label, broker, counts, fills, charges, statements }`. `label` has the client ID removed (PV-3) | `at` |
| `rules` | `id` (`'rules'`) | The user's rule set, validated with Zod | – |
| `notes` | `id` | `{ id, target: { kind: 'trade' \| 'day', key }, text, tags, updatedAt }` | `updatedAt` |
| `session` | `key` | Cloud session tokens and the cached entitlement (cloud builds only) | – |

- **Why fills live inside imports:** undoing an import is one delete (AC-2.4.3), and sync works per import. Dedupe runs across all imports when the history is loaded, using the engine's own key: broker + exchange + trade ID.
- **Migrations:** `MIGRATIONS[n]` upgrades version n−1 to n. Steps run in order inside IndexedDB's `versionchange` transaction. If a step throws, the transaction aborts and the old database stays exactly as it was (`failed_migration_keeps_old_data`).
- **Delete everything:** `indexedDB.deleteDatabase('fo-journal')`, then a read-back check that nothing is left (AC-2.2.4).
- **Code location:**
  - Storage code lives in `src/journal/store/` (browser API, injectable `IDBFactory`).
  - Analysis stays pure in `src/engine/journal/`.
  - The worker never touches storage; the ESLint rule on `src/worker` still applies.

## Revisit when

Data per user outgrows comfortable IndexedDB sizes (tens of MB), or the mobile wrapper needs native storage.

# Architecture decision records

Short records of decisions for the paid Journal ([`../BRIEF.md`](../BRIEF.md) §6). Each one lists the options, the trade-offs, the decision and what would make us revisit it. Status **Accepted (proposed by Claude, pending owner review)** means the code follows it now, and the owner can change it in a PR that updates the record.

| ADR | Decision |
|-----|----------|
| [0001](0001-one-codebase-build-flag.md) | One codebase; the Journal is a lazy-loaded route; cloud features switch on only when the build is given Supabase settings |
| [0002](0002-sync-encryption.md) | Sync encrypted on the device: PBKDF2-SHA256 (600,000 rounds) → AES-256-GCM, opaque record IDs, no key recovery |
| [0003](0003-local-storage-layout.md) | IndexedDB `fo-journal`, versioned migrations inside the upgrade transaction |
| [0004](0004-billing-entitlements.md) | Razorpay Subscriptions via hosted pages; signed, idempotent webhooks set an `entitlements` row; RLS checks it |
| [0005](0005-money-test-strategy.md) | Golden totals per synthetic broker file, seeded property tests for FIFO invariants |

# ADR-0005: Testing money math

**Status:** Accepted (proposed by Claude, pending owner review) · 2026-10-17

## Context

Correctness comes before features (BRIEF §3.3, SPEC RL-1). Example-based tests exist per parser and formula. They don't catch silent regressions across a whole file, or invariant breaks on inputs nobody thought of.

## Decision

1. **Golden totals per synthetic broker file.**
   - `tests/golden/<fixture>.json` holds the reviewed totals for each synthetic fixture: gross, every charge head, net, trade count, unclosed count.
   - `golden_totals_match` recomputes them.
   - Changing a golden file needs a reason in the PR (a rate change, a fixed bug). Updating it is a deliberate act: `UPDATE_GOLDEN=1 npm test`.
2. **Seeded property tests** (a small seeded generator, no new dependency):
   - for any sequence of fills that ends flat, Σ round-trip gross = Σ sell value − Σ buy value;
   - with partial round trips, Σ realised + the open positions' entry value balances the same way;
   - merging is order-independent and idempotent;
   - charges split by day add up to the whole.
3. **Real accounts** stay outside the repo: the launch-gate harness (`npm run verify:real`).

## Revisit when

A dependency like fast-check becomes worth adding for shrinking failing cases.

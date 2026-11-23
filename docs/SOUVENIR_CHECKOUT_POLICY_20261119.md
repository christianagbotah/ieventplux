# Release B: preflight SKU and monetary policy (19 November 2026)

This is a **non-executing** checkout policy increment. It validates client-selected product identifiers, merges duplicate variant rows, sorts product IDs for stable lock ordering, rejects invalid quantities, enforces integer minor-unit arithmetic and computes stock preview without changing stock. Tests exercise malformed values and overflow.

**Not activated:** the API must not accept paid merchandise orders yet. The policy functions alone do not authorize stock, confirm a payment, generate a paid receipt or allow collection. A later guarded integration must resolve every product ID against the event, verify the variant's immutable SKU and current price, claim inventory with atomic conditional SQL, and persist an expiring reservation in the same transaction as ticket holds.

**CI blocker:** draft PR #22 web CI currently fails in seed because the base branch calls PostgreSQL `pg_advisory_xact_lock` through Prisma `$queryRaw`, which cannot deserialize a `void` column. Draft PR #21 contains the fix and has green web/mobile/build checks. Rebase or merge the validated #21 fix before testing the combined Release B schema. Do not modify production schema to fix a CI-only seed failure.

**Activation gates:** scratch-schema additive migration rehearsal, verified pre-migration backup, clean typecheck/lint/isolated build, staging authenticated checkout and provider verification, duplicate/late callbacks, refund and partial collection QA, staff role and smartphone camera HTTPS QR review, audit replay checks, explicit approvals, and rollback plan. Both charging and collection remain disabled until sign-off.

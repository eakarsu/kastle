# Access decision contract

## Deterministic evaluation order

Each attempt is bound to the authenticated reader's tenant and property. Evaluation stops at the first applicable condition:

1. Event older than two minutes: `DENY / STALE_EVENT`.
2. Missing badge: `DENY / UNKNOWN_CREDENTIAL`.
3. Suspended or revoked credential: `DENY / CREDENTIAL_INACTIVE`.
4. Expired credential: `DENY / CREDENTIAL_EXPIRED`.
5. No enabled rule matching the exact door (or `*`) and UTC schedule: `DENY / NO_MATCHING_RULE`.
6. Highest-priority matching `DENY`: `DENY / RULE_DENY`.
7. Highest-priority matching `REQUIRE_MFA` without verified MFA: `DENY / MFA_REQUIRED`.
8. Matching `ALLOW`, or `REQUIRE_MFA` with verified MFA: `ALLOW`.

Priority sorts descending; UUID is the deterministic tie-breaker. The decision stores immutable credential and rule snapshots, so later edits do not rewrite historical reasoning.

## Delivery and retry

Readers must create a unique 8–160 character event ID and send it as `Idempotency-Key`. They may retry timeouts with exactly the same headers and body until receiving a response. Exact replays return HTTP 200 and the original record; first acceptance returns 201. A changed payload with the same ID returns 409 and must be treated as an integration fault, not retried with modified content.

Reader clocks may be at most 30 seconds ahead. Events older than two minutes are recorded as denials; events older than 24 hours are rejected as invalid. Invalid input returns 422, invalid reader identity returns 401, and internal outages return 500 without manufacturing an allow decision. Integrators should use bounded exponential backoff with jitter and alarm on sustained failures.

## Administrative versioning

Rule, credential-status, reader-revocation, and reader-key mutations require `expectedVersion`. A stale version returns 409. Reader revocation is permanent; provision a replacement instead of reactivating a revoked reader. Rule changes create immutable version snapshots; all state changes append a hash-linked audit event.

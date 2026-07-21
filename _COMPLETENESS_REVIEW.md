# Completeness Review: kastle

**Review date:** 2026-07-18

## Assessment basis

Static inspection of project-owned source and configuration only; no dependency installation, build, database migration, external-service call, or runtime launch was performed. The scan considered 42 project files (32 source files), 2 manifest(s), 0 test-like file(s), and 0 CI workflow(s), excluding dependency/generated directories.

## Classification

**Prototype-demo**

This is a prototype/demo for application workflow. Generated gap/demo patterns are present: it contains 32 source files and visible routes/pages in `frontend/`, `backend/`, but those surfaces are not evidence of durable domain execution, verified integrations, or operational completion.

## Why it is not complete

- Generated gap/visualization routes describe missing capabilities or simulate recommendations; they do not implement the underlying domain operation.
- Generic LLM calls are used as product behavior without enough typed tools, grounded evidence, deterministic rules, or output evaluation.
- Mock, demo, sample, fixture, or placeholder behavior remains in executable/product paths.
- No recognizable project-owned automated tests were found for the main workflow.
- No checked-in CI workflow proves builds, tests, migrations, and security checks on every change.

## Needed features

1. Define the primary user and acceptance criteria, then complete one end-to-end workflow against persistent data instead of demo fixtures.
2. Replace mocks, placeholders, and generic AI responses with validated domain services and explicit failure/retry behavior.
3. Implement secure identity, role/tenant boundaries, input validation, secrets handling, and auditable state changes.
4. Add representative automated tests, CI quality gates, environment documentation, migrations, observability, backup, and deployment configuration.
5. Add risk-based unit, integration, and end-to-end tests in CI, including migration and failure-path coverage.

## Risks or launch blockers

- Credential/configuration exposure: environment files are present in the repository tree and must be checked against Git history and rotated if real.
- Automation contains destructive process, filesystem, or database operations; do not run it on a shared machine without review.
- Startup appears coupled to seed/migration behavior, risking data mutation or non-repeatable launches.
- AI-provider availability, cost, privacy, prompt injection, and unvalidated output are launch risks until bounded and evaluated.

## Evidence inspected

- `frontend/src/App.jsx:18`
- `frontend/src/pages/AIInsights.jsx:86`
- `backend/server.js`
- `backend/middleware/auth.js`
- `backend/package.json`
- `start.sh`

## Recommended next action

Stop adding generated pages; prove one application workflow workflow against real services and persistent state, with tests and measurable acceptance criteria.

## Implementation progress (2026-07-20)

- Replaced the executable generated dashboard with one defined physical-access workflow: a tenant administrator provisions a property, credential, versioned deterministic rule, and authenticated reader; the reader submits an idempotent attempt; the service returns and persists a fail-closed `ALLOW` or `DENY`; operators review redacted decisions; and administrators/auditors verify the immutable hash-linked case history. The former generic CRUD, simulator, firmware, custom-view, and ungrounded AI product surfaces are removed or explicitly return HTTP 410.
- Added PostgreSQL migrations for tenant-scoped users/properties/credentials/rules/readers, immutable rule versions and decisions, optimistic reader/credential/rule lifecycle versions, reader key rotation/revocation, and append-only audit events with database-enforced sequence links. Cross-tenant property references and administrative actor references are rejected by composite foreign keys. Migration execution is explicit, advisory-locked, checksum-verified, repeatable, and separate from startup; startup now fails closed on a missing, extra, or checksum-mismatched migration.
- Added issuer/audience-bound 30-minute operator JWTs with active tenant/user and token-version reloads, `ADMIN`/`OPERATOR`/`AUDITOR` authorization, throttled login, one-time 256-bit reader keys stored only as digests and compared in constant time, explicit CORS, bounded JSON, security headers, structured request IDs/logs, validated inputs and IANA time zones, and deny-by-default rule evaluation. Exact reader retries return the stored decision, conflicting replays return 409, events older than two minutes can only produce `STALE_EVENT` denials, and events outside the 24-hour/30-second clock envelope are rejected.
- Access responses and the operator UI now redact full badge values and internal request hashes, showing only a suffix; credential audit events contain a digest rather than the submitted badge. Immutable decision snapshots preserve the policy and credential state used at evaluation time. Raw badge values remain inside the protected database boundary, so managed database encryption, field-level tokenization/key ownership, and approved retention are explicit production gates rather than claimed application-level controls.
- Reduced the React UI to the supported authorization console with real authentication, loading/error/empty states, tenant-scoped attempts, rule/credential/property/reader provisioning, single-display reader secrets, reader lifecycle controls, audit verification, and no demo credentials. Added a non-root multi-stage container, health/readiness endpoints and Docker health check, fail-closed environment template/start script, least-privilege CI, security policy, decision contract, and deployment/monitoring/backup/restore/incident-response runbooks.
- Independent verification on fresh disposable PostgreSQL databases: all three migrations applied and replayed without mutation; required triggers, migration records, and tenant-actor constraints verified; 8 unit, database-integration, and live-HTTP tests passed, covering default deny, priority, overnight/MFA schedules, stale events, expired/unknown credentials, exact/conflicting replay, tenant/RBAC isolation, database cross-tenant rejection, immutable evidence, audit hashes, CORS, and retired routes. The Vite production build passed; backend full/production and frontend audits each reported 0 vulnerabilities and CI enforces that result at the low-severity threshold with an ephemeral JWT secret; all JavaScript and shell syntax plus `git diff --check` passed; current-tree and all-history Gitleaks scans found no leaks, with the same full-history scan now enforced in CI.
- Production-mode smoke returned live/readiness/root/login `200`, anonymous governed access `401`, retired AI `410`, and disallowed origin `403`. A real custom-format backup restored into a new database with matching tenant/user/audit counts, all schema controls intact, current checksums, and a valid audit chain. Local container validation alone remains environment-blocked because the configured Docker/Colima socket is unavailable; CI retains the image-build gate.
- Before a building rollout, complete reader/door vendor conformance, cryptographic MFA evidence rather than an unverified boolean contract, offline/failover and clock-skew drills, database TLS/least-privilege/encryption and badge tokenization, externally anchored or WORM audit retention, legal retention/deletion approval, monitored backup/point-in-time restore rehearsals, penetration/load/accessibility tests, and security-operations acceptance with physical fail-safe requirements.

## Runtime verification (2026-07-20)

- The safe launcher now preserves an explicitly supplied `NODE_ENV` and derives an explicit loopback frontend origin only for disposable test runs. Production continues to require `CORS_ORIGINS` and rejects a wildcard.
- Disposable PostgreSQL startup, login, session identity, unauthorized rejection, and the governed access API are the acceptance boundary for this pass.

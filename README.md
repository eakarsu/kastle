# Kastle governed access control

Kastle is a tenant-scoped physical-access authorization service. Its primary user is a security administrator who provisions a property, credential, deterministic access rule, and reader. A reader then submits an idempotent badge attempt and receives a fail-closed `ALLOW` or `DENY` decision. The complete decision record and every administrative state change are retained in an immutable hash-linked audit history.

The previous generated AI, device simulator, firmware, and generic CRUD demo is not part of the runnable product. Requests to the old AI and simulator API prefixes return HTTP 410.

## Acceptance path

1. A deployment operator applies all PostgreSQL migrations and bootstraps an administrator with an explicit, non-default password.
2. An `ADMIN` creates a property, credential, access rule, and reader. Reader keys are returned once; only their SHA-256 digest is stored.
3. The reader calls `POST /api/access/decisions` with `X-Reader-Id`, `X-Reader-Key`, and `Idempotency-Key`.
4. The service reloads the active reader/property/tenant, validates freshness, locks its tenant/event key, verifies credential status and expiry, evaluates the highest-priority matching UTC rule, and defaults to deny. Events older than two minutes are retained as `STALE_EVENT` denials and can never actuate a door.
5. An exact retry returns the original decision. Reusing the event identifier with different content returns `409 IDEMPOTENCY_CONFLICT`.
6. Operators view tenant-only attempts; administrators and auditors verify the append-only SHA-256 audit chain.

Rules support `ALLOW`, `DENY`, and `REQUIRE_MFA`, priorities 1–100, explicit UTC day/time schedules, exact door names or `*`, versioned edits, and overnight windows. A start time equal to the end time means a full 24-hour window on the selected days.

## Local setup

Requirements: Node.js 22, PostgreSQL 16+, and `psql` for the schema-control check.

```sh
cp .env.example .env
# Fill DATABASE_URL, a 32+ character JWT_SECRET, and explicit CORS_ORIGINS.

(cd backend && npm ci && npm run db:migrate)
(cd frontend && npm ci && npm run build)

BOOTSTRAP_TENANT_SLUG=example-tenant \
BOOTSTRAP_TENANT_NAME='Example Tenant' \
BOOTSTRAP_PROPERTY_NAME='Headquarters' \
BOOTSTRAP_ADMIN_EMAIL=admin@example.test \
BOOTSTRAP_ADMIN_NAME='Security Administrator' \
BOOTSTRAP_ADMIN_PASSWORD='use-a-password-manager-value' \
  npm --prefix backend run bootstrap:admin

./start.sh
```

Startup is read-only with respect to schema and business data: it does not install packages, create databases, migrate, seed, reset, or terminate other processes. It refuses missing/weak configuration, wildcard CORS, an unapplied schema, or a missing frontend release build.

## Reader decision contract

```http
POST /api/access/decisions
X-Reader-Id: 4f8d...uuid
X-Reader-Key: one-time-provisioned-secret
Idempotency-Key: reader-01-20260720-000001
Content-Type: application/json

{
  "badgeNumber": "BADGE-100",
  "doorName": "Main Lobby",
  "direction": "ENTRY",
  "occurredAt": "2026-07-20T12:00:00Z",
  "mfaVerified": false
}
```

The response includes the persisted decision, reason code, redacted credential/rule snapshots, badge suffix, and replay flag. Raw badge values and internal request hashes are not returned by reader or operator APIs. Unknown, inactive, revoked, expired, stale, cross-property, unmatched, and unverified-MFA attempts deny without relying on AI or an external provider.

## Verification

```sh
DATABASE_URL=postgresql://... npm --prefix backend run db:migrate
DATABASE_URL=postgresql://... ./scripts/verify-schema-controls.sh
NODE_ENV=test DATABASE_URL=postgresql://..._test npm --prefix backend test
npm --prefix frontend run build
npm --prefix backend audit --audit-level=high
npm --prefix frontend audit --audit-level=high
docker build -t kastle-governed .
```

CI repeats migrations, verifies database controls, runs unit/integration/HTTP tests, builds the UI and container, rejects tracked environment files, and enforces high-severity audit gates. See [operations](docs/OPERATIONS.md), [security](SECURITY.md), and the [decision contract](docs/ACCESS_DECISION_CONTRACT.md).

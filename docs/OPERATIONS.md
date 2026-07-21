# Operations runbook

## Deployment

1. Build and scan the immutable container.
2. Back up PostgreSQL and verify the target schema version.
3. Run `npm --prefix backend run db:migrate` as a separate, single-purpose deployment job. The runner uses a PostgreSQL advisory lock, records SHA-256 checksums, and refuses an edited applied migration.
4. Run `scripts/verify-schema-controls.sh`.
5. Deploy the application with explicit secrets/origins. Startup verifies migrations but never applies them.
6. Check `/api/health/live` and `/api/health/ready`, authenticate an operator, submit a canary reader denial with a unique event ID, and verify the audit chain.

Migrations are forward-only. If an application rollback is required, keep the compatible additive schema and roll back the image. Never edit an applied SQL file.

## Monitoring and incident response

Alert on health failures, login throttling, reader 401s, idempotency conflicts, database serialization errors, elevated `DENY` reason rates, readers with stale `last_seen_at`, and audit verification failure. An audit failure is a security incident: stop administrative writes, preserve database/WAL evidence, isolate credentials, and investigate before restoring service.

For a compromised reader, revoke it, rotate any adjacent integration secrets, inspect attempts since its last known-good time, and provision a replacement key. For a compromised operator, deactivate the user or increment `token_version`, rotate the JWT secret if exposure is broad, and review administrative audit entries.

## Backup, restore, and retention

Use encrypted PostgreSQL physical backups plus continuous WAL archiving. Test restore into an isolated environment at least quarterly, apply `scripts/verify-schema-controls.sh`, compare tenant/audit counts, and run `scripts/verify-audit-chain.js` for representative tenants. Attempts and audit history are database-enforced append-only; define the legally approved retention period and archive process before production. Do not implement retention by disabling triggers or direct deletes.

## Reader key handling

Reader keys are shown once. Store them in device secure storage and a managed secret vault; never log them. Rotation invalidates the previous digest immediately. Coordinate rollout so a failed device update remains fail-closed and observable.

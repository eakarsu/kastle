# Security policy

Report vulnerabilities privately to the repository owner. Do not place exploit details, reader keys, bearer tokens, database URLs, badge numbers, or personal access-event data in public issues.

## Security boundaries

- Operator tokens are 30-minute HS256 JWTs with fixed issuer/audience and a database-checked tenant, active flag, role, and token version on every request.
- `ADMIN` provisions properties, credentials, rules, and readers. `OPERATOR` can view tenant decisions. `AUDITOR` can additionally read and verify the audit chain.
- Readers authenticate with an ID and a random 256-bit key. Only a SHA-256 digest is stored and compared in constant time. Keys can be rotated or permanently revoked with optimistic versions.
- Every business query includes the authenticated tenant. Property/credential/reader foreign keys repeat tenant IDs to make cross-tenant references fail in PostgreSQL as well as application code.
- Reader and operator responses expose only a badge suffix; complete badge values and internal request hashes remain inside the encrypted database boundary, and credential audit entries retain a digest rather than the submitted value.
- Attempts, rule snapshots, and audit events are append-only by database trigger. Audit sequence links are database-checked and application-verified by SHA-256.
- CORS requires explicit origins; request bodies are limited to 128 KiB; security headers are emitted; login is throttled; all decisions default to deny.

## Secrets and rotation

`.env` files are ignored and no environment file is present in Git history. Generate a unique `JWT_SECRET` of at least 32 random characters per environment. Rotate it by deploying the replacement, which invalidates all operator tokens. Rotate a reader through `POST /api/readers/:id/rotate-key`; store the returned value immediately and update the physical reader atomically. Revoke compromised readers and credentials through their status endpoints.

Production should use a secret manager, TLS at the ingress, a least-privileged PostgreSQL role, encrypted backups, centralized request/audit monitoring, and network allowlists between readers and the API.

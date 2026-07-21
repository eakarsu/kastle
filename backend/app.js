const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUserAuth, createReaderAuth, requireRoles } = require('./middleware/auth');
const { DomainError } = require('./lib/errors');
const { sha256 } = require('./lib/canonical');
const { appendAudit, verifyAuditChain } = require('./lib/audit');
const { processAccessAttempt } = require('./lib/access-service');
const { snapshotRule } = require('./lib/access-rules');
const { verifyMigrationState } = require('./lib/schema-state');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function text(value, name, minimum = 1, maximum = 160) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
    throw new DomainError(422, 'INVALID_INPUT', `${name} must contain ${minimum}-${maximum} characters`);
  }
  return value.trim();
}

function uuid(value, name) {
  const normalized = text(value, name, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new DomainError(422, 'INVALID_INPUT', `${name} must be a UUID`);
  }
  return normalized;
}

function positiveVersion(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new DomainError(422, 'INVALID_VERSION', 'expectedVersion must be a positive integer');
  return parsed;
}

function publicCredential(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    property_id: row.property_id,
    holder_name: row.holder_name,
    badge_suffix: row.badge_number.slice(-4),
    credential_type: row.credential_type,
    access_level: row.access_level,
    status: row.status,
    expires_on: row.expires_on,
    version: Number(row.version),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicAttempt(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    property_id: row.property_id,
    reader_id: row.reader_id,
    external_event_id: row.external_event_id,
    credential_id: row.credential_id,
    badge_suffix: row.badge_number.slice(-4),
    door_name: row.door_name,
    direction: row.direction,
    mfa_verified: row.mfa_verified,
    occurred_at: row.occurred_at,
    decision: row.decision,
    reason_code: row.reason_code,
    reason_detail: row.reason_detail,
    matched_rule_id: row.matched_rule_id,
    credential_snapshot: row.credential_snapshot,
    rule_snapshot: row.rule_snapshot,
    created_at: row.created_at,
  };
}

function validateRule(raw) {
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number))] : [];
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new DomainError(422, 'INVALID_DAYS', 'days must contain integers from 0 through 6');
  const action = text(raw.action, 'action', 4, 20).toUpperCase();
  if (!['ALLOW', 'DENY', 'REQUIRE_MFA'].includes(action)) throw new DomainError(422, 'INVALID_ACTION', 'action must be ALLOW, DENY, or REQUIRE_MFA');
  const priority = Number(raw.priority);
  if (!Number.isSafeInteger(priority) || priority < 1 || priority > 100) throw new DomainError(422, 'INVALID_PRIORITY', 'priority must be an integer from 1 through 100');
  const startTime = text(raw.startTime, 'startTime', 5, 5);
  const endTime = text(raw.endTime, 'endTime', 5, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) throw new DomainError(422, 'INVALID_TIME', 'startTime and endTime must use HH:MM');
  return {
    name: text(raw.name, 'name', 3, 160),
    propertyId: uuid(raw.propertyId, 'propertyId'),
    doorPattern: text(raw.doorPattern, 'doorPattern', 1, 160),
    action,
    priority,
    days,
    startTime,
    endTime,
    enabled: raw.enabled !== false,
  };
}

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createLoginLimiter() {
  const attempts = new Map();
  return function loginLimiter(req, res, next) {
    const key = req.ip;
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || now > current.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
      return next();
    }
    if (current.count >= 10) return res.status(429).json({ error: 'Too many sign-in attempts', code: 'RATE_LIMITED' });
    current.count += 1;
    next();
  };
}

function createApp({ pool, config }) {
  const app = express();
  const userAuth = createUserAuth(pool, config);
  const readerAuth = createReaderAuth(pool);
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    if (process.env.NODE_ENV !== 'test') {
      res.on('finish', () => console.log(JSON.stringify({
        level: 'info', event: 'http_request', requestId: req.requestId, method: req.method,
        path: req.path, status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      })));
    }
    next();
  });
  app.use(cors({
    credentials: false,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      const error = new DomainError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed');
      return callback(error);
    },
  }));
  app.use(express.json({ limit: '128kb', strict: true }));

  app.post('/api/auth/login', createLoginLimiter(), asyncRoute(async (req, res) => {
    const tenantSlug = text(req.body?.tenant, 'tenant', 3, 63).toLowerCase();
    const email = text(req.body?.email, 'email', 5, 255).toLowerCase();
    const password = text(req.body?.password, 'password', 12, 200);
    const result = await pool.query(
      `SELECT u.*, t.is_active AS tenant_active FROM security_users u
       JOIN security_tenants t ON t.id = u.tenant_id
       WHERE t.slug = $1 AND lower(u.email) = $2`,
      [tenantSlug, email],
    );
    const user = result.rows[0];
    if (!user?.is_active || !user.tenant_active || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    const token = jwt.sign({ tenantId: user.tenant_id, role: user.role, tokenVersion: user.token_version }, config.jwtSecret, {
      algorithm: 'HS256', subject: user.id, issuer: config.jwtIssuer, audience: config.jwtAudience, expiresIn: '30m',
    });
    res.json({ token, user: { id: user.id, tenantId: user.tenant_id, email: user.email, fullName: user.full_name, role: user.role } });
  }));

  app.get('/api/auth/me', userAuth, (req, res) => res.json({
    id: req.user.id, tenantId: req.user.tenant_id, email: req.user.email, fullName: req.user.full_name, role: req.user.role,
  }));

  app.post('/api/access/decisions', readerAuth, asyncRoute(async (req, res) => {
    const result = await processAccessAttempt(pool, req.reader, { ...req.body, externalEventId: req.headers['idempotency-key'] || req.body?.externalEventId });
    res.status(result.idempotent ? 200 : 201).json({ ...publicAttempt(result.attempt), idempotent: result.idempotent });
  }));

  app.get('/api/access/attempts', userAuth, asyncRoute(async (req, res) => {
    const values = [req.user.tenant_id];
    const clauses = ['tenant_id = $1'];
    if (req.query.propertyId) { values.push(uuid(req.query.propertyId, 'propertyId')); clauses.push(`property_id = $${values.length}`); }
    if (req.query.decision) {
      const decision = text(req.query.decision, 'decision', 4, 5).toUpperCase();
      if (!['ALLOW', 'DENY'].includes(decision)) throw new DomainError(422, 'INVALID_DECISION', 'decision must be ALLOW or DENY');
      values.push(decision); clauses.push(`decision = $${values.length}`);
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    values.push(limit);
    const result = await pool.query(`SELECT * FROM security_access_attempts WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC, id LIMIT $${values.length}`, values);
    res.json({ attempts: result.rows.map(publicAttempt), count: result.rows.length });
  }));

  app.get('/api/audit/events', userAuth, requireRoles('ADMIN', 'AUDITOR'), asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM security_audit_events WHERE tenant_id = $1 ORDER BY sequence DESC LIMIT 250', [req.user.tenant_id]);
    res.json({ events: result.rows, count: result.rows.length });
  }));

  app.get('/api/audit/verify', userAuth, requireRoles('ADMIN', 'AUDITOR'), asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM security_audit_events WHERE tenant_id = $1 ORDER BY sequence', [req.user.tenant_id]);
    res.json({ valid: verifyAuditChain(result.rows), count: result.rows.length, head: result.rows.at(-1)?.event_hash || null });
  }));

  app.get('/api/properties', userAuth, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM security_properties WHERE tenant_id = $1 ORDER BY name', [req.user.tenant_id]);
    res.json({ properties: result.rows });
  }));

  app.post('/api/properties', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const name = text(req.body?.name, 'name', 2, 160);
    const timezone = text(req.body?.timezone || 'UTC', 'timezone', 1, 80);
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
    catch { throw new DomainError(422, 'INVALID_TIMEZONE', 'timezone must be a valid IANA time zone'); }
    const property = await transaction(pool, async (client) => {
      const inserted = await client.query('INSERT INTO security_properties (tenant_id, name, timezone) VALUES ($1,$2,$3) RETURNING *', [req.user.tenant_id, name, timezone]);
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'PROPERTY_CREATED', entityType: 'PROPERTY', entityId: inserted.rows[0].id, payload: { name, timezone } });
      return inserted.rows[0];
    });
    res.status(201).json(property);
  }));

  app.get('/api/credentials', userAuth, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM security_credentials WHERE tenant_id = $1 ORDER BY holder_name, badge_number', [req.user.tenant_id]);
    res.json({ credentials: result.rows.map(publicCredential) });
  }));

  app.post('/api/credentials', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const input = {
      propertyId: uuid(req.body?.propertyId, 'propertyId'),
      holderName: text(req.body?.holderName, 'holderName', 2, 160),
      badgeNumber: text(req.body?.badgeNumber, 'badgeNumber', 3, 80),
      credentialType: text(req.body?.credentialType, 'credentialType', 3, 10).toUpperCase(),
      accessLevel: text(req.body?.accessLevel, 'accessLevel', 2, 80),
      expiresOn: text(req.body?.expiresOn, 'expiresOn', 10, 10),
    };
    if (!['CARD', 'MOBILE', 'FOB'].includes(input.credentialType) || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) throw new DomainError(422, 'INVALID_CREDENTIAL', 'credentialType or expiresOn is invalid');
    const credential = await transaction(pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO security_credentials (tenant_id, property_id, holder_name, badge_number, credential_type, access_level, expires_on)
         SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS (SELECT 1 FROM security_properties WHERE id=$2 AND tenant_id=$1 AND is_active=true) RETURNING *`,
        [req.user.tenant_id, input.propertyId, input.holderName, input.badgeNumber, input.credentialType, input.accessLevel, input.expiresOn],
      );
      if (!inserted.rows[0]) throw new DomainError(404, 'PROPERTY_NOT_FOUND', 'Property was not found');
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'CREDENTIAL_CREATED', entityType: 'CREDENTIAL', entityId: inserted.rows[0].id, payload: { propertyId: input.propertyId, holderName: input.holderName, credentialType: input.credentialType, accessLevel: input.accessLevel, expiresOn: input.expiresOn, badgeNumberHash: sha256(input.badgeNumber) } });
      return inserted.rows[0];
    });
    res.status(201).json(publicCredential(credential));
  }));

  app.patch('/api/credentials/:id/status', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id, 'credentialId');
    const status = text(req.body?.status, 'status', 6, 9).toUpperCase();
    const expectedVersion = positiveVersion(req.body?.expectedVersion);
    if (!['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) throw new DomainError(422, 'INVALID_STATUS', 'Unsupported credential status');
    const credential = await transaction(pool, async (client) => {
      const updated = await client.query(
        `UPDATE security_credentials SET status=$1, version=version+1, updated_at=now()
         WHERE id=$2 AND tenant_id=$3 AND version=$4 RETURNING *`,
        [status, id, req.user.tenant_id, expectedVersion],
      );
      if (!updated.rows[0]) throw new DomainError(409, 'STALE_VERSION', 'Credential version is stale or credential was not found');
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'CREDENTIAL_STATUS_CHANGED', entityType: 'CREDENTIAL', entityId: id, payload: { status, fromVersion: expectedVersion, toVersion: expectedVersion + 1 } });
      return updated.rows[0];
    });
    res.json(publicCredential(credential));
  }));

  app.get('/api/readers', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT id, tenant_id, property_id, name, status, version, revoked_at, last_seen_at, created_at FROM security_readers WHERE tenant_id = $1 ORDER BY name', [req.user.tenant_id]);
    res.json({ readers: result.rows });
  }));

  app.post('/api/readers', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const propertyId = uuid(req.body?.propertyId, 'propertyId');
    const name = text(req.body?.name, 'name', 2, 160);
    const apiKey = crypto.randomBytes(32).toString('base64url');
    const reader = await transaction(pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO security_readers (tenant_id, property_id, name, key_hash, created_by)
         SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM security_properties WHERE id=$2 AND tenant_id=$1 AND is_active=true) RETURNING id, tenant_id, property_id, name, status, version, created_at`,
        [req.user.tenant_id, propertyId, name, sha256(apiKey), req.user.id],
      );
      if (!inserted.rows[0]) throw new DomainError(404, 'PROPERTY_NOT_FOUND', 'Property was not found');
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'READER_CREATED', entityType: 'READER', entityId: inserted.rows[0].id, payload: { propertyId, name } });
      return inserted.rows[0];
    });
    res.status(201).json({ ...reader, apiKey, warning: 'Store this reader key now; only its SHA-256 digest is retained' });
  }));

  app.patch('/api/readers/:id/status', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const readerId = uuid(req.params.id, 'readerId');
    const expectedVersion = positiveVersion(req.body?.expectedVersion);
    const status = text(req.body?.status, 'status', 6, 7).toUpperCase();
    if (status !== 'REVOKED') throw new DomainError(422, 'INVALID_STATUS', 'Readers can be permanently revoked; provision a replacement instead of reactivating one');
    const reader = await transaction(pool, async (client) => {
      const updated = await client.query(
        `UPDATE security_readers SET status=$1, version=version+1,
           revoked_at=CASE WHEN $1='REVOKED' THEN now() ELSE NULL END
         WHERE id=$2 AND tenant_id=$3 AND version=$4 AND status='ACTIVE' RETURNING id,tenant_id,property_id,name,status,version,revoked_at,last_seen_at,created_at`,
        [status, readerId, req.user.tenant_id, expectedVersion],
      );
      if (!updated.rows[0]) throw new DomainError(409, 'STALE_VERSION', 'Reader version is stale, already revoked, or reader was not found');
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'READER_STATUS_CHANGED', entityType: 'READER', entityId: readerId, payload: { status, fromVersion: expectedVersion, toVersion: expectedVersion + 1 } });
      return updated.rows[0];
    });
    res.json(reader);
  }));

  app.post('/api/readers/:id/rotate-key', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const readerId = uuid(req.params.id, 'readerId');
    const expectedVersion = positiveVersion(req.body?.expectedVersion);
    const apiKey = crypto.randomBytes(32).toString('base64url');
    const reader = await transaction(pool, async (client) => {
      const updated = await client.query(
        `UPDATE security_readers SET key_hash=$1, version=version+1
         WHERE id=$2 AND tenant_id=$3 AND version=$4 AND status='ACTIVE'
         RETURNING id,tenant_id,property_id,name,status,version,last_seen_at,created_at`,
        [sha256(apiKey), readerId, req.user.tenant_id, expectedVersion],
      );
      if (!updated.rows[0]) throw new DomainError(409, 'STALE_VERSION', 'Active reader version is stale or reader was not found');
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'READER_KEY_ROTATED', entityType: 'READER', entityId: readerId, payload: { fromVersion: expectedVersion, toVersion: expectedVersion + 1 } });
      return updated.rows[0];
    });
    res.json({ ...reader, apiKey, warning: 'Store this replacement key now; the previous key is invalid' });
  }));

  app.get('/api/rules', userAuth, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM security_access_rules WHERE tenant_id = $1 ORDER BY priority DESC, name', [req.user.tenant_id]);
    res.json({ rules: result.rows });
  }));

  app.post('/api/rules', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const input = validateRule(req.body || {});
    const rule = await transaction(pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO security_access_rules (tenant_id, property_id, name, door_pattern, action, priority, days, start_time, end_time, enabled, created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 WHERE EXISTS (SELECT 1 FROM security_properties WHERE id=$2 AND tenant_id=$1 AND is_active=true) RETURNING *`,
        [req.user.tenant_id, input.propertyId, input.name, input.doorPattern, input.action, input.priority, input.days, input.startTime, input.endTime, input.enabled, req.user.id],
      );
      if (!inserted.rows[0]) throw new DomainError(404, 'PROPERTY_NOT_FOUND', 'Property was not found');
      const snapshot = snapshotRule(inserted.rows[0]);
      await client.query('INSERT INTO security_access_rule_versions (tenant_id, rule_id, version, snapshot, changed_by) VALUES ($1,$2,1,$3,$4)', [req.user.tenant_id, inserted.rows[0].id, snapshot, req.user.id]);
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'RULE_CREATED', entityType: 'ACCESS_RULE', entityId: inserted.rows[0].id, payload: snapshot });
      return inserted.rows[0];
    });
    res.status(201).json(rule);
  }));

  app.patch('/api/rules/:id', userAuth, requireRoles('ADMIN'), asyncRoute(async (req, res) => {
    const ruleId = uuid(req.params.id, 'ruleId');
    const expectedVersion = positiveVersion(req.body?.expectedVersion);
    const rule = await transaction(pool, async (client) => {
      const current = await client.query('SELECT * FROM security_access_rules WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [ruleId, req.user.tenant_id]);
      if (!current.rows[0]) throw new DomainError(404, 'RULE_NOT_FOUND', 'Access rule was not found');
      if (Number(current.rows[0].version) !== expectedVersion) throw new DomainError(409, 'STALE_VERSION', 'Access rule version is stale');
      const merged = validateRule({
        name: req.body.name ?? current.rows[0].name,
        propertyId: current.rows[0].property_id,
        doorPattern: req.body.doorPattern ?? current.rows[0].door_pattern,
        action: req.body.action ?? current.rows[0].action,
        priority: req.body.priority ?? current.rows[0].priority,
        days: req.body.days ?? current.rows[0].days,
        startTime: req.body.startTime ?? String(current.rows[0].start_time).slice(0, 5),
        endTime: req.body.endTime ?? String(current.rows[0].end_time).slice(0, 5),
        enabled: req.body.enabled ?? current.rows[0].enabled,
      });
      const updated = await client.query(
        `UPDATE security_access_rules SET name=$1,door_pattern=$2,action=$3,priority=$4,days=$5,start_time=$6,end_time=$7,enabled=$8,version=version+1,updated_at=now()
         WHERE id=$9 AND tenant_id=$10 RETURNING *`,
        [merged.name, merged.doorPattern, merged.action, merged.priority, merged.days, merged.startTime, merged.endTime, merged.enabled, ruleId, req.user.tenant_id],
      );
      const snapshot = snapshotRule(updated.rows[0]);
      await client.query('INSERT INTO security_access_rule_versions (tenant_id, rule_id, version, snapshot, changed_by) VALUES ($1,$2,$3,$4,$5)', [req.user.tenant_id, ruleId, expectedVersion + 1, snapshot, req.user.id]);
      await appendAudit(client, { tenantId: req.user.tenant_id, actorType: 'USER', actorId: req.user.id, action: 'RULE_CHANGED', entityType: 'ACCESS_RULE', entityId: ruleId, payload: { fromVersion: expectedVersion, toVersion: expectedVersion + 1, snapshot } });
      return updated.rows[0];
    });
    res.json(rule);
  }));

  app.all('/api/ai/*', (req, res) => res.status(410).json({ error: 'Ungrounded AI behavior is retired from the governed access-control product', code: 'RETIRED_UNGROUNDED_BEHAVIOR' }));
  app.all('/api/simulator/*', (req, res) => res.status(410).json({ error: 'Synthetic device simulation is retired', code: 'RETIRED_SIMULATION' }));

  app.get('/api/health/live', (req, res) => res.json({ ok: true, service: 'kastle-access' }));
  const readiness = async (req, res) => {
    try {
      await pool.query('SELECT 1 AS ok');
      const schema = await verifyMigrationState(pool);
      res.json({ ok: true, service: 'kastle-access', schema: 'current', migrations: schema.versions });
    } catch (_error) {
      res.status(503).json({ ok: false, service: 'kastle-access', schema: 'unavailable' });
    }
  };
  app.get('/api/health/ready', readiness);
  app.get('/api/health', readiness);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));
  const frontend = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontend, { fallthrough: true, maxAge: '1h' }));
  app.get('*', (req, res, next) => res.sendFile(path.join(frontend, 'index.html'), (error) => error ? next(error) : undefined));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof DomainError) return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
    if (error?.code === '23505') return res.status(409).json({ error: 'A record with that identity already exists', code: 'DUPLICATE_RECORD' });
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON', code: 'INVALID_JSON' });
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });
  return app;
}

module.exports = { createApp, validateRule };

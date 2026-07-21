const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { createApp } = require('../app');
const { sha256 } = require('../lib/canonical');

const config = {
  jwtSecret: 'test-only-jwt-secret-more-than-thirty-two-characters',
  jwtIssuer: 'kastle-test',
  jwtAudience: 'kastle-test-operators',
  corsOrigins: ['https://access.example.test'],
};
let server;
let base;
let readerFixture;

async function clear() {
  const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!/(?:_test|_validation)(?:_|$)/.test(databaseName)) throw new Error('Unsafe test database');
  await pool.query(`TRUNCATE security_audit_events, security_access_attempts, security_access_rule_versions,
    security_access_rules, security_readers, security_credentials, security_users, security_properties,
    security_tenants RESTART IDENTITY CASCADE`);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

test.before(async () => {
  await clear();
  const passwordHash = await bcrypt.hash('correct-horse-battery-staple', 10);
  const first = (await pool.query("INSERT INTO security_tenants (slug,name) VALUES ('first-tenant','First Tenant') RETURNING *")).rows[0];
  const second = (await pool.query("INSERT INTO security_tenants (slug,name) VALUES ('second-tenant','Second Tenant') RETURNING *")).rows[0];
  const admin = (await pool.query("INSERT INTO security_users (tenant_id,email,password_hash,full_name,role) VALUES ($1,'admin@first.test',$2,'First Admin','ADMIN') RETURNING *", [first.id, passwordHash])).rows[0];
  await pool.query("INSERT INTO security_users (tenant_id,email,password_hash,full_name,role) VALUES ($1,'operator@second.test',$2,'Second Operator','OPERATOR')", [second.id, passwordHash]);
  const property = (await pool.query("INSERT INTO security_properties (tenant_id,name) VALUES ($1,'First HQ') RETURNING *", [first.id])).rows[0];
  await pool.query("INSERT INTO security_credentials (tenant_id,property_id,holder_name,badge_number,credential_type,access_level,expires_on) VALUES ($1,$2,'HTTP Holder','HTTP-BADGE','CARD','Standard','2030-12-31')", [first.id, property.id]);
  await pool.query("INSERT INTO security_access_rules (tenant_id,property_id,name,door_pattern,action,priority,days,start_time,end_time,created_by) VALUES ($1,$2,'HTTP allow','Lobby','ALLOW',50,ARRAY[0,1,2,3,4,5,6]::smallint[],'00:00','00:00',$3)", [first.id, property.id, admin.id]);
  const readerKey = crypto.randomBytes(32).toString('base64url');
  const reader = (await pool.query("INSERT INTO security_readers (tenant_id,property_id,name,key_hash,created_by) VALUES ($1,$2,'HTTP Reader',$3,$4) RETURNING *", [first.id, property.id, sha256(readerKey), admin.id])).rows[0];
  readerFixture = { readerKey, reader };
  server = createApp({ pool, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (process.env.KEEP_KASTLE_TEST_DATA !== '1') await clear();
  await pool.end();
});

test('authentication, tenant boundaries, reader idempotency, CORS, and retired surfaces hold over HTTP', async () => {
  assert.equal((await request('/api/health')).response.status, 200);
  assert.equal((await request('/api/health/live')).response.status, 200);
  assert.equal((await request('/api/health/ready')).response.status, 200);
  assert.equal((await request('/api/access/attempts')).response.status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: 'first-tenant', email: 'admin@first.test', password: 'wrong-password-value' }) })).response.status, 401);

  const firstLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: 'first-tenant', email: 'admin@first.test', password: 'correct-horse-battery-staple' }) });
  assert.equal(firstLogin.response.status, 200);
  const secondLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: 'second-tenant', email: 'operator@second.test', password: 'correct-horse-battery-staple' }) });
  assert.equal(secondLogin.response.status, 200);

  const firstProperties = await request('/api/properties', { headers: { Authorization: `Bearer ${firstLogin.body.token}` } });
  const secondProperties = await request('/api/properties', { headers: { Authorization: `Bearer ${secondLogin.body.token}` } });
  assert.equal(firstProperties.body.properties.length, 1);
  assert.equal(secondProperties.body.properties.length, 0);
  assert.equal((await request('/api/properties', { method: 'POST', headers: { Authorization: `Bearer ${secondLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Forbidden Property' }) })).response.status, 403);

  const attempt = { badgeNumber: 'HTTP-BADGE', doorName: 'Lobby', direction: 'ENTRY', occurredAt: new Date(Date.now() - 1000).toISOString() };
  const readerHeaders = { 'Content-Type': 'application/json', 'X-Reader-Id': readerFixture.reader.id, 'X-Reader-Key': readerFixture.readerKey, 'Idempotency-Key': 'http-reader-event-001' };
  const firstDecision = await request('/api/access/decisions', { method: 'POST', headers: readerHeaders, body: JSON.stringify(attempt) });
  assert.equal(firstDecision.response.status, 201);
  assert.equal(firstDecision.body.decision, 'ALLOW');
  assert.equal(firstDecision.body.badge_number, undefined);
  assert.equal(firstDecision.body.request_hash, undefined);
  assert.equal(firstDecision.body.badge_suffix, 'ADGE');
  assert.equal(firstDecision.body.credential_snapshot.badgeNumber, undefined);
  assert.equal(firstDecision.body.credential_snapshot.badgeSuffix, 'ADGE');
  assert.equal((await request('/api/access/decisions', { method: 'POST', headers: readerHeaders, body: JSON.stringify(attempt) })).response.status, 200);
  assert.equal((await request('/api/access/decisions', { method: 'POST', headers: readerHeaders, body: JSON.stringify({ ...attempt, doorName: 'Other' }) })).response.status, 409);

  const visibleAttempts = await request('/api/access/attempts', { headers: { Authorization: `Bearer ${firstLogin.body.token}` } });
  assert.equal(visibleAttempts.body.attempts[0].badge_number, undefined);
  assert.equal(visibleAttempts.body.attempts[0].request_hash, undefined);
  assert.equal(visibleAttempts.body.attempts[0].credential_snapshot.badgeNumber, undefined);

  const visibleCredentials = await request('/api/credentials', { headers: { Authorization: `Bearer ${firstLogin.body.token}` } });
  assert.equal(visibleCredentials.body.credentials[0].badge_number, undefined);
  assert.equal(visibleCredentials.body.credentials[0].badge_suffix, 'ADGE');

  assert.equal((await request('/api/properties', { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Invalid Zone', timezone: 'Not/AZone' }) })).response.status, 422);
  const createdProperty = await request('/api/properties', { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'API Headquarters', timezone: 'America/New_York' }) });
  assert.equal(createdProperty.response.status, 201);
  const createdCredential = await request('/api/credentials', { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: createdProperty.body.id, holderName: 'API Holder', badgeNumber: 'API-BADGE-9001', credentialType: 'CARD', accessLevel: 'Employee', expiresOn: '2030-12-31' }) });
  assert.equal(createdCredential.response.status, 201);
  assert.equal(createdCredential.body.badge_number, undefined);
  assert.equal(createdCredential.body.badge_suffix, '9001');
  const createdRule = await request('/api/rules', { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: createdProperty.body.id, name: 'API lobby allow', doorPattern: 'API Lobby', action: 'ALLOW', priority: 50, days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '00:00', enabled: true }) });
  assert.equal(createdRule.response.status, 201);
  assert.equal(createdRule.body.version, 1);
  const createdReader = await request('/api/readers', { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: createdProperty.body.id, name: 'API Lobby Reader' }) });
  assert.equal(createdReader.response.status, 201);
  assert.equal(createdReader.body.version, 1);
  assert.equal(typeof createdReader.body.apiKey, 'string');
  const listedReaders = await request('/api/readers', { headers: { Authorization: `Bearer ${firstLogin.body.token}` } });
  assert.equal(listedReaders.response.status, 200);
  assert.equal(listedReaders.body.readers.some((reader) => reader.apiKey || reader.key_hash), false);

  const provisionedAttempt = { badgeNumber: 'API-BADGE-9001', doorName: 'API Lobby', direction: 'ENTRY', occurredAt: new Date().toISOString() };
  const provisionedHeaders = { 'Content-Type': 'application/json', 'X-Reader-Id': createdReader.body.id, 'X-Reader-Key': createdReader.body.apiKey, 'Idempotency-Key': 'api-provisioned-event-001' };
  const provisionedDecision = await request('/api/access/decisions', { method: 'POST', headers: provisionedHeaders, body: JSON.stringify(provisionedAttempt) });
  assert.equal(provisionedDecision.response.status, 201);
  assert.equal(provisionedDecision.body.decision, 'ALLOW');

  const rotatedReader = await request(`/api/readers/${createdReader.body.id}/rotate-key`, { method: 'POST', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1 }) });
  assert.equal(rotatedReader.response.status, 200);
  assert.equal(rotatedReader.body.version, 2);
  const rotatedHeaders = { ...provisionedHeaders, 'X-Reader-Key': rotatedReader.body.apiKey, 'Idempotency-Key': 'api-provisioned-event-002' };
  assert.equal((await request('/api/access/decisions', { method: 'POST', headers: { ...provisionedHeaders, 'Idempotency-Key': 'api-old-key-event-001' }, body: JSON.stringify(provisionedAttempt) })).response.status, 401);
  assert.equal((await request('/api/access/decisions', { method: 'POST', headers: rotatedHeaders, body: JSON.stringify(provisionedAttempt) })).response.status, 201);

  const revokedReader = await request(`/api/readers/${createdReader.body.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REVOKED', expectedVersion: 2 }) });
  assert.equal(revokedReader.response.status, 200);
  assert.equal(revokedReader.body.version, 3);
  assert.equal((await request('/api/access/decisions', { method: 'POST', headers: { ...rotatedHeaders, 'Idempotency-Key': 'api-revoked-event-001' }, body: JSON.stringify(provisionedAttempt) })).response.status, 401);
  assert.equal((await request(`/api/readers/${createdReader.body.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE', expectedVersion: 3 }) })).response.status, 422);
  assert.equal((await request(`/api/readers/${createdReader.body.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${firstLogin.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REVOKED', expectedVersion: 2 }) })).response.status, 409);

  const verifiedAudit = await request('/api/audit/verify', { headers: { Authorization: `Bearer ${firstLogin.body.token}` } });
  assert.equal(verifiedAudit.response.status, 200);
  assert.equal(verifiedAudit.body.valid, true);
  assert.ok(verifiedAudit.body.count >= 8);

  assert.equal((await request('/api/ai/soc-copilot', { method: 'POST' })).response.status, 410);
  assert.equal((await request('/api/simulator/toggle', { method: 'POST' })).response.status, 410);
  assert.equal((await request('/api/health', { headers: { Origin: 'https://evil.example' } })).response.status, 403);
});

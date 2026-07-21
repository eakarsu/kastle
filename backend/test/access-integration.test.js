const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const pool = require('../db');
const { sha256 } = require('../lib/canonical');
const { verifyAuditChain } = require('../lib/audit');
const { processAccessAttempt } = require('../lib/access-service');

async function clear() {
  const url = process.env.DATABASE_URL || '';
  const databaseName = new URL(url).pathname.slice(1);
  if (!/(?:_test|_validation)(?:_|$)/.test(databaseName)) throw new Error('Refusing to clear a database not explicitly named for test/validation');
  await pool.query(`TRUNCATE security_audit_events, security_access_attempts, security_access_rule_versions,
    security_access_rules, security_readers, security_credentials, security_users, security_properties,
    security_tenants RESTART IDENTITY CASCADE`);
}

async function fixture() {
  const tenant = (await pool.query("INSERT INTO security_tenants (slug,name) VALUES ('integration-tenant','Integration Tenant') RETURNING *")).rows[0];
  const user = (await pool.query("INSERT INTO security_users (tenant_id,email,password_hash,full_name,role) VALUES ($1,'admin@example.test','unused','Admin User','ADMIN') RETURNING *", [tenant.id])).rows[0];
  const property = (await pool.query("INSERT INTO security_properties (tenant_id,name) VALUES ($1,'Headquarters') RETURNING *", [tenant.id])).rows[0];
  const credential = (await pool.query(
    "INSERT INTO security_credentials (tenant_id,property_id,holder_name,badge_number,credential_type,access_level,expires_on) VALUES ($1,$2,'Alex Operator','BADGE-100','CARD','Standard','2030-12-31') RETURNING *",
    [tenant.id, property.id],
  )).rows[0];
  const expired = (await pool.query(
    "INSERT INTO security_credentials (tenant_id,property_id,holder_name,badge_number,credential_type,access_level,expires_on) VALUES ($1,$2,'Expired Holder','BADGE-OLD','CARD','Standard','2020-12-31') RETURNING *",
    [tenant.id, property.id],
  )).rows[0];
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const reader = (await pool.query(
    "INSERT INTO security_readers (tenant_id,property_id,name,key_hash,created_by) VALUES ($1,$2,'Lobby Reader',$3,$4) RETURNING *",
    [tenant.id, property.id, sha256(apiKey), user.id],
  )).rows[0];
  const allow = (await pool.query(
    `INSERT INTO security_access_rules (tenant_id,property_id,name,door_pattern,action,priority,days,start_time,end_time,created_by)
     VALUES ($1,$2,'Lobby allow','Lobby','ALLOW',50,ARRAY[0,1,2,3,4,5,6]::smallint[],'00:00','00:00',$3) RETURNING *`,
    [tenant.id, property.id, user.id],
  )).rows[0];
  return { tenant, user, property, credential, expired, reader, allow, apiKey };
}

test.before(async () => { await clear(); });
test.after(async () => { if (process.env.KEEP_KASTLE_TEST_DATA !== '1') await clear(); await pool.end(); });

test('reader authorization is idempotent, fail-closed, immutable, and hash-chained', async () => {
  const f = await fixture();
  const input = { externalEventId: 'reader-event-allow-001', badgeNumber: f.credential.badge_number, doorName: 'Lobby', direction: 'ENTRY', occurredAt: new Date(Date.now() - 60_000).toISOString(), mfaVerified: false };
  const allowed = await processAccessAttempt(pool, f.reader, input);
  assert.equal(allowed.attempt.decision, 'ALLOW');
  assert.equal(allowed.attempt.reason_code, 'RULE_ALLOW');
  assert.equal((await processAccessAttempt(pool, f.reader, input)).idempotent, true);
  await assert.rejects(() => processAccessAttempt(pool, f.reader, { ...input, doorName: 'Different Door' }), (error) => error.code === 'IDEMPOTENCY_CONFLICT');

  const expired = await processAccessAttempt(pool, f.reader, { ...input, externalEventId: 'reader-event-expired-01', badgeNumber: f.expired.badge_number });
  assert.equal(expired.attempt.reason_code, 'CREDENTIAL_EXPIRED');
  const unknown = await processAccessAttempt(pool, f.reader, { ...input, externalEventId: 'reader-event-unknown-01', badgeNumber: 'BADGE-NOT-FOUND' });
  assert.equal(unknown.attempt.reason_code, 'UNKNOWN_CREDENTIAL');

  await pool.query(
    `INSERT INTO security_access_rules (tenant_id,property_id,name,door_pattern,action,priority,days,start_time,end_time,created_by)
     VALUES ($1,$2,'Emergency lockdown','Lobby','DENY',100,ARRAY[0,1,2,3,4,5,6]::smallint[],'00:00','00:00',$3)`,
    [f.tenant.id, f.property.id, f.user.id],
  );
  const denied = await processAccessAttempt(pool, f.reader, { ...input, externalEventId: 'reader-event-denied-001' });
  assert.equal(denied.attempt.reason_code, 'RULE_DENY');

  const stale = await processAccessAttempt(pool, f.reader, {
    ...input,
    externalEventId: 'reader-event-stale-0001',
    occurredAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  });
  assert.equal(stale.attempt.reason_code, 'STALE_EVENT');

  const otherTenant = (await pool.query("INSERT INTO security_tenants (slug,name) VALUES ('actor-integrity','Actor Integrity') RETURNING *")).rows[0];
  const otherUser = (await pool.query("INSERT INTO security_users (tenant_id,email,password_hash,full_name,role) VALUES ($1,'other@example.test','unused','Other Admin','ADMIN') RETURNING *", [otherTenant.id])).rows[0];
  await assert.rejects(
    () => pool.query(
      `INSERT INTO security_readers (tenant_id,property_id,name,key_hash,created_by)
       VALUES ($1,$2,'Cross Tenant Reader',$3,$4)`,
      [f.tenant.id, f.property.id, sha256('cross-tenant-reader-key'), otherUser.id],
    ),
    /foreign key constraint/,
  );

  await assert.rejects(() => pool.query("UPDATE security_access_attempts SET decision='DENY' WHERE id=$1", [allowed.attempt.id]), /append-only/);
  const audit = await pool.query('SELECT * FROM security_audit_events WHERE tenant_id=$1 ORDER BY sequence', [f.tenant.id]);
  assert.equal(audit.rows.length, 5);
  assert.equal(verifyAuditChain(audit.rows), true);
  await assert.rejects(() => pool.query('DELETE FROM security_audit_events WHERE tenant_id=$1', [f.tenant.id]), /append-only/);
});

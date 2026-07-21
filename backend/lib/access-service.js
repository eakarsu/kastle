const { DomainError } = require('./errors');
const { stableJson, sha256 } = require('./canonical');
const { appendAudit } = require('./audit');
const { evaluateAccess, snapshotRule } = require('./access-rules');

function string(value, name, minimum, maximum) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
    throw new DomainError(422, 'INVALID_INPUT', `${name} must contain ${minimum}-${maximum} characters`);
  }
  return value.trim();
}

function normalizeAttempt(raw) {
  const occurredAt = new Date(raw.occurredAt);
  const now = Date.now();
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now + 30_000 || occurredAt.getTime() < now - 24 * 60 * 60_000) {
    throw new DomainError(422, 'INVALID_OCCURRED_AT', 'occurredAt must be within the last 24 hours and no more than 30 seconds in the future');
  }
  const direction = string(raw.direction, 'direction', 4, 5).toUpperCase();
  if (!['ENTRY', 'EXIT'].includes(direction)) throw new DomainError(422, 'INVALID_DIRECTION', 'direction must be ENTRY or EXIT');
  return {
    externalEventId: string(raw.externalEventId, 'externalEventId', 8, 160),
    badgeNumber: string(raw.badgeNumber, 'badgeNumber', 3, 80),
    doorName: string(raw.doorName, 'doorName', 1, 160),
    direction,
    mfaVerified: raw.mfaVerified === true,
    occurredAt,
    stale: occurredAt.getTime() < now - 2 * 60_000,
  };
}

function credentialSnapshot(credential) {
  if (!credential) return null;
  return {
    id: credential.id,
    holderName: credential.holder_name,
    badgeSuffix: credential.badge_number.slice(-4),
    status: credential.status,
    accessLevel: credential.access_level,
    expiresOn: credential.expires_on,
    version: Number(credential.version),
  };
}

async function processAccessAttempt(pool, reader, raw) {
  const input = normalizeAttempt(raw);
  const requestHash = sha256(stableJson({
    externalEventId: input.externalEventId,
    badgeNumber: input.badgeNumber,
    doorName: input.doorName,
    direction: input.direction,
    mfaVerified: input.mfaVerified,
    occurredAt: input.occurredAt.toISOString(),
    readerId: reader.id,
  }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${reader.tenant_id}:${input.externalEventId}`]);
    const replay = await client.query(
      'SELECT * FROM security_access_attempts WHERE tenant_id = $1 AND external_event_id = $2',
      [reader.tenant_id, input.externalEventId],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash) throw new DomainError(409, 'IDEMPOTENCY_CONFLICT', 'externalEventId was already used with different content');
      await client.query('COMMIT');
      return { attempt: replay.rows[0], idempotent: true };
    }

    const credentialResult = await client.query(
      `SELECT * FROM security_credentials
       WHERE tenant_id = $1 AND property_id = $2 AND badge_number = $3`,
      [reader.tenant_id, reader.property_id, input.badgeNumber],
    );
    const credential = credentialResult.rows[0] || null;
    const rulesResult = await client.query(
      `SELECT * FROM security_access_rules
       WHERE tenant_id = $1 AND property_id = $2 AND enabled = true
       ORDER BY priority DESC, id`,
      [reader.tenant_id, reader.property_id],
    );
    const evaluation = evaluateAccess({ credential, rules: rulesResult.rows, doorName: input.doorName, occurredAt: input.occurredAt, mfaVerified: input.mfaVerified, stale: input.stale });
    const ruleSnapshot = snapshotRule(evaluation.rule);
    const credSnapshot = credentialSnapshot(credential);
    const inserted = await client.query(
      `INSERT INTO security_access_attempts
        (tenant_id, property_id, reader_id, external_event_id, request_hash, credential_id,
         badge_number, door_name, direction, mfa_verified, occurred_at, decision, reason_code,
         reason_detail, matched_rule_id, credential_snapshot, rule_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [reader.tenant_id, reader.property_id, reader.id, input.externalEventId, requestHash,
        credential?.id || null, input.badgeNumber, input.doorName, input.direction, input.mfaVerified,
        input.occurredAt, evaluation.decision, evaluation.reasonCode, evaluation.reasonDetail,
        evaluation.rule?.id || null, credSnapshot, ruleSnapshot],
    );
    const attempt = inserted.rows[0];
    await appendAudit(client, {
      tenantId: reader.tenant_id,
      actorType: 'READER',
      actorId: reader.id,
      action: 'ACCESS_DECIDED',
      entityType: 'ACCESS_ATTEMPT',
      entityId: attempt.id,
      payload: { externalEventId: input.externalEventId, requestHash, decision: attempt.decision, reasonCode: attempt.reason_code },
    });
    await client.query('COMMIT');
    return { attempt, idempotent: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { normalizeAttempt, processAccessAttempt, credentialSnapshot };

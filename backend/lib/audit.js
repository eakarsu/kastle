const { stableJson, sha256 } = require('./canonical');

const GENESIS = '0'.repeat(64);

async function appendAudit(client, input) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kastle-audit:${input.tenantId}`]);
  const prior = await client.query(
    'SELECT sequence, event_hash FROM security_audit_events WHERE tenant_id = $1 ORDER BY sequence DESC LIMIT 1',
    [input.tenantId],
  );
  const sequence = Number(prior.rows[0]?.sequence || 0) + 1;
  const previousHash = prior.rows[0]?.event_hash || GENESIS;
  const occurredAt = input.occurredAt || new Date();
  const payloadHash = sha256(stableJson(input.payload));
  const eventHash = sha256(stableJson({
    tenantId: input.tenantId,
    sequence,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payloadHash,
    previousHash,
    occurredAt: occurredAt.toISOString(),
  }));
  const result = await client.query(
    `INSERT INTO security_audit_events
      (tenant_id, sequence, actor_type, actor_id, action, entity_type, entity_id, payload,
       payload_hash, previous_hash, event_hash, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [input.tenantId, sequence, input.actorType, input.actorId, input.action, input.entityType,
      input.entityId, input.payload, payloadHash, previousHash, eventHash, occurredAt],
  );
  return result.rows[0];
}

function verifyAuditChain(events) {
  let previousHash = GENESIS;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (Number(event.sequence) !== index + 1 || event.previous_hash !== previousHash) return false;
    if (sha256(stableJson(event.payload)) !== event.payload_hash) return false;
    const expected = sha256(stableJson({
      tenantId: event.tenant_id,
      sequence: Number(event.sequence),
      actorType: event.actor_type,
      actorId: event.actor_id,
      action: event.action,
      entityType: event.entity_type,
      entityId: event.entity_id,
      payloadHash: event.payload_hash,
      previousHash: event.previous_hash,
      occurredAt: new Date(event.occurred_at).toISOString(),
    }));
    if (expected !== event.event_hash) return false;
    previousHash = event.event_hash;
  }
  return true;
}

module.exports = { appendAudit, verifyAuditChain, GENESIS };

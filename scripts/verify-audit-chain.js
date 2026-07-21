const pool = require('../backend/db');
const { verifyAuditChain } = require('../backend/lib/audit');

async function main() {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) throw new Error('TENANT_ID is required');
  const result = await pool.query('SELECT * FROM security_audit_events WHERE tenant_id=$1 ORDER BY sequence', [tenantId]);
  if (!result.rows.length) throw new Error('No audit events found');
  if (!verifyAuditChain(result.rows)) throw new Error('Audit chain verification failed');
  console.log(`verified ${result.rows.length} audit events for tenant ${tenantId}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());

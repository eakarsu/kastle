const bcrypt = require('bcryptjs');
const pool = require('../db');
const { appendAudit } = require('../lib/audit');

function env(name, minimum = 1) {
  const value = process.env[name];
  if (!value || value.length < minimum) throw new Error(`${name} is required${minimum > 1 ? ` and must contain at least ${minimum} characters` : ''}`);
  return value;
}

async function main() {
  const tenantSlug = env('BOOTSTRAP_TENANT_SLUG').toLowerCase();
  const tenantName = env('BOOTSTRAP_TENANT_NAME');
  const propertyName = env('BOOTSTRAP_PROPERTY_NAME');
  const email = env('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const fullName = env('BOOTSTRAP_ADMIN_NAME');
  const password = env('BOOTSTRAP_ADMIN_PASSWORD', 12);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(tenantSlug)) throw new Error('BOOTSTRAP_TENANT_SLUG is invalid');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is invalid');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let tenant = (await client.query('SELECT * FROM security_tenants WHERE slug=$1 FOR UPDATE', [tenantSlug])).rows[0];
    if (!tenant) tenant = (await client.query('INSERT INTO security_tenants (slug,name) VALUES ($1,$2) RETURNING *', [tenantSlug, tenantName])).rows[0];
    const existing = await client.query('SELECT id FROM security_users WHERE tenant_id=$1 AND lower(email)=$2', [tenant.id, email]);
    if (existing.rows[0]) throw new Error('Administrator already exists; bootstrap never overwrites credentials');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = (await client.query(
      `INSERT INTO security_users (tenant_id,email,password_hash,full_name,role)
       VALUES ($1,$2,$3,$4,'ADMIN') RETURNING id,email,full_name,role`,
      [tenant.id, email, passwordHash, fullName],
    )).rows[0];
    let property = (await client.query('SELECT * FROM security_properties WHERE tenant_id=$1 AND name=$2', [tenant.id, propertyName])).rows[0];
    if (!property) property = (await client.query('INSERT INTO security_properties (tenant_id,name) VALUES ($1,$2) RETURNING *', [tenant.id, propertyName])).rows[0];
    await appendAudit(client, { tenantId: tenant.id, actorType: 'SYSTEM', actorId: 'bootstrap-admin', action: 'TENANT_BOOTSTRAPPED', entityType: 'TENANT', entityId: tenant.id, payload: { tenantSlug, adminId: user.id, propertyId: property.id } });
    await client.query('COMMIT');
    console.log(`Bootstrapped tenant ${tenantSlug}, administrator ${email}, property ${property.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

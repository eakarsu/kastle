const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(directory).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      await client.query('BEGIN');
      try {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('kastle-schema-migrations'))`);
        const prior = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [file]);
        if (prior.rows[0]) {
          if (prior.rows[0].checksum !== checksum) throw new Error(`Applied migration ${file} checksum changed`);
          await client.query('COMMIT');
          console.log(`already applied ${file}`);
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

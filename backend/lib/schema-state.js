const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function expectedMigrations() {
  const directory = path.join(__dirname, '..', 'migrations');
  return fs.readdirSync(directory)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()
    .map((file) => ({
      version: file,
      checksum: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file), 'utf8')).digest('hex'),
    }));
}

async function verifyMigrationState(pool) {
  const expected = expectedMigrations();
  const result = await pool.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  if (result.rows.length !== expected.length) {
    throw new Error(`Schema version mismatch: expected ${expected.length} migration(s), found ${result.rows.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (result.rows[index].version !== expected[index].version || result.rows[index].checksum !== expected[index].checksum) {
      throw new Error(`Schema checksum mismatch at ${expected[index].version}`);
    }
  }
  return { current: true, versions: expected.map((migration) => migration.version) };
}

module.exports = { expectedMigrations, verifyMigrationState };

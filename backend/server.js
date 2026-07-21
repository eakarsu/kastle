require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('./db');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { verifyMigrationState } = require('./lib/schema-state');

const config = loadConfig();
const app = createApp({ pool, config });
let server;

async function start() {
  await verifyMigrationState(pool);
  server = app.listen(config.port, config.host, () => {
    console.log(`Kastle governed access service listening on http://${config.host}:${config.port}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; closing service`);
  if (!server) return process.exit(0);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start().catch(async (error) => {
  console.error(`Startup failed: ${error.message}`);
  await pool.end();
  process.exit(1);
});

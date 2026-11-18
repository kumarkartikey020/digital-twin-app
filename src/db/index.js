const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../config/logger');

const isTest = env.NODE_ENV === 'test';
let connectionString = (isTest && env.TEST_DATABASE_URL && env.TEST_DATABASE_URL !== env.DATABASE_URL) ? env.TEST_DATABASE_URL : env.DATABASE_URL;

if (isTest) {
  const lower = (connectionString || '').toLowerCase();
  if (lower.includes('ep-sparkling-mode-apvo7mhj') || lower.includes('digitaltwinvrs.com')) {
    const errorMsg = '[CRITICAL DATABASE ISOLATION ERROR] Pool initialization blocked! Attempted to connect to production database while NODE_ENV=test.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
}

const isLocalHost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const sslConfig = (isLocalHost || env.DB_SSL_OFF) ? false : { rejectUnauthorized: true };

const pool = new Pool({
  connectionString: connectionString,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  ssl: sslConfig
});

pool.on('error', function(err) {
  logger.error('Unexpected database pool error (auto-reconnecting)', { error: err.message, stack: err.stack });
});

async function query(text, params) {
  return pool.query(text, params);
}

async function ping() {
  await pool.query('SELECT 1');
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  ping,
  withTransaction
};

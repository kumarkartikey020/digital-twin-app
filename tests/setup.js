const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const cacheService = require('../src/services/cacheService');
const { assertSafeTestDatabase, isSafeTestDatabase } = require('./databaseGuard');

jest.setTimeout(60000);

beforeAll(async function() {
  // Fail-closed assertion: Rejects test startup if pointed to production
  assertSafeTestDatabase(process.env.DATABASE_URL, 'Test suite initialization');

  try {
    await db.ping();
  } catch (err) {
    console.warn('[TEST SETUP WARN] Test database unreachable or init skipped:', err.message);
  }
}, 60000);

afterEach(async function() {
  // Fail-closed assertion: Strictly block TRUNCATE unless database is verified test instance
  assertSafeTestDatabase(process.env.DATABASE_URL, 'Teardown TRUNCATE operation');

  if (!isSafeTestDatabase(process.env.DATABASE_URL)) {
    throw new Error('[CRITICAL SAFETY LOCK] TRUNCATE aborted: Database is not a verified test instance.');
  }

  try {
    await db.pool.query('TRUNCATE TABLE refresh_tokens, files, users RESTART IDENTITY CASCADE');
  } catch (err) {
    // Suppress if table does not exist or mock
  }
}, 60000);

afterAll(async function() {
  try {
    await cacheService.quit();
  } catch (e) {}
  try {
    await db.pool.end();
  } catch (err) {}
}, 60000);

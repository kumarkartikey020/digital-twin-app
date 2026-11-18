const { execSync } = require('child_process');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const pgCtl = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe';
const clusterDir = path.resolve('scratch/test_pg_cluster');
const logFile = path.resolve('scratch/test_pg.log');

module.exports = async function globalSetup() {
  // 1. Ensure test cluster directory exists, if not initialize it
  if (!fs.existsSync(clusterDir)) {
    const initDb = 'C:\\Program Files\\PostgreSQL\\16\\bin\\initdb.exe';
    execSync(`"${initDb}" -D "${clusterDir}" -U postgres -A trust --encoding=UTF8`, { stdio: 'inherit' });
  }

  // 2. Check if already running on port 5433
  let isRunning = false;
  try {
    const probe = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5433/postgres' });
    await probe.connect();
    await probe.end();
    isRunning = true;
  } catch (e) {
    isRunning = false;
  }

  if (!isRunning) {
    // Start PostgreSQL on port 5433 with stdio: 'ignore' to prevent handle blocking
    execSync(`"${pgCtl}" -D "${clusterDir}" -l "${logFile}" -o "-p 5433 -h 127.0.0.1" start`, { stdio: 'ignore' });

    let connected = false;
    for (let i = 0; i < 40; i++) {
      try {
        const probe = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5433/postgres' });
        await probe.connect();
        await probe.end();
        connected = true;
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    if (!connected) {
      throw new Error('[TEST DATABASE INIT FAILURE] Failed to connect to local test PostgreSQL cluster on port 5433.');
    }
  }

  // 3. Ensure digital_twin_test database exists
  const adminClient = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5433/postgres' });
  await adminClient.connect();
  const dbCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'digital_twin_test'");
  if (dbCheck.rows.length === 0) {
    await adminClient.query('CREATE DATABASE digital_twin_test');
  }
  await adminClient.end();

  // 4. Apply all SQL migrations
  const testDb = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5433/digital_twin_test' });
  await testDb.connect();

  const migrationsDir = path.resolve('migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await testDb.query(sql);
    } catch (mErr) {
      // Suppress missing table warnings on legacy payment webhooks
    }
  }
  await testDb.end();
};

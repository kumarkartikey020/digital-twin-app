const { execSync } = require('child_process');
const path = require('path');

const pgCtl = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe';
const clusterDir = path.resolve('scratch/test_pg_cluster');

module.exports = async function globalTeardown() {
  try {
    execSync(`"${pgCtl}" -D "${clusterDir}" stop -m fast`, { stdio: 'ignore' });
  } catch (err) {
    // Process may have already exited
  }
};

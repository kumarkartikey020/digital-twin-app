/**
 * Database Environment Isolation Guard
 * 
 * STRICT PRODUCTION SAFETY ENFORCEMENT:
 * Rejects any test execution or destructive database operation if the target
 * database matches or resembles production infrastructure.
 */

const KNOWN_PRODUCTION_INDICATORS = [
  'ep-sparkling-mode-apvo7mhj',
  'digitaltwinvrs.com',
  'neondb_owner'
];

function isProductionDatabase(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return KNOWN_PRODUCTION_INDICATORS.some(indicator => lower.includes(indicator.toLowerCase()));
}

function isSafeTestDatabase(url) {
  if (!url || typeof url !== 'string') return false;
  if (isProductionDatabase(url)) return false;

  const lower = url.toLowerCase();
  const isLocal = lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('::1');
  const isNamedTest = lower.includes('_test') || lower.includes('-test') || lower.includes('/test') ||
                      lower.includes('_staging') || lower.includes('-staging') || lower.includes('/staging');

  return isLocal || isNamedTest;
}

function assertSafeTestDatabase(url, operation = 'Test execution') {
  if (!url) {
    throw new Error(`[FAIL-CLOSED SAFETY GUARD] ${operation} blocked: Database URL is undefined or empty.`);
  }

  if (isProductionDatabase(url)) {
    throw new Error(
      `[FAIL-CLOSED SAFETY GUARD CRITICAL] ${operation} REJECTED!\n` +
      `Target database URL contains production signatures (${KNOWN_PRODUCTION_INDICATORS.join(', ')}).\n` +
      `Connecting tests or running destructive operations against production is strictly prohibited.`
    );
  }

  if (!isSafeTestDatabase(url)) {
    throw new Error(
      `[FAIL-CLOSED SAFETY GUARD] ${operation} REJECTED!\n` +
      `Target database URL (${url.replace(/:[^:@]+@/, ':***@')}) is not a verified test database.\n` +
      `Test database must run on localhost/127.0.0.1 or have a dedicated test database name (e.g. digital_twin_test).`
    );
  }

  return true;
}

module.exports = {
  isProductionDatabase,
  isSafeTestDatabase,
  assertSafeTestDatabase,
  KNOWN_PRODUCTION_INDICATORS
};

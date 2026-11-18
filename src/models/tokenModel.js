const db = require('../db');

async function create(token, client = db) {
  const familyId = token.familyId || null;
  const result = await client.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, family_id) VALUES ($1, $2, $3, $4, $5, COALESCE($6, gen_random_uuid())) RETURNING *',
    [token.userId, token.tokenHash, token.expiresAt, token.ipAddress || null, token.userAgent || null, familyId]
  );
  return result.rows[0];
}

async function findByHash(tokenHash, client = db) {
  const result = await client.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

async function findByHashForUpdate(client, tokenHash) {
  const result = await client.query('SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
  return result.rows[0] || null;
}

async function revoke(tokenId, client = db) {
  await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [tokenId]);
}

async function revokeByHash(tokenHash, client = db) {
  await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
}

async function revokeFamily(familyId, client = db) {
  if (!familyId) return;
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE (family_id = $1 OR id = $1) AND revoked_at IS NULL',
    [familyId]
  );
}

module.exports = {
  create,
  findByHash,
  findByHashForUpdate,
  revoke,
  revokeByHash,
  revokeFamily
};

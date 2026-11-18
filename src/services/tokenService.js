const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ms = require('ms');
const env = require('../config/env');
const db = require('../db');
const tokenModel = require('../models/tokenModel');
const userModel = require('../models/userModel');
const ApiError = require('../utils/apiError');
const logger = require('../config/logger');

// Grace period for legitimate concurrent refresh requests (e.g., parallel tab/fetch races)
const REFRESH_REUSE_GRACE_MS = 15 * 1000; // 15 seconds

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    algorithm: 'HS256'
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAccessExpiresInSeconds() {
  const ttlMs = ms(env.JWT_ACCESS_TTL);
  return Math.floor(ttlMs / 1000);
}

function getRefreshExpiresAt() {
  const ttlMs = ms(env.JWT_REFRESH_TTL);
  return new Date(Date.now() + ttlMs);
}

async function createAuthTokens(user, meta, familyId = null, client = db) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = getRefreshExpiresAt();
  const tokenFamilyId = familyId || crypto.randomUUID();

  await tokenModel.create({
    userId: user.id,
    tokenHash: refreshHash,
    expiresAt: expiresAt,
    ipAddress: meta ? meta.ip : null,
    userAgent: meta ? meta.userAgent : null,
    familyId: tokenFamilyId
  }, client);

  return {
    accessToken: accessToken,
    refreshToken: refreshToken,
    accessExpiresIn: getAccessExpiresInSeconds(),
    refreshExpiresAt: expiresAt,
    familyId: tokenFamilyId
  };
}

async function rotateRefreshToken(refreshToken, meta) {
  const tokenHash = hashToken(refreshToken);

  return await db.withTransaction(async (client) => {
    // Row lock on token record prevents concurrent race conditions
    const record = await tokenModel.findByHashForUpdate(client, tokenHash);
    if (!record) {
      throw new ApiError(401, 'Invalid refresh token.');
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new ApiError(401, 'Refresh token expired.');
    }

    const familyId = record.family_id || record.id;

    // Check if token was already revoked
    if (record.revoked_at) {
      const revokedMsAgo = Date.now() - new Date(record.revoked_at).getTime();

      if (revokedMsAgo > REFRESH_REUSE_GRACE_MS) {
        // Hostile reuse detected! Invalidate the ENTIRE token family
        await tokenModel.revokeFamily(familyId, client);
        logger.warn('SECURITY ALERT: Hostile refresh token reuse detected! Revoking entire token family.', {
          userId: record.user_id,
          familyId: familyId,
          revokedMsAgo
        });
        throw new ApiError(401, 'Security Alert: Compromised refresh token reused. All active sessions have been terminated. Please log in again.');
      } else {
        // Legitimate parallel request within grace window (e.g. concurrent page loads)
        logger.info('Benign concurrent token refresh within grace window', {
          userId: record.user_id,
          familyId: familyId,
          revokedMsAgo
        });
        throw new ApiError(401, 'Refresh token already rotated. Please use the updated session token.');
      }
    }

    // Token is valid and unrevoked: verify user status
    const userRes = await client.query('SELECT * FROM users WHERE id = $1', [record.user_id]);
    const userRow = userRes.rows[0];
    if (!userRow || !userRow.is_active) {
      throw new ApiError(401, 'Account is inactive or missing.');
    }

    // Revoke current token
    await tokenModel.revoke(record.id, client);

    // Issue new token in the same token family
    const userObj = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      name: userRow.name
    };
    const tokens = await createAuthTokens(userObj, meta, familyId, client);

    return { user: userObj, tokens: tokens };
  });
}

async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await tokenModel.revokeByHash(tokenHash);
}

module.exports = {
  createAuthTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  getAccessExpiresInSeconds,
  REFRESH_REUSE_GRACE_MS
};

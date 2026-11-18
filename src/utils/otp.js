const crypto = require('crypto');
const env = require('../config/env');

const OTP_TTL_MS = 10 * 60 * 1000;      // 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000;       // 60-second request cooldown
const MAX_OTP_ATTEMPTS = 5;              // Maximum verification failures before invalidation

/**
 * Generate a cryptographically secure 6-digit OTP string (100000 - 999999)
 */
function generateSecureOTP() {
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * Get the server-side HMAC secret for OTP hashing.
 * Prefers env.OTP_SECRET; falls back safely to env.JWT_ACCESS_SECRET.
 */
function getOTPSecret() {
  const secret = env.OTP_SECRET || env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('Server configuration error: Neither OTP_SECRET nor JWT_ACCESS_SECRET is configured.');
  }
  return secret;
}

/**
 * Compute a keyed HMAC-SHA256 hash for an OTP.
 * Incorporates the userId as salt and server secret as the cryptographic key.
 * This completely defeats rainbow tables and dictionary attacks on the 10^6 OTP space.
 * 
 * @param {string} userId - User UUID
 * @param {string} otpCode - Plaintext 6-digit OTP
 * @returns {string} 64-character hexadecimal HMAC digest
 */
function computeOTPHash(userId, otpCode) {
  if (!userId || !otpCode) {
    throw new Error('computeOTPHash requires both userId and otpCode.');
  }
  const secret = getOTPSecret();
  const normalizedOtp = String(otpCode).trim();
  const payload = `${userId}:${normalizedOtp}`;

  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a candidate OTP against a stored hash using constant-time comparison.
 * 
 * @param {string} userId - User UUID
 * @param {string} candidateOtp - Candidate 6-digit OTP string
 * @param {string} storedHash - Stored 64-char HMAC hash
 * @returns {boolean} True if candidate matches stored hash
 */
function verifyOTPHash(userId, candidateOtp, storedHash) {
  if (!userId || !candidateOtp || !storedHash) {
    return false;
  }

  // Stored hash must be a 64-character hexadecimal string
  if (typeof storedHash !== 'string' || storedHash.length !== 64) {
    return false;
  }

  try {
    const candidateHash = computeOTPHash(userId, candidateOtp);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');

    if (candidateBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Redact email for secure operational logging
 * @param {string} email
 * @returns {string} e.g. "j***@gmail.com"
 */
function redactEmail(email) {
  if (!email || typeof email !== 'string') return '[REDACTED]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED]';
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length <= 2 ? user[0] + '***' : user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

module.exports = {
  OTP_TTL_MS,
  OTP_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
  generateSecureOTP,
  computeOTPHash,
  verifyOTPHash,
  redactEmail
};

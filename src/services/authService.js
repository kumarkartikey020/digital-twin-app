const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const db = require('../db');
const logger = require('../config/logger');
const ApiError = require('../utils/apiError');
const { hashPassword, comparePassword } = require('../utils/password');
const userModel = require('../models/userModel');
const emailService = require('./emailService');
const crypto = require('crypto');
const {
  OTP_TTL_MS,
  OTP_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
  generateSecureOTP,
  computeOTPHash,
  verifyOTPHash
} = require('../utils/otp');

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isFakeEmail(email) {
  if (env.NODE_ENV === 'test') return false;
  const blockedTerms = ['@example.com', 'test_', 'tempmail', '10minutemail', 'mailinator', 'yopmail', 'guerrillamail'];
  return blockedTerms.some(term => email.includes(term));
}

async function signup(payload) {
  const email = normalizeEmail(payload.email);
  if (isFakeEmail(email)) {
    throw new ApiError(403, 'Unauthorized: Test or temporary emails are not allowed.');
  }
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'Email already in use.');
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await userModel.create({
    email: email,
    passwordHash: passwordHash,
    name: payload.name || null,
    role: 'student'
  });

  // Generate 6-digit secure OTP and compute keyed HMAC-SHA256 for storage
  const otpCode = generateSecureOTP();
  const otpHash = computeOTPHash(user.id, otpCode);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await userModel.setOTP(user.id, otpHash, expiresAt);
  
  // Fire and forget email sending with plaintext otpCode; DB stores only keyed HMAC hash
  emailService.sendVerificationEmail(user.email, otpCode).catch(err => console.error('Signup email dispatch error:', err.message));

  return user;
}

async function verifyOTP(userId, otpCode) {
  return await db.withTransaction(async (client) => {
    // Row lock on user record prevents concurrent verification race conditions
    const res = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = res.rows[0];
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.email_verified) throw new ApiError(400, 'Email is already verified.');

    if (!user.otp_code || !user.otp_expires_at) {
      throw new ApiError(400, 'No active verification code found. Please request a new one.');
    }

    // Expiration check: if expired, clear and reject
    if (new Date() > new Date(user.otp_expires_at)) {
      await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
      throw new ApiError(400, 'Verification code has expired. Please request a new one.');
    }

    // Attempt limit check: prevent brute-force (max 5 attempts)
    if ((user.otp_attempts || 0) >= MAX_OTP_ATTEMPTS) {
      await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
      throw new ApiError(429, 'Too many failed verification attempts. This code has been invalidated for security. Please request a new one.');
    }

    // Keyed HMAC timing-safe verification
    const isValid = verifyOTPHash(user.id, otpCode, user.otp_code);
    if (!isValid) {
      const newAttempts = (user.otp_attempts || 0) + 1;
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
        throw new ApiError(429, 'Too many failed verification attempts. This code has been invalidated for security. Please request a new one.');
      } else {
        await client.query('UPDATE users SET otp_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
        const remaining = MAX_OTP_ATTEMPTS - newAttempts;
        throw new ApiError(400, `Invalid verification code. ${remaining} attempt(s) remaining.`);
      }
    }

    // Valid: Mark email verified and clear OTP in the exact same transaction (single-use guarantee)
    const updateRes = await client.query(
      'UPDATE users SET email_verified = true, otp_code = null, otp_expires_at = null, otp_attempts = 0, updated_at = now() WHERE id = $1 RETURNING *',
      [user.id]
    );
    return updateRes.rows[0];
  });
}

async function resendOTP(userId) {
  const otpCode = generateSecureOTP();

  await db.withTransaction(async (client) => {
    // Row lock on user record prevents concurrent resend race conditions
    const res = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = res.rows[0];
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.email_verified) throw new ApiError(400, 'Email is already verified.');

    // Rate limiting cooldown (60 seconds)
    if (user.otp_expires_at) {
      const generatedAt = new Date(user.otp_expires_at).getTime() - OTP_TTL_MS;
      const elapsed = Date.now() - generatedAt;
      if (elapsed < OTP_COOLDOWN_MS) {
        const waitSecs = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
        throw new ApiError(429, `Please wait ${waitSecs} seconds before requesting a new OTP.`);
      }
    }

    const otpHash = computeOTPHash(user.id, otpCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await client.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0, updated_at = now() WHERE id = $3',
      [otpHash, expiresAt, user.id]
    );
  });

  const user = await userModel.findById(userId);
  if (user) {
    emailService.sendVerificationEmail(user.email, otpCode).catch(err => console.error('Resend email dispatch error:', err.message));
  }
}

async function login(payload) {
  const email = normalizeEmail(payload.email);
  if (isFakeEmail(email)) {
    throw new ApiError(403, 'Unauthorized: Test or temporary emails are not allowed.');
  }
  const user = await userModel.findByEmail(email);
  if (!user || !user.passwordHash) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Blocked User: This account has been disabled by the admin.');
  }

  const matches = await comparePassword(payload.password, user.passwordHash);
  if (!matches) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  await userModel.updateLastLogin(user.id);
  return user;
}

async function parentLogin(payload) {
  const email = normalizeEmail(payload.email);

  // 1. Check if student code exists
  let student = null;
  try {
    student = await userModel.findByLinkCode(payload.studentCode);
  } catch (err) {
    // Ignore error, student remains null
  }
  
  if (!student) {
    throw new ApiError(404, 'Invalid Student Link Code. Ask your child for the correct code.');
  }

  // 2. Find or create Parent
  let parent = await userModel.findByEmail(email);
  if (!parent) {
    const passwordHash = await hashPassword(payload.password);
    parent = await userModel.create({
      email: email,
      passwordHash: passwordHash,
      role: 'parent',
      name: 'Parent User',
      emailVerified: true // Auto-verify for demo
    });
  } else {
    // Verify password if parent exists
    const matches = await comparePassword(payload.password, parent.passwordHash);
    if (!matches) {
      throw new ApiError(401, 'Invalid email or password.');
    }
  }

  // 3. Link them
  await userModel.linkParentStudent(parent.id, student.id);
  await userModel.updateLastLogin(parent.id);

  return parent;
}

async function loginWithGoogle(idToken) {
  if (!googleClient) {
    throw new ApiError(400, 'Google login is not configured.');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: idToken,
    audience: env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new ApiError(401, 'Invalid Google token.');
  }

  const email = normalizeEmail(payload.email);
  const subject = payload.sub;

  let user = await userModel.findByOAuth('google', subject);
  if (!user) {
    const byEmail = await userModel.findByEmail(email);
    if (byEmail) {
      user = await userModel.linkOAuth(byEmail.id, 'google', subject, payload.picture, payload.name, payload.email_verified);
    } else {
      user = await userModel.create({
        email: email,
        name: payload.name || null,
        avatarUrl: payload.picture || null,
        role: 'student',
        oauthProvider: 'google',
        oauthSubject: subject,
        emailVerified: payload.email_verified || false
      });
    }
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Blocked User: This account has been disabled by the admin.');
  }

  await userModel.updateLastLogin(user.id);
  return user;
}

async function forgotPassword(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (isFakeEmail(email)) {
    throw new ApiError(403, 'Unauthorized: Test or temporary emails are not allowed.');
  }

  const user = await userModel.findByEmail(email);
  if (!user) {
    // Constant public response: identical to existing account behavior (no enumeration)
    return;
  }

  // Account exists: Check rate limit cooldown (60 seconds)
  let shouldDispatch = true;
  if (user.otpExpiresAt) {
    const generatedAt = new Date(user.otpExpiresAt).getTime() - OTP_TTL_MS;
    const elapsed = Date.now() - generatedAt;
    if (elapsed < OTP_COOLDOWN_MS) {
      // Cooldown active: Do NOT throw 429 to the public caller to eliminate enumeration!
      // Silently suppress email dispatch while returning identical success response
      shouldDispatch = false;
      logger.info('Password reset cooldown active; suppressed email to prevent enumeration', {
        userId: user.id
      });
    }
  }

  if (shouldDispatch) {
    const otpCode = generateSecureOTP();
    const otpHash = computeOTPHash(user.id, otpCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await userModel.setOTP(user.id, otpHash, expiresAt);
    await emailService.sendPasswordResetEmail(user.email, otpCode);
  }
}

async function resetPassword(email, otpCode, newPassword) {
  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(newPassword);

  return await db.withTransaction(async (client) => {
    // Row lock on user record prevents concurrent password resets with the same OTP
    const res = await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [normalized]);
    const user = res.rows[0];
    if (!user) {
      throw new ApiError(400, 'Invalid request.');
    }

    if (!user.otp_code || !user.otp_expires_at) {
      throw new ApiError(400, 'Invalid or expired OTP.');
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
      throw new ApiError(400, 'OTP has expired. Please request a new password reset.');
    }

    if ((user.otp_attempts || 0) >= MAX_OTP_ATTEMPTS) {
      await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
      throw new ApiError(429, 'Too many failed attempts. This OTP has been invalidated. Please request a new password reset.');
    }

    const isValid = verifyOTPHash(user.id, otpCode, user.otp_code);
    if (!isValid) {
      const newAttempts = (user.otp_attempts || 0) + 1;
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await client.query('UPDATE users SET otp_code = null, otp_expires_at = null, otp_attempts = 0 WHERE id = $1', [user.id]);
        throw new ApiError(429, 'Too many failed attempts. This OTP has been invalidated. Please request a new password reset.');
      } else {
        await client.query('UPDATE users SET otp_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
        const remaining = MAX_OTP_ATTEMPTS - newAttempts;
        throw new ApiError(400, `Invalid or expired OTP. ${remaining} attempt(s) remaining.`);
      }
    }

    // Atomically update password and wipe OTP in the exact same transaction
    await client.query(
      'UPDATE users SET password_hash = $1, otp_code = null, otp_expires_at = null, otp_attempts = 0, updated_at = now() WHERE id = $2',
      [passwordHash, user.id]
    );
  });
}

module.exports = {
  signup,
  login,
  loginWithGoogle,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  parentLogin
};

-- Migration 029: OTP Keyed Cryptographic Security & Attempt Limiting
-- Adds attempt tracking and invalidates legacy plaintext OTPs without affecting user accounts or passwords.

-- 1. Add otp_attempts column to users table with default 0
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0;

-- 2. Invalidate any legacy plaintext OTPs (which have length < 64, compared to HMAC-SHA256 hex digests which are 64 chars)
UPDATE users 
SET otp_code = NULL, 
    otp_expires_at = NULL, 
    otp_attempts = 0 
WHERE otp_code IS NOT NULL 
  AND length(otp_code) < 64;

-- 3. Document table state
COMMENT ON COLUMN users.otp_code IS 'Keyed HMAC-SHA256 hex digest of the OTP salted with user id. Never stores plaintext.';
COMMENT ON COLUMN users.otp_attempts IS 'Failed verification attempts for the current active OTP. Locks out at 5.';

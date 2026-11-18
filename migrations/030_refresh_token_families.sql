-- Migration 030: Refresh Token Family Security & Replay Attack Detection
-- Adds family_id to refresh_tokens for token family tracking and hostile reuse revocation.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id uuid DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);

COMMENT ON COLUMN refresh_tokens.family_id IS 'UUID grouping refresh tokens belonging to the same continuous login/rotation session family.';

-- Migration: 035_student_intelligence_provenance.sql
-- Digital Twin Verse: Student Intelligence Provenance, Adaptive Growth & Verified Skill Engine (P2)
-- Enforces 4-tier skill verification: SELF_DECLARED, ACTIVITY_BASED, PROJECT_VERIFIED, ASSESSMENT_VERIFIED.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Extend student_profile_skills with explicit provenance and evidence reference
ALTER TABLE student_profile_skills 
    ADD COLUMN IF NOT EXISTS provenance_type VARCHAR(32) NOT NULL DEFAULT 'SELF_DECLARED' 
        CHECK (provenance_type IN ('SELF_DECLARED', 'ACTIVITY_BASED', 'PROJECT_VERIFIED', 'ASSESSMENT_VERIFIED')),
    ADD COLUMN IF NOT EXISTS evidence_reference JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profile_skills_provenance ON student_profile_skills(profile_id, provenance_type);

-- 2. Extend student_skill_gaps with provenance tracking
ALTER TABLE student_skill_gaps
    ADD COLUMN IF NOT EXISTS provenance_type VARCHAR(32) NOT NULL DEFAULT 'SELF_DECLARED'
        CHECK (provenance_type IN ('SELF_DECLARED', 'ACTIVITY_BASED', 'PROJECT_VERIFIED', 'ASSESSMENT_VERIFIED'));

CREATE INDEX IF NOT EXISTS idx_skill_gaps_provenance ON student_skill_gaps(user_id, provenance_type);

-- 3. Extend roadmap_revisions with adaptation category
ALTER TABLE roadmap_revisions
    ADD COLUMN IF NOT EXISTS adaptation_type VARCHAR(64) DEFAULT 'velocity_realigned'
        CHECK (adaptation_type IN ('velocity_realigned', 'milestone_adjusted', 'skill_reinforced', 'goal_updated', 'pace_accelerated'));

CREATE INDEX IF NOT EXISTS idx_revisions_adaptation ON roadmap_revisions(roadmap_id, adaptation_type);

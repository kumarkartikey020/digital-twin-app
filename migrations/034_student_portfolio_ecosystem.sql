-- Migration: 034_student_portfolio_ecosystem.sql
-- Digital Twin Verse: Student Portfolio & Verified Achievement Ecosystem
-- Connects Student Intelligence, Dynamic Roadmaps, and Capacity Connect B2B opportunities.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Student Portfolios
CREATE TABLE IF NOT EXISTS student_portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    headline VARCHAR(255) NOT NULL DEFAULT 'Learner & Innovator | Digital Twin Verse',
    bio TEXT,
    about_me TEXT,
    location VARCHAR(128),
    github_url VARCHAR(255),
    linkedin_url VARCHAR(255),
    website_url VARCHAR(255),
    featured_project_id UUID,
    portfolio_visibility VARCHAR(32) NOT NULL DEFAULT 'public' CHECK (portfolio_visibility IN ('public', 'organizations_only', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON student_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_visibility ON student_portfolios(portfolio_visibility);

-- 2. Student Projects Showcase
CREATE TABLE IF NOT EXISTS student_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    tagline VARCHAR(255),
    description TEXT NOT NULL,
    problem_statement TEXT,
    technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
    student_role VARCHAR(128) NOT NULL DEFAULT 'Solo Creator',
    outcomes_and_impact TEXT,
    project_category VARCHAR(64) NOT NULL DEFAULT 'software' 
        CHECK (project_category IN ('software', 'ai_ml', 'robotics', 'hardware', 'research', 'design', 'stem_experiment')),
    live_demo_url VARCHAR(500),
    github_repo_url VARCHAR(500),
    media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    verified_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_student ON student_projects(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_featured ON student_projects(student_id, is_featured);

-- 3. Student Certifications & External Credentials
CREATE TABLE IF NOT EXISTS student_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    issuing_organization VARCHAR(255) NOT NULL,
    issue_date DATE,
    credential_id VARCHAR(255),
    credential_url VARCHAR(500),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_certifications_student ON student_certifications(student_id);

-- 4. Enrich Achievements table with category, xp_bonus, and evidence metadata
ALTER TABLE achievements 
    ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'learning',
    ADD COLUMN IF NOT EXISTS xp_bonus INT DEFAULT 50,
    ADD COLUMN IF NOT EXISTS evidence_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_achievements_student_awarded ON achievements(student_id, awarded_at DESC);

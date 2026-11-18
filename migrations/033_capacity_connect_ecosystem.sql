-- Migration: 033_capacity_connect_ecosystem.sql
-- Digital Twin Verse: Capacity Connect B2B & Organisation Ecosystem
-- Extends organization multi-tenancy, verification, talent discovery, opportunities,
-- student applications, mentorship sessions, and minor privacy controls.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Alter Organizations table with B2B Capacity Connect fields
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS org_type VARCHAR(64) NOT NULL DEFAULT 'company' 
    CHECK (org_type IN ('school', 'college', 'university', 'company', 'training_institution')),
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'pending' 
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS industry_sector VARCHAR(128),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_verification ON organizations(verification_status);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(org_type);

-- 2. Opportunities & Challenges (B2B structured engagements)
CREATE TABLE IF NOT EXISTS capacity_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    opportunity_type VARCHAR(64) NOT NULL CHECK (opportunity_type IN (
      'project_challenge', 'skill_programme', 'internship', 'workshop', 'competition', 'learning_opportunity'
    )),
    description TEXT NOT NULL,
    eligibility_segments JSONB NOT NULL DEFAULT '["junior", "school", "career", "professional"]'::jsonb,
    required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    stipend_or_reward VARCHAR(255),
    location_type VARCHAR(32) NOT NULL DEFAULT 'remote' CHECK (location_type IN ('remote', 'hybrid', 'on_site')),
    location_details VARCHAR(255),
    application_deadline TIMESTAMPTZ,
    max_participants INT NOT NULL DEFAULT 50,
    status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_org_status ON capacity_opportunities(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_type_status ON capacity_opportunities(opportunity_type, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON capacity_opportunities(status, application_deadline);

-- 3. Student Applications System
CREATE TABLE IF NOT EXISTS capacity_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES capacity_opportunities(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'submitted' CHECK (status IN (
      'submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected', 'withdrawn'
    )),
    cover_note TEXT,
    portfolio_link VARCHAR(500),
    applicant_segment VARCHAR(32),
    reviewer_feedback TEXT,
    reviewed_by UUID REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_student ON capacity_applications(student_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_opp_status ON capacity_applications(opportunity_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_org ON capacity_applications(organization_id, status);

-- 4. Mentors within Organizations
CREATE TABLE IF NOT EXISTS capacity_mentors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    bio TEXT,
    expertise_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_mentees INT NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mentors_org_active ON capacity_mentors(organization_id, is_active);

-- 5. Mentorship Requests
CREATE TABLE IF NOT EXISTS capacity_mentorship_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id UUID NOT NULL REFERENCES capacity_mentors(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    topic VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN (
      'pending', 'accepted', 'declined', 'completed', 'cancelled'
    )),
    response_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentor_requests_mentor ON capacity_mentorship_requests(mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_mentor_requests_student ON capacity_mentorship_requests(student_id, status);
CREATE INDEX IF NOT EXISTS idx_mentor_requests_org ON capacity_mentorship_requests(organization_id, status);

-- 6. Mentorship Sessions
CREATE TABLE IF NOT EXISTS capacity_mentorship_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES capacity_mentorship_requests(id) ON DELETE SET NULL,
    mentor_id UUID NOT NULL REFERENCES capacity_mentors(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    meeting_link VARCHAR(500),
    agenda TEXT NOT NULL,
    notes TEXT,
    outcome_summary TEXT,
    student_feedback_rating INT CHECK (student_feedback_rating BETWEEN 1 AND 5),
    student_feedback_notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
      'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_mentor ON capacity_mentorship_sessions(mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON capacity_mentorship_sessions(student_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_org ON capacity_mentorship_sessions(organization_id, scheduled_at);

-- 7. Student Privacy & Parental Consents (Minor Protection)
CREATE TABLE IF NOT EXISTS capacity_student_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL, -- e.g. 'talent_discovery', 'contact_sharing'
    is_granted BOOLEAN NOT NULL DEFAULT false,
    parent_email VARCHAR(255),
    parent_verified BOOLEAN NOT NULL DEFAULT false,
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consents_student ON capacity_student_consents(student_id, consent_type);

-- 8. Capacity Connect Permissions
INSERT INTO permissions (permission_key, description) VALUES
  ('capacity.opportunities.manage', 'Create, update, and manage organisation opportunities and challenges'),
  ('capacity.applications.review', 'Review, shortlist, and decide on student applications'),
  ('capacity.mentorship.manage', 'Register mentors and manage mentorship sessions'),
  ('capacity.talent.discover', 'Search and explore student profiles with privacy masking'),
  ('capacity.analytics.view', 'View organisation analytics and participation reports')
ON CONFLICT (permission_key) DO NOTHING;

-- Map permissions to ORGANIZATION_ADMIN
INSERT INTO role_permissions (role, permission_id)
SELECT 'ORGANIZATION_ADMIN', id FROM permissions
WHERE permission_key IN (
  'capacity.opportunities.manage',
  'capacity.applications.review',
  'capacity.mentorship.manage',
  'capacity.talent.discover',
  'capacity.analytics.view'
)
ON CONFLICT DO NOTHING;

-- Map talent discovery & mentorship to TRAINER
INSERT INTO role_permissions (role, permission_id)
SELECT 'TRAINER', id FROM permissions
WHERE permission_key IN (
  'capacity.talent.discover',
  'capacity.mentorship.manage'
)
ON CONFLICT DO NOTHING;

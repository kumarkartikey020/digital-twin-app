-- Migration: 032_dynamic_learning_roadmaps.sql
-- Digital Twin Verse: Dynamic Learning Roadmap Engine (Milestone 2)
-- Enables 6-month personalized roadmaps, milestones, weekly tasks, skill gap analysis, and revision tracking.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Student Learning Roadmaps
CREATE TABLE IF NOT EXISTS student_learning_roadmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_segment VARCHAR(32) NOT NULL CHECK (student_segment IN ('junior', 'school', 'career', 'professional')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    primary_goal VARCHAR(255) NOT NULL,
    target_career_path VARCHAR(128) NOT NULL,
    academic_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_development_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_months INT NOT NULL DEFAULT 6,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'paused')),
    overall_progress NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    total_tasks INT NOT NULL DEFAULT 0,
    completed_tasks INT NOT NULL DEFAULT 0,
    ai_generated BOOLEAN NOT NULL DEFAULT false,
    ai_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmaps_user_status ON student_learning_roadmaps(user_id, status);
CREATE INDEX IF NOT EXISTS idx_roadmaps_segment ON student_learning_roadmaps(student_segment);

-- 2. Roadmap Milestones (Monthly objectives over 6 months)
CREATE TABLE IF NOT EXISTS roadmap_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID NOT NULL REFERENCES student_learning_roadmaps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month_number INT NOT NULL CHECK (month_number BETWEEN 1 AND 12),
    title VARCHAR(255) NOT NULL,
    objective TEXT NOT NULL,
    expected_outcomes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    total_tasks INT NOT NULL DEFAULT 0,
    completed_tasks INT NOT NULL DEFAULT 0,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_roadmap ON roadmap_milestones(roadmap_id, month_number);
CREATE INDEX IF NOT EXISTS idx_milestones_user ON roadmap_milestones(user_id);

-- 3. Roadmap Tasks (Weekly actionables, assignments, and projects)
CREATE TABLE IF NOT EXISTS roadmap_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID NOT NULL REFERENCES student_learning_roadmaps(id) ON DELETE CASCADE,
    milestone_id UUID NOT NULL REFERENCES roadmap_milestones(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 52),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    task_type VARCHAR(64) NOT NULL DEFAULT 'daily_activity' CHECK (task_type IN ('daily_activity', 'assignment', 'project', 'skill_builder')),
    skills_targeted JSONB NOT NULL DEFAULT '[]'::jsonb,
    completion_criteria TEXT NOT NULL,
    estimated_minutes INT NOT NULL DEFAULT 30,
    xp_reward INT NOT NULL DEFAULT 40,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    completed_at TIMESTAMPTZ,
    completion_notes TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_roadmap_status ON roadmap_tasks(roadmap_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON roadmap_tasks(milestone_id, week_number);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON roadmap_tasks(user_id);

-- 4. Student Skill Gaps (Empirical gap tracking between current and target proficiency)
CREATE TABLE IF NOT EXISTS student_skill_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roadmap_id UUID REFERENCES student_learning_roadmaps(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    current_proficiency VARCHAR(32) NOT NULL DEFAULT 'none' CHECK (current_proficiency IN ('none', 'beginner', 'intermediate', 'advanced')),
    target_proficiency VARCHAR(32) NOT NULL DEFAULT 'intermediate' CHECK (target_proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
    priority VARCHAR(32) NOT NULL DEFAULT 'high' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    identified_reason TEXT,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_gaps_user_status ON student_skill_gaps(user_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_roadmap ON student_skill_gaps(roadmap_id);

-- 5. Roadmap Revision History (Audit trail of adaptive changes)
CREATE TABLE IF NOT EXISTS roadmap_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID NOT NULL REFERENCES student_learning_roadmaps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revision_number INT NOT NULL DEFAULT 1,
    reason VARCHAR(255) NOT NULL,
    changes_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revisions_roadmap ON roadmap_revisions(roadmap_id, revision_number);

-- Migration: 031_student_intelligence_ecosystem.sql
-- Digital Twin Verse: Student Intelligence System & Multi-Segment Development Ecosystem
-- Supports 4 Segments: Junior (5-8), School (9-10), Career (11-12), Professional (College)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Student Intelligence Profiles
CREATE TABLE IF NOT EXISTS student_intelligence_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_segment VARCHAR(32) NOT NULL CHECK (student_segment IN ('junior', 'school', 'career', 'professional')),
    academic_class VARCHAR(32) NOT NULL, -- '5','6','7','8','9','10','11','12','college_1','college_2','college_3','college_4','postgraduate'
    stream_or_focus VARCHAR(128) NOT NULL DEFAULT 'General Exploratory', -- e.g. 'Foundational STEM', 'Science PCM', 'Science PCB', 'Commerce', 'Humanities', 'Computer Science'
    institution_name VARCHAR(255),
    learning_style VARCHAR(64) NOT NULL DEFAULT 'visual_interactive' CHECK (learning_style IN ('visual_interactive', 'practical_projects', 'structured_reading', 'guided_mentorship')),
    target_career_path VARCHAR(128) NOT NULL DEFAULT 'Technology & Innovation',
    weekly_goal_hours NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    xp_points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_intel_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_intel_user ON student_intelligence_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_intel_segment ON student_intelligence_profiles(student_segment);

-- 2. Student Profile Interests
CREATE TABLE IF NOT EXISTS student_profile_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_intelligence_profiles(id) ON DELETE CASCADE,
    interest_name VARCHAR(100) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_intel_interest UNIQUE (profile_id, interest_name)
);

CREATE INDEX IF NOT EXISTS idx_student_intel_interests_profile ON student_profile_interests(profile_id);

-- 3. Student Profile Skills
CREATE TABLE IF NOT EXISTS student_profile_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_intelligence_profiles(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    proficiency_level VARCHAR(32) NOT NULL DEFAULT 'beginner' CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced')),
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_intel_skill UNIQUE (profile_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_student_intel_skills_profile ON student_profile_skills(profile_id);

-- 4. Segment-Curated Learning Activities & Quests
CREATE TABLE IF NOT EXISTS student_segment_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment VARCHAR(32) NOT NULL CHECK (segment IN ('junior', 'school', 'career', 'professional')),
    activity_code VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL, -- 'exploration', 'aptitude', 'project', 'skill_builder', 'career_simulation'
    estimated_minutes INT NOT NULL DEFAULT 30,
    xp_reward INT NOT NULL DEFAULT 50,
    difficulty VARCHAR(32) NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    why_explanation_template TEXT NOT NULL,
    prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_activities_segment ON student_segment_activities(segment);
CREATE INDEX IF NOT EXISTS idx_student_activities_category ON student_segment_activities(category);

-- 5. Student Activity Completions (Verifiable logs, no fabricated statistics)
CREATE TABLE IF NOT EXISTS student_activity_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES student_segment_activities(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed')),
    notes TEXT,
    score NUMERIC(5,2),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_activity_completion UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_student_completions_user ON student_activity_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_student_completions_activity ON student_activity_completions(activity_id);

-- 6. Personalized Recommendations Store
CREATE TABLE IF NOT EXISTS student_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(32) NOT NULL CHECK (item_type IN ('activity', 'skill', 'career_path', 'learning_goal')),
    item_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    relevance_score INT NOT NULL DEFAULT 85 CHECK (relevance_score BETWEEN 0 AND 100),
    reason_text TEXT NOT NULL, -- Explanation of *why* this recommendation was made
    action_url VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_recs_user ON student_recommendations(user_id, status);

-- 7. Seed Initial Curated Activities for All 4 Segments
INSERT INTO student_segment_activities (segment, activity_code, title, description, category, estimated_minutes, xp_reward, difficulty, why_explanation_template)
VALUES
    -- DTV JUNIOR (Classes 5-8)
    ('junior', 'jun_scratch_story', 'Interactive Storytelling with Block Coding', 'Design a 3-scene animated story using Scratch block logic, loops, and character animations.', 'exploration', 30, 50, 'beginner', 'Recommended for DTV Junior learners to build foundational computational logic without syntax friction.'),
    ('junior', 'jun_solar_sim', 'Simulate Planetary Orbits with Physics Lab', 'Explore gravity, mass, and orbital periods using interactive digital science simulation.', 'exploration', 25, 45, 'beginner', 'Matches curiosity in space sciences and sharpens intuitive physics understanding for middle-school grades.'),
    ('junior', 'jun_eco_detective', 'The Young Environmental Detective Challenge', 'Audit everyday energy and water usage in your home or school and design a conservation blueprint.', 'project', 40, 60, 'beginner', 'Develops real-world problem observation, data collection, and practical environmental stewardship.'),
    ('junior', 'jun_logic_puzzles', 'Mathematical Pattern & Cryptography Quest', 'Solve cipher challenges, number sequences, and logic grid mysteries to unlock the secret code.', 'skill_builder', 20, 40, 'beginner', 'Strengthens deductive reasoning and mathematical agility for Classes 5-8.'),

    -- DTV SCHOOL (Classes 9-10)
    ('school', 'sch_stream_matrix', 'Class 10 Stream Discovery & Aptitude Audit', 'Evaluate your aptitude across Science PCM, Science PCB, Commerce, and Arts with empirical scoring.', 'aptitude', 35, 75, 'beginner', 'Critical Class 9-10 milestone to choose senior secondary streams based on proven aptitude rather than peer pressure.'),
    ('school', 'sch_python_basics', 'Python Algorithmic Foundations', 'Write foundational Python scripts to compute mathematical series, sort lists, and process text.', 'skill_builder', 45, 80, 'intermediate', 'Builds an early technical advantage before senior secondary board curriculum begins.'),
    ('school', 'sch_board_balance', 'Board Exam Balance & Time Strategy Blueprint', 'Construct a realistic daily study calendar that balances Class 10 board prep with personal passions.', 'project', 30, 50, 'beginner', 'Proven to lower academic stress and cultivate sustained time-management habits.'),
    ('school', 'sch_data_science_intro', 'Intro to Real-World Data Analysis', 'Import a real sports or climate dataset and compute averages, trends, and visual charts.', 'exploration', 40, 70, 'intermediate', 'Exposes high-schoolers to modern analytics careers and high-demand computational skills.'),

    -- DTV CAREER (Classes 11-12)
    ('career', 'car_entrance_diagnostic', 'Competitive Entrance Readiness Diagnostic (JEE/NEET/CUET)', 'Assess conceptual depth, accuracy under time pressure, and negative marking risk tolerance.', 'aptitude', 60, 100, 'advanced', 'Identifies high-leverage syllabus topics to maximize rank potential in competitive entrance exams.'),
    ('career', 'car_profile_portfolio', 'Target College Portfolio & Extracurricular Matrix', 'Map target institutions (IITs, NITs, Central Universities, Global Colleges) and align academic profile.', 'career_simulation', 45, 85, 'intermediate', 'Essential for Class 11-12 students seeking admissions to top-tier universities and scholarship programs.'),
    ('career', 'car_deep_work_sprint', 'Pomodoro & Deep Work Physics/Math Sprint', 'Execute a focused 90-minute numerical problem-solving session with step-by-step reasoning.', 'skill_builder', 90, 120, 'advanced', 'Builds stamina for multi-hour competitive entrance exam sessions.'),
    ('career', 'car_scholarship_radar', 'National & International Scholarship Radar Mapping', 'Scan eligible merit-cum-means, state, and private fellowships with deadline calendar tracking.', 'exploration', 30, 60, 'beginner', 'Reduces family financial burden by unlocking early scholarship and grant opportunities.'),

    -- DTV PROFESSIONAL (College Undergrad/Postgrad)
    ('professional', 'pro_fullstack_mvp', 'Production REST API Architecture & DB Pool Sprint', 'Architect an Express or FastAPI service with connection pooling, structured logging, and Docker containerization.', 'project', 90, 150, 'advanced', 'High-impact portfolio artifact proving industry-ready backend engineering capability to recruiters.'),
    ('professional', 'pro_ats_resume_audit', 'ATS Resume Keyword Optimization & Project Teardown', 'Calibrate resume against target software engineer / analyst job descriptions with quantifiable metric bullets.', 'career_simulation', 45, 90, 'intermediate', 'Increases recruiter interview callback rates by eliminating ATS screening filters.'),
    ('professional', 'pro_mock_system_design', 'Distributed Systems & Scalability Simulation', 'Design a scalable URL shortener with Redis caching, read replicas, and rate-limiting.', 'skill_builder', 60, 110, 'advanced', 'Standard technical interview requirement for campus placement SDE-1 / SWE rounds.'),
    ('professional', 'pro_open_source_pr', 'Open Source Contribution & Git Flow Mastery', 'Fork a public repository, resolve an issue with verified unit tests, and submit a pull request.', 'project', 75, 120, 'intermediate', 'Provides verifiable public evidence of collaborative software development ability.')
ON CONFLICT (activity_code) DO NOTHING;

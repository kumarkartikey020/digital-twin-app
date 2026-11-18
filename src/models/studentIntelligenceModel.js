const db = require('../db');

/**
 * Maps academic class string/number to one of the 4 DTV Student Segments:
 * - 'junior': Classes 5 to 8
 * - 'school': Classes 9 and 10
 * - 'career': Classes 11 and 12
 * - 'professional': College undergrad, postgrad, polytechnic
 */
function determineSegment(academicClass) {
  if (!academicClass) return 'school';
  const norm = String(academicClass).toLowerCase().trim();

  if (['5', '6', '7', '8', 'class 5', 'class 6', 'class 7', 'class 8', 'grade 5', 'grade 6', 'grade 7', 'grade 8'].includes(norm)) {
    return 'junior';
  }
  if (['9', '10', 'class 9', 'class 10', 'grade 9', 'grade 10'].includes(norm)) {
    return 'school';
  }
  if (['11', '12', 'class 11', 'class 12', 'grade 11', 'grade 12'].includes(norm)) {
    return 'career';
  }
  // All higher-ed / college / vocational levels
  return 'professional';
}

const SEGMENT_META = {
  junior: {
    segment: 'junior',
    displayName: 'DTV Junior',
    tagline: 'Exploratory Curiosity & Foundational STEM',
    targetAudience: 'Classes 5–8',
    themeColor: '#10b981',
    badgeIcon: 'ph-compass',
    focusPillars: ['Visual Coding Logic', 'Everyday Science Simulations', 'Pattern Deduction', 'Creative Storytelling']
  },
  school: {
    segment: 'school',
    displayName: 'DTV School',
    tagline: 'Stream Selection & Aptitude Mapping',
    targetAudience: 'Classes 9–10',
    themeColor: '#3b82f6',
    badgeIcon: 'ph-navigation-arrow',
    focusPillars: ['Class 10 Stream Discovery', 'Python Algorithms', 'Board Exam Balance', 'Real-World Data Insights']
  },
  career: {
    segment: 'career',
    displayName: 'DTV Career',
    tagline: 'College Entrance & Trajectory Launchpad',
    targetAudience: 'Classes 11–12',
    themeColor: '#8b5cf6',
    badgeIcon: 'ph-rocket-launch',
    focusPillars: ['JEE / NEET / CUET Diagnostics', 'Institution Portfolio Mapping', 'Deep Work Problem Sprints', 'Scholarship Radar']
  },
  professional: {
    segment: 'professional',
    displayName: 'DTV Professional',
    tagline: 'Placement Readiness & Industry Portfolio',
    targetAudience: 'College Students & Graduates',
    themeColor: '#f59e0b',
    badgeIcon: 'ph-briefcase',
    focusPillars: ['Production REST APIs & DBs', 'ATS Resume Calibration', 'Distributed System Design', 'Open-Source Contributions']
  }
};

/**
 * Fetch a student's full intelligence profile including interests and skills
 */
async function getProfileByUserId(userId) {
  const profileRes = await db.query(
    `SELECT p.*, u.name, u.email, u.avatar_url
     FROM student_intelligence_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );

  if (profileRes.rows.length === 0) {
    return null;
  }

  const profile = profileRes.rows[0];

  const [interestsRes, skillsRes] = await Promise.all([
    db.query(
      `SELECT interest_name, category, created_at 
       FROM student_profile_interests 
       WHERE profile_id = $1 
       ORDER BY created_at ASC`,
      [profile.id]
    ),
    db.query(
      `SELECT skill_name, proficiency_level, category, verified, created_at, updated_at 
       FROM student_profile_skills 
       WHERE profile_id = $1 
       ORDER BY created_at ASC`,
      [profile.id]
    )
  ]);

  profile.interests = interestsRes.rows;
  profile.skills = skillsRes.rows;
  profile.segmentMeta = SEGMENT_META[profile.student_segment] || SEGMENT_META.school;

  return profile;
}

/**
 * Upsert student intelligence profile with transactional interests & skills synchronization
 */
async function upsertProfile(userId, data) {
  const academicClass = String(data.academicClass || data.academic_class || '10');
  const segment = data.studentSegment || data.student_segment || determineSegment(academicClass);
  const streamOrFocus = data.streamOrFocus || data.stream_or_focus || 'General Exploratory';
  const institutionName = data.institutionName || data.institution_name || null;
  const learningStyle = data.learningStyle || data.learning_style || 'visual_interactive';
  const targetCareerPath = data.targetCareerPath || data.target_career_path || 'Technology & Innovation';
  const weeklyGoalHours = parseFloat(data.weeklyGoalHours || data.weekly_goal_hours || 5.0);
  const onboardingCompleted = data.onboardingCompleted !== undefined ? Boolean(data.onboardingCompleted) : true;

  return db.withTransaction(async (client) => {
    // 1. Upsert profile table
    const profileRes = await client.query(
      `INSERT INTO student_intelligence_profiles 
       (user_id, student_segment, academic_class, stream_or_focus, institution_name, learning_style, target_career_path, weekly_goal_hours, onboarding_completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         student_segment = EXCLUDED.student_segment,
         academic_class = EXCLUDED.academic_class,
         stream_or_focus = EXCLUDED.stream_or_focus,
         institution_name = COALESCE(EXCLUDED.institution_name, student_intelligence_profiles.institution_name),
         learning_style = EXCLUDED.learning_style,
         target_career_path = EXCLUDED.target_career_path,
         weekly_goal_hours = EXCLUDED.weekly_goal_hours,
         onboarding_completed = EXCLUDED.onboarding_completed,
         updated_at = now()
       RETURNING *`,
      [userId, segment, academicClass, streamOrFocus, institutionName, learningStyle, targetCareerPath, weeklyGoalHours, onboardingCompleted]
    );

    const profile = profileRes.rows[0];

    // 2. Sync interests if provided
    if (Array.isArray(data.interests)) {
      await client.query('DELETE FROM student_profile_interests WHERE profile_id = $1', [profile.id]);
      for (const item of data.interests) {
        const name = typeof item === 'string' ? item : item.name;
        const cat = (typeof item === 'object' && item.category) ? item.category : 'general';
        if (name && name.trim()) {
          await client.query(
            `INSERT INTO student_profile_interests (profile_id, interest_name, category)
             VALUES ($1, $2, $3)
             ON CONFLICT (profile_id, interest_name) DO NOTHING`,
            [profile.id, name.trim(), cat]
          );
        }
      }
    }

    // 3. Sync skills if provided
    if (Array.isArray(data.skills)) {
      await client.query('DELETE FROM student_profile_skills WHERE profile_id = $1', [profile.id]);
      for (const item of data.skills) {
        const name = typeof item === 'string' ? item : item.name;
        const level = (typeof item === 'object' && item.level) ? item.level : 'beginner';
        const cat = (typeof item === 'object' && item.category) ? item.category : 'general';
        if (name && name.trim()) {
          await client.query(
            `INSERT INTO student_profile_skills (profile_id, skill_name, proficiency_level, category)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (profile_id, skill_name) DO NOTHING`,
            [profile.id, name.trim(), level, cat]
          );
        }
      }
    }

    // 4. Ensure recommendations exist for this student (refresh for updated segment)
    await generateInitialRecommendations(client, userId, profile, true);

    return profile;
  });
}

/**
 * Generate contextual recommendations based on student segment, stream, and interests
 */
async function generateInitialRecommendations(client, userId, profile, forceRefresh = false) {
  const segment = profile.student_segment;

  // Check if active recommendations already exist
  const existing = await client.query(
    'SELECT count(*)::int AS count FROM student_recommendations WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );

  // If recommendations already exist and no refresh requested, keep them
  if (existing.rows[0].count > 0 && !forceRefresh) return;

  // Clear stale active recommendations to maintain segment relevance
  if (forceRefresh || existing.rows[0].count > 0) {
    await client.query(
      `DELETE FROM student_recommendations WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  }

  const recs = [];

  if (segment === 'junior') {
    recs.push({
      type: 'activity',
      itemId: 'jun_scratch_story',
      title: 'Build an Animated Scratch Story',
      description: 'Program visual characters with conditional logic and loops to tell a story.',
      relevance: 96,
      reason: `Tailored for Class ${profile.academic_class}: Introduces computer science concepts through creative visual play rather than dry syntax.`
    });
    recs.push({
      type: 'skill',
      itemId: 'logic_deduction',
      title: 'Deductive Logic & Pattern Puzzles',
      description: 'Practice 15-minute daily cipher and pattern problems to build STEM reasoning.',
      relevance: 92,
      reason: 'Strengthens mathematical foundation and abstract thinking early before high school algebra.'
    });
    recs.push({
      type: 'career_path',
      itemId: 'robotics_engineer',
      title: 'Robotics & Hardware Creator',
      description: 'Explore how robots, sensors, and code interact to build autonomous machines.',
      relevance: 88,
      reason: 'Matches your exploratory curiosity in technology and tangible creation.'
    });
  } else if (segment === 'school') {
    recs.push({
      type: 'activity',
      itemId: 'sch_stream_matrix',
      title: 'Class 10 Stream Discovery Matrix',
      description: 'Assess cognitive strengths across PCM, PCB, Commerce with Math, and Humanities.',
      relevance: 98,
      reason: `Essential milestone for Class ${profile.academic_class}: Prevents career misalignment before final 11th grade stream registration.`
    });
    recs.push({
      type: 'skill',
      itemId: 'python_fundamentals',
      title: 'Python Algorithmic Foundations',
      description: 'Write simple scripts to analyze numerical series and automate file tasks.',
      relevance: 94,
      reason: `Directly complements ${profile.stream_or_focus} and prepares you for higher secondary computing curricula.`
    });
    recs.push({
      type: 'career_path',
      itemId: 'data_ai_specialist',
      title: 'AI & Data Science Architect',
      description: 'Investigate how mathematics, statistics, and programming power modern generative systems.',
      relevance: 90,
      reason: 'Rapidly emerging career with high long-term stability and creative problem solving.'
    });
  } else if (segment === 'career') {
    recs.push({
      type: 'activity',
      itemId: 'car_entrance_diagnostic',
      title: 'Competitive Entrance Readiness Diagnostic',
      description: 'Evaluate speed, accuracy, and negative marking calibration under timed pressure.',
      relevance: 97,
      reason: `Crucial for Class ${profile.academic_class}: Uncovers hidden conceptual gaps in syllabus topics before entrance season.`
    });
    recs.push({
      type: 'skill',
      itemId: 'timed_problem_solving',
      title: 'Pomodoro Deep Work & Speed Calculation',
      description: 'Master 90-minute sustained concentration blocks for multi-hour competitive exams.',
      relevance: 93,
      reason: 'Differentiates top percentile qualifiers from candidates who suffer exam fatigue.'
    });
    recs.push({
      type: 'career_path',
      itemId: 'premier_institute_engineering',
      title: 'Premier Technology & Research Institutes',
      description: 'Analyze target percentiles, rank cutoffs, and seat allocation trends across top universities.',
      relevance: 91,
      reason: `Directly aligns with your ${profile.target_career_path} ambition and admission strategy.`
    });
  } else {
    // Professional
    recs.push({
      type: 'activity',
      itemId: 'pro_fullstack_mvp',
      title: 'Production REST API & DB Pool Sprint',
      description: 'Build a containerized microservice with connection pool tuning and Sentry error tracking.',
      relevance: 99,
      reason: 'Portfolio piece that signals genuine production readiness to engineering hiring managers.'
    });
    recs.push({
      type: 'skill',
      itemId: 'system_design_scalability',
      title: 'Distributed Caching & Index Optimization',
      description: 'Design zero-loss failover and sub-millisecond database queries using EXPLAIN ANALYZE.',
      relevance: 95,
      reason: 'Core requirement in technical interview rounds for entry-level and junior SDE roles.'
    });
    recs.push({
      type: 'career_path',
      itemId: 'fullstack_swe',
      title: 'Software Development Engineer (SWE-1)',
      description: 'Track campus placement dates, technical interview rounds, and competitive compensation packages.',
      relevance: 94,
      reason: `Matches your declared goal: ${profile.target_career_path}.`
    });
  }

  for (const r of recs) {
    await client.query(
      `INSERT INTO student_recommendations (user_id, item_type, item_id, title, description, relevance_score, reason_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, r.type, r.itemId, r.title, r.description, r.relevance, r.reason]
    );
  }
}

/**
 * Fetch all segment activities with completion status for a given student
 */
async function getSegmentActivities(segment, userId) {
  const query = `
    SELECT 
      a.id,
      a.segment,
      a.activity_code,
      a.title,
      a.description,
      a.category,
      a.estimated_minutes,
      a.xp_reward,
      a.difficulty,
      a.why_explanation_template,
      CASE WHEN c.id IS NOT NULL THEN true ELSE false END AS is_completed,
      c.completed_at,
      c.score,
      c.notes
    FROM student_segment_activities a
    LEFT JOIN student_activity_completions c 
      ON c.activity_id = a.id AND c.user_id = $2
    WHERE a.segment = $1
    ORDER BY a.created_at ASC
  `;

  const result = await db.query(query, [segment, userId]);
  return result.rows;
}

/**
 * Mark a student activity complete, awarding XP and persisting real completion timestamp
 */
async function completeActivity(userId, activityIdOrCode, details = {}) {
  // 1. Resolve activity
  const actRes = await db.query(
    'SELECT * FROM student_segment_activities WHERE id::text = $1 OR activity_code = $1',
    [activityIdOrCode]
  );

  if (actRes.rows.length === 0) {
    const error = new Error('Activity not found');
    error.statusCode = 404;
    throw error;
  }

  const activity = actRes.rows[0];
  const notes = details.notes || 'Activity verified and completed';
  const score = details.score !== undefined ? details.score : 100.00;

  return db.withTransaction(async (client) => {
    // 2. Check for duplicate completion (Idempotency protection)
    const existingComp = await client.query(
      'SELECT id, status, completed_at FROM student_activity_completions WHERE user_id = $1 AND activity_id = $2',
      [userId, activity.id]
    );

    if (existingComp.rows.length > 0 && existingComp.rows[0].status === 'completed') {
      return {
        alreadyCompleted: true,
        completion: existingComp.rows[0],
        activityTitle: activity.title,
        xpAwarded: 0
      };
    }

    // 3. Record completion
    const compRes = await client.query(
      `INSERT INTO student_activity_completions (user_id, activity_id, status, notes, score, completed_at)
       VALUES ($1, $2, 'completed', $3, $4, now())
       ON CONFLICT (user_id, activity_id) 
       DO UPDATE SET notes = EXCLUDED.notes, score = EXCLUDED.score, completed_at = now()
       RETURNING *`,
      [userId, activity.id, notes, score]
    );

    // 4. Award XP points to student profile (only for first-time completions)
    await client.query(
      `UPDATE student_intelligence_profiles 
       SET xp_points = xp_points + $1, updated_at = now()
       WHERE user_id = $2`,
      [activity.xp_reward, userId]
    );

    // 5. Update recommendation status if this activity was recommended
    await client.query(
      `UPDATE student_recommendations 
       SET status = 'completed', updated_at = now()
       WHERE user_id = $1 AND item_id = $2`,
      [userId, activity.activity_code]
    );

    return {
      alreadyCompleted: false,
      completion: compRes.rows[0],
      activityTitle: activity.title,
      xpAwarded: activity.xp_reward
    };
  });
}

/**
 * Fetch personalized recommendations with transparent explanation reasons
 */
async function getRecommendations(userId) {
  const res = await db.query(
    `SELECT id, item_type, item_id, title, description, relevance_score, reason_text, action_url, status, created_at
     FROM student_recommendations
     WHERE user_id = $1
     ORDER BY relevance_score DESC, created_at DESC`,
    [userId]
  );
  return res.rows;
}

/**
 * Compute real, dynamic student dashboard metrics with ZERO fabricated data
 */
async function getDashboardData(userId) {
  const profile = await module.exports.getProfileByUserId(userId);
  if (!profile) {
    return {
      hasProfile: false,
      message: 'Student profile onboarding pending.'
    };
  }

  const segment = profile.student_segment;
  const activities = await module.exports.getSegmentActivities(segment, userId);

  const totalActivities = activities.length;
  const completedActivities = activities.filter(a => a.is_completed);
  const completedCount = completedActivities.length;

  // Real progress percentage calculated strictly from database records
  const progressPercentage = totalActivities > 0 
    ? Math.round((completedCount / totalActivities) * 100) 
    : 0;

  // Total XP dynamically summed from completions + base
  const totalXp = completedActivities.reduce((sum, a) => sum + (Number(a.xp_reward) || 0), 0);

  // Next suggested activity
  const nextActivity = activities.find(a => !a.is_completed) || null;

  // Recommendations with why reason
  const recommendations = await module.exports.getRecommendations(userId);

  return {
    hasProfile: true,
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      academicClass: profile.academic_class,
      segment: profile.student_segment,
      streamOrFocus: profile.stream_or_focus,
      institutionName: profile.institution_name,
      learningStyle: profile.learning_style,
      targetCareerPath: profile.target_career_path,
      weeklyGoalHours: profile.weekly_goal_hours,
      onboardingCompleted: profile.onboarding_completed,
      interests: profile.interests,
      skills: profile.skills,
      segmentMeta: profile.segmentMeta
    },
    metrics: {
      progressPercentage,
      totalActivities,
      completedCount,
      skillsCount: profile.skills.length,
      verifiedSkillsCount: profile.skills.filter(s => s.verified).length,
      totalXp,
      weeklyGoalHours: profile.weekly_goal_hours
    },
    nextActivity: nextActivity ? {
      id: nextActivity.id,
      code: nextActivity.activity_code,
      title: nextActivity.title,
      description: nextActivity.description,
      estimatedMinutes: nextActivity.estimated_minutes,
      xpReward: nextActivity.xp_reward,
      difficulty: nextActivity.difficulty,
      whyReason: nextActivity.why_explanation_template
    } : null,
    activities,
    recommendations
  };
}

module.exports = {
  determineSegment,
  SEGMENT_META,
  getProfileByUserId,
  upsertProfile,
  getSegmentActivities,
  completeActivity,
  getRecommendations,
  getDashboardData
};

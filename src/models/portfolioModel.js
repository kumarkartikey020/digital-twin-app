const db = require('../db');
const ApiError = require('../utils/apiError');
const capacityModel = require('./capacityConnectModel');

/**
 * ACHIEVEMENTS CATALOG
 * Deterministic, genuine achievements derived strictly from verified database records.
 */
const ACHIEVEMENTS_CATALOG = [
  {
    criteria_met: 'first_quest_completed',
    badge_title: 'Genesis Quest',
    badge_icon: 'ph-sparkle',
    description: 'Completed your first verified learning activity in Digital Twin Verse.',
    category: 'learning',
    xp_bonus: 50
  },
  {
    criteria_met: 'five_quests_completed',
    badge_title: 'Sprint Explorer',
    badge_icon: 'ph-lightning',
    description: 'Mastered 5 verified learning activities across your curriculum.',
    category: 'learning',
    xp_bonus: 100
  },
  {
    criteria_met: 'roadmap_activated',
    badge_title: 'Pathfinder',
    badge_icon: 'ph-compass',
    description: 'Synthesized and activated a personalized 6-month learning roadmap.',
    category: 'roadmap',
    xp_bonus: 75
  },
  {
    criteria_met: 'roadmap_milestone_master',
    badge_title: 'Milestone Conqueror',
    badge_icon: 'ph-flag-banner',
    description: 'Achieved 100% completion on a monthly roadmap milestone.',
    category: 'roadmap',
    xp_bonus: 120
  },
  {
    criteria_met: 'roadmap_completed',
    badge_title: 'Twin Master',
    badge_icon: 'ph-trophy',
    description: 'Fully completed an entire 6-month dynamic learning roadmap.',
    category: 'roadmap',
    xp_bonus: 300
  },
  {
    criteria_met: 'first_project_published',
    badge_title: 'Creator Genesis',
    badge_icon: 'ph-code',
    description: 'Published your first verified project showcase in your portfolio.',
    category: 'project',
    xp_bonus: 100
  },
  {
    criteria_met: 'multi_tech_innovator',
    badge_title: 'Full-Stack Polymath',
    badge_icon: 'ph-stack',
    description: 'Built and showcased a project integrating 3 or more technologies.',
    category: 'project',
    xp_bonus: 150
  },
  {
    criteria_met: 'skill_demonstrated',
    badge_title: 'Skill Foundry',
    badge_icon: 'ph-wrench',
    description: 'Demonstrated verified proficiency in your core skill inventory.',
    category: 'skill',
    xp_bonus: 60
  },
  {
    criteria_met: 'skill_intermediate_advanced',
    badge_title: 'Technical Artisan',
    badge_icon: 'ph-certificate',
    description: 'Reached intermediate or advanced verified proficiency in a skill.',
    category: 'skill',
    xp_bonus: 120
  },
  {
    criteria_met: 'first_opportunity_applied',
    badge_title: 'Opportunity Seeker',
    badge_icon: 'ph-paper-plane-tilt',
    description: 'Applied to a real-world project challenge or programme in Capacity Connect.',
    category: 'engagement',
    xp_bonus: 80
  },
  {
    criteria_met: 'challenge_accepted',
    badge_title: 'Industry Endorsed',
    badge_icon: 'ph-seal-check',
    description: 'Selected and accepted by a verified organisation for a challenge or internship.',
    category: 'engagement',
    xp_bonus: 250
  },
  {
    criteria_met: 'mentorship_completed',
    badge_title: 'Mentee Graduate',
    badge_icon: 'ph-graduation-cap',
    description: 'Completed a 1-on-1 guidance session with an industry or academic mentor.',
    category: 'mentorship',
    xp_bonus: 150
  }
];

// 1. EVALUATE & AWARD GENUINE ACHIEVEMENTS
async function evaluateAndAwardAchievements(studentId) {
  // Query empirical DB facts
  const [
    questsResult,
    roadmapsResult,
    milestonesResult,
    projectsResult,
    skillsResult,
    appsResult,
    sessionsResult
  ] = await Promise.all([
    // 1. Quests completed
    db.query(`SELECT COUNT(*) as cnt FROM student_activity_completions WHERE user_id = $1 AND status = 'completed'`, [studentId]),
    // 2. Roadmaps active / completed
    db.query(`SELECT COUNT(*) as total_roadmaps, COUNT(*) FILTER (WHERE status = 'completed' OR overall_progress >= 100) as completed_roadmaps FROM student_learning_roadmaps WHERE user_id = $1`, [studentId]),
    // 3. Completed milestones
    db.query(`SELECT COUNT(*) as cnt FROM roadmap_milestones WHERE user_id = $1 AND (status = 'completed' OR progress_percentage >= 100)`, [studentId]),
    // 4. Projects & max tech count
    db.query(`SELECT COUNT(*) as total_projects, MAX(jsonb_array_length(CASE WHEN jsonb_typeof(technologies) = 'array' THEN technologies ELSE '[]'::jsonb END)) as max_techs FROM student_projects WHERE student_id = $1`, [studentId]),
    // 5. Skills
    db.query(`SELECT COUNT(*) as total_skills, COUNT(*) FILTER (WHERE proficiency_level IN ('intermediate', 'advanced')) as advanced_skills FROM student_profile_skills sps JOIN student_intelligence_profiles sip ON sps.profile_id = sip.id WHERE sip.user_id = $1`, [studentId]),
    // 6. Applications & Accepted challenges
    db.query(`SELECT COUNT(*) as total_apps, COUNT(*) FILTER (WHERE status = 'accepted') as accepted_apps FROM capacity_applications WHERE student_id = $1`, [studentId]),
    // 7. Completed mentorship sessions
    db.query(`SELECT COUNT(*) as cnt FROM capacity_mentorship_sessions WHERE student_id = $1 AND status = 'completed'`, [studentId])
  ]);

  const questCount = parseInt(questsResult.rows[0]?.cnt || '0', 10);
  const totalRoadmaps = parseInt(roadmapsResult.rows[0]?.total_roadmaps || '0', 10);
  const completedRoadmaps = parseInt(roadmapsResult.rows[0]?.completed_roadmaps || '0', 10);
  const completedMilestones = parseInt(milestonesResult.rows[0]?.cnt || '0', 10);
  const totalProjects = parseInt(projectsResult.rows[0]?.total_projects || '0', 10);
  const maxTechs = parseInt(projectsResult.rows[0]?.max_techs || '0', 10);
  const totalSkills = parseInt(skillsResult.rows[0]?.total_skills || '0', 10);
  const advancedSkills = parseInt(skillsResult.rows[0]?.advanced_skills || '0', 10);
  const totalApps = parseInt(appsResult.rows[0]?.total_apps || '0', 10);
  const acceptedApps = parseInt(appsResult.rows[0]?.accepted_apps || '0', 10);
  const completedSessions = parseInt(sessionsResult.rows[0]?.cnt || '0', 10);

  const eligibleCriteria = new Set();
  if (questCount >= 1) eligibleCriteria.add('first_quest_completed');
  if (questCount >= 5) eligibleCriteria.add('five_quests_completed');
  if (totalRoadmaps >= 1) eligibleCriteria.add('roadmap_activated');
  if (completedMilestones >= 1) eligibleCriteria.add('roadmap_milestone_master');
  if (completedRoadmaps >= 1) eligibleCriteria.add('roadmap_completed');
  if (totalProjects >= 1) eligibleCriteria.add('first_project_published');
  if (maxTechs >= 3) eligibleCriteria.add('multi_tech_innovator');
  if (totalSkills >= 1) eligibleCriteria.add('skill_demonstrated');
  if (advancedSkills >= 1) eligibleCriteria.add('skill_intermediate_advanced');
  if (totalApps >= 1) eligibleCriteria.add('first_opportunity_applied');
  if (acceptedApps >= 1) eligibleCriteria.add('challenge_accepted');
  if (completedSessions >= 1) eligibleCriteria.add('mentorship_completed');

  // Insert newly awarded achievements idempotently
  const awarded = [];
  for (const cat of ACHIEVEMENTS_CATALOG) {
    if (eligibleCriteria.has(cat.criteria_met)) {
      const insRes = await db.query(
        `INSERT INTO achievements (
          student_id, badge_title, badge_icon, description, criteria_met, category, xp_bonus, awarded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (student_id, criteria_met) WHERE deleted_at IS NULL
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [studentId, cat.badge_title, cat.badge_icon, cat.description, cat.criteria_met, cat.category, cat.xp_bonus]
      );
      if (insRes.rows.length > 0) {
        awarded.push(insRes.rows[0]);
      }
    }
  }

  // Fetch all achievements
  const allAchievements = await db.query(
    `SELECT * FROM achievements WHERE student_id = $1 AND deleted_at IS NULL ORDER BY awarded_at DESC`,
    [studentId]
  );

  return allAchievements.rows;
}

// 2. PORTFOLIO AGGREGATION & COMPLETION CALCULATION
async function getStudentPortfolio(studentId, { viewerUserId = null, isOrgViewer = false } = {}) {
  // 1. Fetch User
  const userRes = await db.query(`SELECT id, name, email, phone, avatar_url, role FROM users WHERE id = $1`, [studentId]);
  if (userRes.rows.length === 0) {
    throw new ApiError(404, 'Student user not found.');
  }
  const user = userRes.rows[0];

  // 2. Fetch or create student portfolio entry
  let portRes = await db.query(`SELECT * FROM student_portfolios WHERE user_id = $1`, [studentId]);
  if (portRes.rows.length === 0) {
    portRes = await db.query(
      `INSERT INTO student_portfolios (user_id, headline, portfolio_visibility)
       VALUES ($1, 'Learner & Innovator | Digital Twin Verse', 'public')
       RETURNING *`,
      [studentId]
    );
  }
  const portfolio = portRes.rows[0];

  // 3. Check Visibility Permissions
  const isOwner = viewerUserId && String(viewerUserId) === String(studentId);
  if (!isOwner) {
    if (portfolio.portfolio_visibility === 'private') {
      throw new ApiError(403, 'This student portfolio is set to private.');
    }
    if (portfolio.portfolio_visibility === 'organizations_only' && !isOrgViewer) {
      throw new ApiError(403, 'This portfolio is only accessible to verified partner organisations.');
    }
  }

  // 4. Fetch Student Intelligence Profile
  const profileRes = await db.query(
    `SELECT * FROM student_intelligence_profiles WHERE user_id = $1`,
    [studentId]
  );
  const profile = profileRes.rows[0] || null;

  // 5. Fetch Skills & Interests
  let skills = [];
  let interests = [];
  if (profile) {
    const skillsRes = await db.query(
      `SELECT skill_name, proficiency_level, category, verified FROM student_profile_skills WHERE profile_id = $1 ORDER BY verified DESC, skill_name ASC`,
      [profile.id]
    );
    skills = skillsRes.rows;

    const interestsRes = await db.query(
      `SELECT interest_name, category FROM student_profile_interests WHERE profile_id = $1 ORDER BY interest_name ASC`,
      [profile.id]
    );
    interests = interestsRes.rows;
  }

  // 6. Fetch Projects
  const projectsRes = await db.query(
    `SELECT sp.*, o.name as verified_by_org_name, o.logo_url as verified_by_org_logo
     FROM student_projects sp
     LEFT JOIN organizations o ON sp.verified_by_org_id = o.id
     WHERE sp.student_id = $1
     ORDER BY sp.is_featured DESC, sp.created_at DESC`,
    [studentId]
  );
  const projects = projectsRes.rows;

  // 7. Evaluate & Fetch Achievements
  const achievements = await evaluateAndAwardAchievements(studentId);

  // 8. Fetch Certifications
  const certsRes = await db.query(
    `SELECT sc.*, o.name as organization_name 
     FROM student_certifications sc
     LEFT JOIN organizations o ON sc.organization_id = o.id
     WHERE sc.student_id = $1
     ORDER BY sc.issue_date DESC NULLS LAST`,
    [studentId]
  );
  const certifications = certsRes.rows;

  // 9. Fetch Completed / Active Roadmaps
  const roadmapsRes = await db.query(
    `SELECT id, student_segment, title, description, primary_goal, target_career_path, duration_months, status, overall_progress, total_tasks, completed_tasks
     FROM student_learning_roadmaps
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [studentId]
  );
  const roadmaps = roadmapsRes.rows;

  // 10. Fetch Capacity Connect Accomplishments (Accepted Challenges & Competitions)
  const oppAccomplishmentsRes = await db.query(
    `SELECT ca.id, ca.status, ca.applicant_segment, ca.submitted_at, ca.updated_at,
            co.title as opportunity_title, co.opportunity_type, co.stipend_or_reward,
            o.name as organization_name, o.org_type, o.logo_url as organization_logo
     FROM capacity_applications ca
     JOIN capacity_opportunities co ON ca.opportunity_id = co.id
     JOIN organizations o ON ca.organization_id = o.id
     WHERE ca.student_id = $1 AND ca.status IN ('accepted', 'shortlisted')
     ORDER BY ca.updated_at DESC`,
    [studentId]
  );
  const accomplishments = oppAccomplishmentsRes.rows;

  // 11. Calculate Portfolio Completion Score
  let completionPoints = 0;
  if (portfolio.headline && portfolio.headline.length > 5) completionPoints += 10;
  if (portfolio.bio && portfolio.bio.length > 20) completionPoints += 10;
  if (skills.length >= 3) completionPoints += 20;
  else if (skills.length > 0) completionPoints += 10;
  if (projects.length >= 1) completionPoints += 25;
  if (achievements.length >= 1) completionPoints += 15;
  if (roadmaps.length >= 1) completionPoints += 10;
  if (portfolio.github_url || portfolio.linkedin_url || portfolio.website_url) completionPoints += 10;
  const portfolioCompletionPercentage = Math.min(100, completionPoints);

  // 12. Minor Privacy Protection Check
  // Check student consent for contact sharing
  const consentRes = await db.query(
    `SELECT is_granted FROM capacity_student_consents WHERE student_id = $1 AND consent_type = 'contact_sharing'`,
    [studentId]
  );
  const hasConsent = !!consentRes.rows[0]?.is_granted;

  // If viewer is NOT the owner (e.g. organization viewer or public viewer)
  let privacy = {
    isMinor: ['junior', 'school'].includes(profile?.student_segment || ''),
    privacyProtected: false,
    displayName: user.name || 'Anonymous Student',
    email: user.email,
    phone: user.phone || null
  };

  if (!isOwner) {
    privacy = capacityModel.maskMinorData(user, profile, hasConsent);
  }

  return {
    studentId: user.id,
    portfolioId: portfolio.id,
    user: {
      id: user.id,
      name: privacy.fullName,
      email: privacy.email,
      phone: privacy.phone,
      avatarUrl: user.avatar_url,
      role: user.role
    },
    privacy: {
      isMinor: privacy.isMinor,
      privacyProtected: privacy.privacyProtected,
      hasContactConsent: hasConsent
    },
    meta: {
      headline: portfolio.headline,
      bio: portfolio.bio,
      aboutMe: portfolio.about_me,
      location: portfolio.location,
      githubUrl: portfolio.github_url,
      linkedinUrl: portfolio.linkedin_url,
      websiteUrl: portfolio.website_url,
      portfolioVisibility: portfolio.portfolio_visibility,
      featuredProjectId: portfolio.featured_project_id,
      completionScore: portfolioCompletionPercentage
    },
    academicProfile: profile ? {
      studentSegment: profile.student_segment,
      academicClass: profile.academic_class,
      streamOrFocus: profile.stream_or_focus,
      institutionName: profile.institution_name,
      targetCareerPath: profile.target_career_path,
      learningStyle: profile.learning_style,
      xpPoints: profile.xp_points
    } : null,
    skills,
    interests,
    projects,
    achievements,
    certifications,
    roadmaps,
    organisationAccomplishments: accomplishments
  };
}

// 3. PORTFOLIO META MANAGEMENT
async function updatePortfolioMeta(studentId, {
  headline,
  bio,
  aboutMe,
  location,
  githubUrl,
  linkedinUrl,
  websiteUrl,
  featuredProjectId,
  portfolioVisibility
}) {
  const updates = [];
  const values = [];
  let paramIdx = 1;

  if (headline !== undefined) {
    updates.push(`headline = $${paramIdx++}`);
    values.push(headline.trim());
  }
  if (bio !== undefined) {
    updates.push(`bio = $${paramIdx++}`);
    values.push(bio ? bio.trim() : null);
  }
  if (aboutMe !== undefined) {
    updates.push(`about_me = $${paramIdx++}`);
    values.push(aboutMe ? aboutMe.trim() : null);
  }
  if (location !== undefined) {
    updates.push(`location = $${paramIdx++}`);
    values.push(location ? location.trim() : null);
  }
  if (githubUrl !== undefined) {
    updates.push(`github_url = $${paramIdx++}`);
    values.push(githubUrl ? githubUrl.trim() : null);
  }
  if (linkedinUrl !== undefined) {
    updates.push(`linkedin_url = $${paramIdx++}`);
    values.push(linkedinUrl ? linkedinUrl.trim() : null);
  }
  if (websiteUrl !== undefined) {
    updates.push(`website_url = $${paramIdx++}`);
    values.push(websiteUrl ? websiteUrl.trim() : null);
  }
  if (featuredProjectId !== undefined) {
    updates.push(`featured_project_id = $${paramIdx++}`);
    values.push(featuredProjectId || null);
  }
  if (portfolioVisibility !== undefined) {
    updates.push(`portfolio_visibility = $${paramIdx++}`);
    values.push(portfolioVisibility);
  }

  if (updates.length === 0) {
    return getStudentPortfolio(studentId, { viewerUserId: studentId });
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(studentId);

  const query = `
    INSERT INTO student_portfolios (user_id, headline)
    VALUES ($${paramIdx}, 'Learner & Innovator | Digital Twin Verse')
    ON CONFLICT (user_id) 
    DO UPDATE SET ${updates.join(', ')}
    RETURNING *
  `;

  const result = await db.query(query, values);
  return result.rows[0];
}

// 4. PROJECT SHOWCASE CRUD
async function createProject(studentId, {
  title,
  tagline = null,
  description,
  problemStatement = null,
  technologies = [],
  studentRole = 'Solo Creator',
  outcomesAndImpact = null,
  projectCategory = 'software',
  liveDemoUrl = null,
  githubRepoUrl = null,
  mediaUrls = [],
  isFeatured = false
}) {
  const result = await db.query(
    `INSERT INTO student_projects (
      student_id, title, tagline, description, problem_statement,
      technologies, student_role, outcomes_and_impact, project_category,
      live_demo_url, github_repo_url, media_urls, is_featured
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      studentId,
      title.trim(),
      tagline ? tagline.trim() : null,
      description.trim(),
      problemStatement ? problemStatement.trim() : null,
      JSON.stringify(technologies),
      studentRole.trim(),
      outcomesAndImpact ? outcomesAndImpact.trim() : null,
      projectCategory,
      liveDemoUrl ? liveDemoUrl.trim() : null,
      githubRepoUrl ? githubRepoUrl.trim() : null,
      JSON.stringify(mediaUrls),
      !!isFeatured
    ]
  );

  const project = result.rows[0];

  // If set to featured, update portfolio or unset other featured projects
  if (isFeatured) {
    await db.query(`UPDATE student_projects SET is_featured = false WHERE student_id = $1 AND id != $2`, [studentId, project.id]);
    await db.query(`UPDATE student_portfolios SET featured_project_id = $1 WHERE user_id = $2`, [project.id, studentId]);
  }

  // Promote project technologies to PROJECT_VERIFIED skills in student intelligence profile
  try {
    const profileRes = await db.query('SELECT id FROM student_intelligence_profiles WHERE user_id = $1', [studentId]);
    if (profileRes.rows.length > 0) {
      const profileId = profileRes.rows[0].id;
      const techList = Array.isArray(technologies) ? technologies : [];
      for (const tech of techList) {
        const cleanTech = String(tech).trim();
        if (!cleanTech) continue;
        await db.query(
          `INSERT INTO student_profile_skills (profile_id, skill_name, proficiency_level, category, verified, provenance_type, evidence_reference)
           VALUES ($1, $2, 'intermediate', 'technical', true, 'PROJECT_VERIFIED', $3)
           ON CONFLICT (profile_id, skill_name) 
           DO UPDATE SET 
             provenance_type = CASE WHEN student_profile_skills.provenance_type = 'ASSESSMENT_VERIFIED' THEN 'ASSESSMENT_VERIFIED' ELSE 'PROJECT_VERIFIED' END,
             verified = true,
             evidence_reference = $3,
             updated_at = now()`,
          [profileId, cleanTech, JSON.stringify({ project_id: project.id, title: project.title })]
        );
      }
    }
  } catch (err) {
    // Non-blocking skill promotion
  }

  // Trigger achievement evaluation
  await evaluateAndAwardAchievements(studentId);

  return project;
}

async function updateProject(projectId, studentId, updateData) {
  const {
    title,
    tagline,
    description,
    problemStatement,
    technologies,
    studentRole,
    outcomesAndImpact,
    projectCategory,
    liveDemoUrl,
    githubRepoUrl,
    mediaUrls,
    isFeatured
  } = updateData;

  const updates = [];
  const values = [];
  let paramIdx = 1;

  if (title !== undefined) {
    updates.push(`title = $${paramIdx++}`);
    values.push(title.trim());
  }
  if (tagline !== undefined) {
    updates.push(`tagline = $${paramIdx++}`);
    values.push(tagline ? tagline.trim() : null);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(description.trim());
  }
  if (problemStatement !== undefined) {
    updates.push(`problem_statement = $${paramIdx++}`);
    values.push(problemStatement ? problemStatement.trim() : null);
  }
  if (technologies !== undefined) {
    updates.push(`technologies = $${paramIdx++}`);
    values.push(JSON.stringify(technologies));
  }
  if (studentRole !== undefined) {
    updates.push(`student_role = $${paramIdx++}`);
    values.push(studentRole.trim());
  }
  if (outcomesAndImpact !== undefined) {
    updates.push(`outcomes_and_impact = $${paramIdx++}`);
    values.push(outcomesAndImpact ? outcomesAndImpact.trim() : null);
  }
  if (projectCategory !== undefined) {
    updates.push(`project_category = $${paramIdx++}`);
    values.push(projectCategory);
  }
  if (liveDemoUrl !== undefined) {
    updates.push(`live_demo_url = $${paramIdx++}`);
    values.push(liveDemoUrl ? liveDemoUrl.trim() : null);
  }
  if (githubRepoUrl !== undefined) {
    updates.push(`github_repo_url = $${paramIdx++}`);
    values.push(githubRepoUrl ? githubRepoUrl.trim() : null);
  }
  if (mediaUrls !== undefined) {
    updates.push(`media_urls = $${paramIdx++}`);
    values.push(JSON.stringify(mediaUrls));
  }
  if (isFeatured !== undefined) {
    updates.push(`is_featured = $${paramIdx++}`);
    values.push(!!isFeatured);
  }

  if (updates.length === 0) {
    return getProjectById(projectId);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(projectId);
  const pIdx = paramIdx++;
  values.push(studentId);
  const sIdx = paramIdx++;

  const query = `
    UPDATE student_projects 
    SET ${updates.join(', ')} 
    WHERE id = $${pIdx} AND student_id = $${sIdx}
    RETURNING *
  `;

  const result = await db.query(query, values);
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Project not found or access denied.');
  }

  const updatedProject = result.rows[0];

  if (isFeatured) {
    await db.query(`UPDATE student_projects SET is_featured = false WHERE student_id = $1 AND id != $2`, [studentId, projectId]);
    await db.query(`UPDATE student_portfolios SET featured_project_id = $1 WHERE user_id = $2`, [projectId, studentId]);
  }

  // Trigger achievement evaluation
  await evaluateAndAwardAchievements(studentId);

  return updatedProject;
}

async function deleteProject(projectId, studentId) {
  const result = await db.query(
    `DELETE FROM student_projects WHERE id = $1 AND student_id = $2 RETURNING id`,
    [projectId, studentId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Project not found or access denied.');
  }
  // Clear featured project reference if matched
  await db.query(`UPDATE student_portfolios SET featured_project_id = NULL WHERE user_id = $1 AND featured_project_id = $2`, [studentId, projectId]);
  return { id: projectId, deleted: true };
}

async function getProjectById(projectId) {
  const result = await db.query(
    `SELECT sp.*, u.name as student_name, u.avatar_url, o.name as verified_by_org_name, o.logo_url as verified_by_org_logo
     FROM student_projects sp
     JOIN users u ON sp.student_id = u.id
     LEFT JOIN organizations o ON sp.verified_by_org_id = o.id
     WHERE sp.id = $1`,
    [projectId]
  );
  return result.rows[0] || null;
}

async function verifyProjectByOrg(projectId, organizationId) {
  const result = await db.query(
    `UPDATE student_projects
     SET verified_by_org_id = $1,
         verified_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [organizationId, projectId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Project not found.');
  }
  const project = result.rows[0];

  // Promote verified project technologies to ASSESSMENT_VERIFIED
  try {
    const profileRes = await db.query('SELECT id FROM student_intelligence_profiles WHERE user_id = $1', [project.student_id]);
    if (profileRes.rows.length > 0) {
      const profileId = profileRes.rows[0].id;
      const techList = Array.isArray(project.technologies) ? project.technologies : [];
      for (const tech of techList) {
        const cleanTech = String(tech).trim();
        if (!cleanTech) continue;
        await db.query(
          `UPDATE student_profile_skills 
           SET provenance_type = 'ASSESSMENT_VERIFIED',
               verified = true,
               evidence_reference = jsonb_set(COALESCE(evidence_reference, '{}'::jsonb), '{org_verified_by}', $1::jsonb),
               updated_at = now()
           WHERE profile_id = $2 AND LOWER(skill_name) = LOWER($3)`,
          [JSON.stringify(organizationId), profileId, cleanTech]
        );
      }
    }
  } catch (e) {
    // Non-blocking promotion notice
  }

  return project;
}

// 5. CERTIFICATIONS CRUD
async function addCertification(studentId, {
  title,
  issuingOrganization,
  issueDate = null,
  credentialId = null,
  credentialUrl = null,
  organizationId = null
}) {
  const result = await db.query(
    `INSERT INTO student_certifications (
      student_id, title, issuing_organization, issue_date, credential_id, credential_url, organization_id, verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      studentId,
      title.trim(),
      issuingOrganization.trim(),
      issueDate ? new Date(issueDate) : null,
      credentialId ? credentialId.trim() : null,
      credentialUrl ? credentialUrl.trim() : null,
      organizationId,
      !!organizationId // Verified automatically if issued directly by an organisation
    ]
  );
  return result.rows[0];
}

async function deleteCertification(certId, studentId) {
  const result = await db.query(
    `DELETE FROM student_certifications WHERE id = $1 AND student_id = $2 RETURNING id`,
    [certId, studentId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Certification not found or access denied.');
  }
  return { id: certId, deleted: true };
}

module.exports = {
  ACHIEVEMENTS_CATALOG,
  evaluateAndAwardAchievements,
  getStudentPortfolio,
  updatePortfolioMeta,
  createProject,
  updateProject,
  deleteProject,
  getProjectById,
  verifyProjectByOrg,
  addCertification,
  deleteCertification
};

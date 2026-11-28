const db = require('../db');
const ApiError = require('../utils/apiError');
const studentIntelligenceModel = require('../models/studentIntelligenceModel');
const learningRoadmapModel = require('../models/learningRoadmapModel');
const portfolioModel = require('../models/portfolioModel');
const capacityConnectModel = require('../models/capacityConnectModel');

/**
 * Digital Twin Verse (DTV) — Unified Student Intelligence & Adaptive Growth Service (P2)
 * 
 * Interconnects:
 * LEARN (Activities/Quests) 
 * → DISCOVER (Interests/Aptitude) 
 * → BUILD SKILLS (Provenance-tracked Skill Inventory)
 * → COMPLETE PROJECTS (Portfolio Showcases) 
 * → DEMONSTRATE ABILITY (Verified Achievements & Endorsements)
 * → FIND OPPORTUNITIES (Capacity Connect Matching) 
 * → TRACK GROWTH (Developmental Velocity & Momentum)
 */

// Skill Provenance Constants
const PROVENANCE = {
  SELF_DECLARED: 'SELF_DECLARED',
  ACTIVITY_BASED: 'ACTIVITY_BASED',
  PROJECT_VERIFIED: 'PROJECT_VERIFIED',
  ASSESSMENT_VERIFIED: 'ASSESSMENT_VERIFIED'
};

/**
 * 1. HOLISTIC STUDENT PROFILE
 * Aggregates complete developmental profile from actual database records.
 */
async function getHolisticStudentProfile(userId) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) {
    return {
      hasProfile: false,
      message: 'Student intelligence profile not yet initialized.'
    };
  }

  const [
    completionsRes,
    roadmapRes,
    projectsRes,
    achievementsRes,
    certificationsRes
  ] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS count, 
              COALESCE(sum(a.xp_reward), 0)::int AS total_activity_xp
       FROM student_activity_completions c
       JOIN student_segment_activities a ON a.id = c.activity_id
       WHERE c.user_id = $1 AND c.status = 'completed'`,
      [userId]
    ),
    db.query(
      `SELECT id, title, primary_goal, target_career_path, duration_months, 
              overall_progress, total_tasks, completed_tasks, status
       FROM student_learning_roadmaps 
       WHERE user_id = $1 AND status = 'active' 
       ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    ),
    db.query(
      `SELECT id, title, project_category, technologies, is_featured, verified_by_org_id, created_at
       FROM student_projects 
       WHERE student_id = $1 
       ORDER BY is_featured DESC, created_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT id, badge_title AS title, description, badge_icon, category, xp_bonus, awarded_at
       FROM achievements 
       WHERE student_id = $1 
       ORDER BY awarded_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT id, title, issuing_organization, verified 
       FROM student_certifications 
       WHERE student_id = $1`,
      [userId]
    )
  ]);

  const activityStats = completionsRes.rows[0] || { count: 0, total_activity_xp: 0 };
  const activeRoadmap = roadmapRes.rows[0] || null;
  const projects = projectsRes.rows || [];
  const achievements = achievementsRes.rows || [];
  const certifications = certificationsRes.rows || [];

  // Categorize skills by provenance
  const skills = profile.skills || [];
  const provenanceBreakdown = {
    [PROVENANCE.SELF_DECLARED]: 0,
    [PROVENANCE.ACTIVITY_BASED]: 0,
    [PROVENANCE.PROJECT_VERIFIED]: 0,
    [PROVENANCE.ASSESSMENT_VERIFIED]: 0
  };

  skills.forEach(s => {
    const prov = s.provenance_type || (s.verified ? PROVENANCE.ASSESSMENT_VERIFIED : PROVENANCE.SELF_DECLARED);
    provenanceBreakdown[prov] = (provenanceBreakdown[prov] || 0) + 1;
  });

  // Calculate empirical strengths (verified or intermediate/advanced)
  const strengths = skills
    .filter(s => s.proficiency_level === 'intermediate' || s.proficiency_level === 'advanced' || s.verified)
    .map(s => ({
      skill_name: s.skill_name,
      level: s.proficiency_level,
      provenance: s.provenance_type || PROVENANCE.SELF_DECLARED
    }));

  // Identify areas needing improvement from open skill gaps or catalog prerequisites
  const segmentCatalog = learningRoadmapModel.SEGMENT_CATALOGS[profile.student_segment] || learningRoadmapModel.SEGMENT_CATALOGS.school;
  const existingSkillNames = new Set(skills.map(s => s.skill_name.toLowerCase()));
  const areasNeedingImprovement = segmentCatalog.targetSkills
    .filter(s => !existingSkillNames.has(s.toLowerCase()))
    .slice(0, 4)
    .map(name => ({
      skill_name: name,
      reason: `Essential foundational skill for ${segmentCatalog.displayName} trajectory.`
    }));

  // True XP summation
  const totalXp = activityStats.total_activity_xp + 
    achievements.reduce((sum, a) => sum + (parseInt(a.xp_bonus, 10) || 0), 0) + 
    (activeRoadmap ? activeRoadmap.completed_tasks * 40 : 0);

  return {
    hasProfile: true,
    user: {
      id: profile.user_id,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatar_url
    },
    segment: profile.student_segment,
    academicClass: profile.academic_class,
    streamOrFocus: profile.stream_or_focus,
    targetCareerPath: profile.target_career_path,
    learningStyle: profile.learning_style,
    weeklyGoalHours: profile.weekly_goal_hours,
    segmentMeta: profile.segmentMeta,
    interests: profile.interests || [],
    skills: skills,
    provenanceBreakdown,
    strengths,
    areasNeedingImprovement,
    growthStats: {
      totalXp,
      activitiesCompleted: activityStats.count,
      projectsPublished: projects.length,
      achievementsAwarded: achievements.length,
      certificationsEarned: certifications.length,
      roadmapProgress: activeRoadmap ? parseFloat(activeRoadmap.overall_progress) : 0
    },
    activeRoadmap,
    recentProjects: projects.slice(0, 3),
    recentAchievements: achievements.slice(0, 4)
  };
}

/**
 * 2. SKILL GAP & PROVENANCE EVALUATION ENGINE
 * Cross-references demonstrated skills, project technologies, and certifications.
 */
async function evaluateSkillGaps(userId, options = {}) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) {
    throw new ApiError(404, 'Student profile not found. Complete onboarding first.');
  }

  const segment = profile.student_segment;
  const catalog = learningRoadmapModel.SEGMENT_CATALOGS[segment] || learningRoadmapModel.SEGMENT_CATALOGS.school;

  // 1. Gather all student evidence
  const [
    skillsRes,
    completedActsRes,
    projectsRes,
    certsRes
  ] = await Promise.all([
    db.query(
      `SELECT id, skill_name, proficiency_level, category, verified, 
              COALESCE(provenance_type, 'SELF_DECLARED') AS provenance_type, 
              evidence_reference
       FROM student_profile_skills WHERE profile_id = $1`,
      [profile.id]
    ),
    db.query(
      `SELECT a.activity_code, a.category, a.title, c.score, c.completed_at
       FROM student_activity_completions c
       JOIN student_segment_activities a ON a.id = c.activity_id
       WHERE c.user_id = $1 AND c.status = 'completed'`,
      [userId]
    ),
    db.query(
      `SELECT id, title, technologies, verified_by_org_id, created_at 
       FROM student_projects WHERE student_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT id, title, issuing_organization, verified 
       FROM student_certifications WHERE student_id = $1`,
      [userId]
    )
  ]);

  const existingSkills = skillsRes.rows;
  const completions = completedActsRes.rows;
  const projects = projectsRes.rows;
  const certs = certsRes.rows;

  // Build empirical technology set from projects
  const projectTechSet = new Set();
  projects.forEach(p => {
    const techs = Array.isArray(p.technologies) ? p.technologies : [];
    techs.forEach(t => projectTechSet.add(String(t).toLowerCase().trim()));
  });

  // Evaluate skills with true provenance promotion
  const enrichedSkills = [];
  for (const s of existingSkills) {
    const norm = s.skill_name.toLowerCase().trim();
    let currentProv = s.provenance_type || PROVENANCE.SELF_DECLARED;
    let evidence = s.evidence_reference || {};

    // Check certification endorsement -> ASSESSMENT_VERIFIED
    const matchingCert = certs.find(c => c.title.toLowerCase().includes(norm));
    if (matchingCert && matchingCert.verified) {
      currentProv = PROVENANCE.ASSESSMENT_VERIFIED;
      evidence = { type: 'certification', cert_id: matchingCert.id, org: matchingCert.issuing_organization };
    } 
    // Check project showcase -> PROJECT_VERIFIED
    else if (projectTechSet.has(norm)) {
      const p = projects.find(proj => (Array.isArray(proj.technologies) ? proj.technologies : []).some(t => String(t).toLowerCase().trim() === norm));
      currentProv = PROVENANCE.PROJECT_VERIFIED;
      evidence = { type: 'project', project_id: p?.id, project_title: p?.title };
    }
    // Check activity completion -> ACTIVITY_BASED
    else if (completions.some(c => c.title.toLowerCase().includes(norm) || c.category.toLowerCase().includes(norm))) {
      const c = completions.find(comp => comp.title.toLowerCase().includes(norm) || comp.category.toLowerCase().includes(norm));
      currentProv = PROVENANCE.ACTIVITY_BASED;
      evidence = { type: 'activity', activity_code: c?.activity_code, completed_at: c?.completed_at };
    }

    // Update provenance in database if promoted
    if (currentProv !== s.provenance_type) {
      await db.query(
        `UPDATE student_profile_skills 
         SET provenance_type = $1, evidence_reference = $2, updated_at = now() 
         WHERE id = $3`,
        [currentProv, JSON.stringify(evidence), s.id]
      ).catch(() => {});
    }

    enrichedSkills.push({
      id: s.id,
      skill_name: s.skill_name,
      proficiency_level: s.proficiency_level,
      provenance_type: currentProv,
      evidence_reference: evidence
    });
  }

  // Calculate gaps against catalog target skills
  const studentSkillMap = new Map();
  enrichedSkills.forEach(s => studentSkillMap.set(s.skill_name.toLowerCase().trim(), s));

  const gaps = [];
  for (const targetSkill of catalog.targetSkills) {
    const norm = targetSkill.toLowerCase().trim();
    const existing = studentSkillMap.get(norm);

    let currentProf = existing ? existing.proficiency_level : 'none';
    let prov = existing ? existing.provenance_type : PROVENANCE.SELF_DECLARED;
    let targetProf = 'intermediate';
    let priority = 'high';
    let status = 'open';

    if (existing) {
      if (existing.proficiency_level === 'advanced' || existing.provenance_type === PROVENANCE.PROJECT_VERIFIED || existing.provenance_type === PROVENANCE.ASSESSMENT_VERIFIED) {
        priority = 'low';
        status = 'closed';
      } else if (existing.proficiency_level === 'intermediate') {
        priority = 'medium';
        status = 'in_progress';
      }
    } else {
      priority = 'critical';
      status = 'open';
    }

    let reason = '';
    if (status === 'closed') {
      reason = `Demonstrated and verified through ${prov.replace('_', ' ').toLowerCase()}.`;
    } else if (status === 'in_progress') {
      reason = `Introductory competency established. Advance to ${targetProf} through practical application.`;
    } else {
      reason = `Core capability required for ${catalog.displayName} objectives; currently missing.`;
    }

    // Recommended actionable activity
    const recommendedActivity = {
      title: `Build Hands-On Skill: ${targetSkill}`,
      type: segment === 'junior' ? 'visual_quest' : 'coding_challenge',
      estimatedMinutes: 35
    };

    gaps.push({
      skill_name: targetSkill,
      current_proficiency: currentProf,
      target_proficiency: targetProf,
      provenance_type: prov,
      priority,
      status,
      identified_reason: reason,
      recommendedActivity
    });
  }

  return {
    studentSegment: segment,
    targetCareerPath: profile.target_career_path,
    demonstratedSkills: enrichedSkills,
    skillGaps: gaps,
    summary: {
      totalTargetSkills: catalog.targetSkills.length,
      closedGaps: gaps.filter(g => g.status === 'closed').length,
      inProgressGaps: gaps.filter(g => g.status === 'in_progress').length,
      openGaps: gaps.filter(g => g.status === 'open').length
    }
  };
}

/**
 * 3. EXPLAINABLE ADAPTIVE ROADMAP ENGINE
 * Adapts existing active roadmap based on student progress, milestones cleared,
 * or missed tasks, recording explainable audit history without destroying roadmap state.
 */
async function adaptRoadmap(userId, options = {}) {
  const activeRoadmap = await learningRoadmapModel.getActiveRoadmap(userId);
  if (!activeRoadmap) {
    throw new ApiError(404, 'No active roadmap found to adapt. Generate a roadmap first.');
  }

  const roadmapId = activeRoadmap.id;
  const tasks = activeRoadmap.tasks || (activeRoadmap.milestones || []).flatMap(m => m.tasks || []);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const progressRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;

  // Evaluate student's recent pace and skill development
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const adaptationType = options.adaptationType || (progressRatio >= 0.5 ? 'pace_accelerated' : 'velocity_realigned');
  
  let reason = '';
  let changesSummary = '';

  if (adaptationType === 'pace_accelerated') {
    reason = `Student demonstrated exceptional learning pace (${completedTasks}/${totalTasks} tasks finished).`;
    changesSummary = 'Elevated challenge tier for remaining weekly assignments and added capstone portfolio extensions.';
    
    // Elevate xp rewards and update criteria on remaining pending tasks
    await db.query(
      `UPDATE roadmap_tasks 
       SET xp_reward = xp_reward + 15,
           estimated_minutes = GREATEST(20, estimated_minutes - 5)
       WHERE roadmap_id = $1 AND status = 'pending'`,
      [roadmapId]
    );
  } else {
    reason = options.reason || 'Realigned milestones to balance active academic pace with conceptual reinforcement.';
    changesSummary = 'Adjusted time estimates, reinforced prerequisite skill checkpoints, and prioritized highest-impact open skill gaps.';
    
    // Smooth out task estimates for better balance
    await db.query(
      `UPDATE roadmap_tasks 
       SET estimated_minutes = LEAST(45, estimated_minutes + 5)
       WHERE roadmap_id = $1 AND status = 'pending'`,
      [roadmapId]
    );
  }

  // Record audit revision
  const countRes = await db.query(
    'SELECT count(*)::int AS count FROM roadmap_revisions WHERE roadmap_id = $1',
    [roadmapId]
  );
  const nextRev = (countRes.rows[0]?.count || 0) + 1;

  await db.query(
    `INSERT INTO roadmap_revisions 
     (roadmap_id, user_id, revision_number, reason, changes_summary, adaptation_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [roadmapId, userId, nextRev, reason, changesSummary, adaptationType]
  );

  // Re-fetch updated roadmap
  const updatedRoadmap = await learningRoadmapModel.getActiveRoadmap(userId);

  return {
    success: true,
    message: 'Roadmap successfully adapted.',
    adaptation: {
      revisionNumber: nextRev,
      adaptationType,
      reason,
      changesSummary,
      progressPercentage: updatedRoadmap.overall_progress,
      completedTasks: updatedRoadmap.completed_tasks,
      totalTasks: updatedRoadmap.total_tasks
    },
    roadmap: updatedRoadmap
  };
}

/**
 * 4. NEXT BEST ACTION ENGINE
 * Computes single highest-impact next developmental action across 6 dimensions.
 */
async function computeNextBestAction(userId) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) {
    return {
      actionCode: 'ONBOARDING_REQUIRED',
      what: 'Complete Your 2-Minute Student Profile',
      why: 'Calibrates the Digital Twin Verse intelligence engine to your exact class, stream, and ambitions.',
      goalOrSkillSupported: 'Personalized Trajectory Alignment',
      estimatedEffortMinutes: 2,
      expectedOutcome: 'Unlocks tailored learning roadmaps, age-appropriate quests, and verified portfolio tracking.',
      actionCta: {
        label: 'Complete Profile',
        url: '/student-dashboard.html#onboarding',
        buttonClass: 'btn btn-primary',
        icon: 'ph-sparkle'
      }
    };
  }

  // 1. Check for zero declared interests
  if (!profile.interests || profile.interests.length === 0) {
    return {
      actionCode: 'INTERESTS_DISCOVERY',
      what: 'Select Your Core STEM & Career Interests',
      why: 'Enables our recommendation engine to filter projects and challenges matching what you enjoy most.',
      goalOrSkillSupported: 'Interest Discovery & Alignment',
      estimatedEffortMinutes: 3,
      expectedOutcome: 'Activates high-affinity recommendations and tailored developmental quests.',
      actionCta: {
        label: 'Select Interests',
        url: '/student-dashboard.html#interests',
        buttonClass: 'btn btn-primary',
        icon: 'ph-compass'
      }
    };
  }

  // 2. Check completed learning activities
  const completionsRes = await db.query(
    'SELECT count(*)::int AS count FROM student_activity_completions WHERE user_id = $1 AND status = $2',
    [userId, 'completed']
  );
  const completedActivities = completionsRes.rows[0]?.count || 0;

  if (completedActivities === 0) {
    const actRes = await db.query(
      'SELECT activity_code, title, estimated_minutes, xp_reward FROM student_segment_activities WHERE segment = $1 ORDER BY xp_reward ASC LIMIT 1',
      [profile.student_segment]
    );
    const act = actRes.rows[0] || { activity_code: 'genesis_quest', title: 'Foundational Discovery Quest', estimated_minutes: 25, xp_reward: 50 };

    return {
      actionCode: 'LAUNCH_FIRST_QUEST',
      what: `Launch First Quest: ${act.title}`,
      why: `Age-tailored foundational challenge designed specifically for Class ${profile.academic_class}.`,
      goalOrSkillSupported: 'Foundational STEM Aptitude',
      estimatedEffortMinutes: act.estimated_minutes,
      expectedOutcome: `Earn +${act.xp_reward} XP and establish your baseline verified skill profile.`,
      actionCta: {
        label: 'Start Quest',
        url: `/student-dashboard.html#quest-${act.activity_code}`,
        buttonClass: 'btn btn-primary',
        icon: 'ph-play-circle'
      }
    };
  }

  // 3. Check active roadmap task
  const roadmap = await learningRoadmapModel.getActiveRoadmap(userId);
  if (roadmap && roadmap.tasks && roadmap.tasks.length > 0) {
    const nextTask = roadmap.tasks.find(t => t.status === 'pending');
    if (nextTask) {
      const skillsTargeted = Array.isArray(nextTask.skills_targeted) ? nextTask.skills_targeted.join(', ') : 'Roadmap Competencies';
      return {
        actionCode: 'RESUME_ROADMAP_TASK',
        what: nextTask.title,
        why: `Direct milestone actionable for Week ${nextTask.week_number} under your 6-Month Roadmap for ${roadmap.primary_goal}.`,
        goalOrSkillSupported: skillsTargeted,
        estimatedEffortMinutes: nextTask.estimated_minutes || 30,
        expectedOutcome: `Advance roadmap to ${Math.min(100, Math.round(roadmap.overall_progress + 4))}% and earn +${nextTask.xp_reward || 40} XP.`,
        actionCta: {
          label: 'Continue Task',
          url: '/student-dashboard.html#roadmap',
          buttonClass: 'btn btn-primary',
          icon: 'ph-arrow-right'
        }
      };
    }
  }

  // 4. Check for completed activities with 0 published projects
  const projRes = await db.query('SELECT count(*)::int AS count FROM student_projects WHERE student_id = $1', [userId]);
  const projectCount = projRes.rows[0]?.count || 0;

  if (projectCount === 0 && completedActivities >= 2) {
    return {
      actionCode: 'PUBLISH_PROJECT_SHOWCASE',
      what: 'Document Your First Project Showcase',
      why: 'Demonstrates empirical problem-solving ability to mentors and schools rather than relying solely on self-declared skills.',
      goalOrSkillSupported: 'Verified Ability & Project Portfolio',
      estimatedEffortMinutes: 20,
      expectedOutcome: 'Promotes your skills from SELF-DECLARED to PROJECT-VERIFIED in your intelligence twin.',
      actionCta: {
        label: 'Create Project',
        url: '/student-portfolio.html#add-project',
        buttonClass: 'btn btn-primary',
        icon: 'ph-code'
      }
    };
  }

  // 5. Check for Capacity Connect opportunity match
  const matchedOpp = await getMatchedOpportunities(userId);
  if (matchedOpp && matchedOpp.length > 0 && matchedOpp[0].matchScore >= 75) {
    const opp = matchedOpp[0];
    return {
      actionCode: 'APPLY_MATCHED_OPPORTUNITY',
      what: `Participate in ${opp.title}`,
      why: `High-affinity match (${opp.matchScore}% affinity score) based on your demonstrated skills and interests.`,
      goalOrSkillSupported: opp.requiredSkills.join(', ') || 'Real-World Practical Challenge',
      estimatedEffortMinutes: 45,
      expectedOutcome: 'Real-world project challenge completion, verified organization endorsement, and industry portfolio credit.',
      actionCta: {
        label: 'Explore Opportunity',
        url: '/capacity-connect.html',
        buttonClass: 'btn btn-primary',
        icon: 'ph-briefcase'
      }
    };
  }

  // 6. Default: Explore next milestone recommendation
  return {
    actionCode: 'EXPLORE_ELECTIVE_QUEST',
    what: 'Expand Your Skill Matrix with Elective Quests',
    why: 'All immediate active milestones are up to date. Continuous practice accelerates trajectory mastery.',
    goalOrSkillSupported: profile.target_career_path,
    estimatedEffortMinutes: 30,
    expectedOutcome: 'Earn additional XP, strengthen creative problem solving, and unlock advanced projects.',
    actionCta: {
      label: 'Explore Quests',
      url: '/student-dashboard.html#quests',
      buttonClass: 'btn btn-primary',
      icon: 'ph-compass'
    }
  };
}

/**
 * 5. PROGRESSIVE PROJECT RECOMMENDATION ENGINE
 * Recommends projects according to segment, skills, interests, and difficulty tiers.
 */
async function getProjectRecommendations(userId) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) return [];

  const segment = profile.student_segment;
  const targetCareer = profile.target_career_path || 'Technology & Innovation';
  const interests = (profile.interests || []).map(i => i.interest_name.toLowerCase());
  const skills = (profile.skills || []).map(s => s.skill_name.toLowerCase());

  // Existing published projects
  const existingRes = await db.query(
    'SELECT title FROM student_projects WHERE student_id = $1',
    [userId]
  );
  const existingTitles = new Set(existingRes.rows.map(r => r.title.toLowerCase().trim()));

  // Progressive Project Catalog
  const PROJECT_CATALOG = {
    junior: [
      {
        id: 'proj_jun_scratch_maze',
        title: 'Interactive Multi-Level Maze Adventure',
        tagline: 'Visual Block Logic & Game Design',
        description: 'Build a keyboard-controlled maze game in Scratch featuring sprite animation, collision detection, and score tracking.',
        difficulty: 'beginner',
        estimatedHours: 4,
        technologies: ['Scratch Block Logic', 'Computational Thinking'],
        skillsTargeted: ['Algorithmic Loops', 'Pattern Deduction'],
        whyRecommended: 'Perfect starting project for Classes 5-8: Teaches program loops and conditional logic with instant visual gratification.'
      },
      {
        id: 'proj_jun_solar_sim',
        title: 'Planetary Orbit & Gravity Simulator',
        tagline: 'Everyday Science & Astronomical Observation',
        description: 'Construct a visual solar system simulation modeling relative planet speeds and gravitational orbital patterns.',
        difficulty: 'intermediate',
        estimatedHours: 6,
        technologies: ['Visual Simulation', 'Scientific Observation'],
        skillsTargeted: ['Spatial Geometry', 'Scientific Method'],
        whyRecommended: 'Connects middle school science with interactive digital modeling and hypothesis testing.'
      },
      {
        id: 'proj_jun_eco_detective',
        title: 'Household Energy & Eco Audit Journal',
        tagline: 'Environmental Detective Investigation',
        description: 'Log and analyze 14 days of household power and water usage data, identifying conservation bottlenecks with charts.',
        difficulty: 'intermediate',
        estimatedHours: 5,
        technologies: ['Data Logging', 'Tabular Charts'],
        skillsTargeted: ['Data Interpretation', 'Creative Problem Solving'],
        whyRecommended: 'Applies STEM data principles directly to the student’s daily home environment.'
      }
    ],
    school: [
      {
        id: 'proj_sch_stream_calculator',
        title: 'Empirical Stream Aptitude Calculator',
        tagline: 'Class 10 Decision Matrix in Python',
        description: 'Write a Python command-line utility that computes subject strength scores across Science, Commerce, and Humanities with weighted scoring.',
        difficulty: 'beginner',
        estimatedHours: 6,
        technologies: ['Python', 'Algorithmic Logic'],
        skillsTargeted: ['Python Algorithmic Foundations', 'Algebraic Problem Solving'],
        whyRecommended: 'Directly helps Class 9-10 students make objective, empirical stream decisions while practicing Python script foundations.'
      },
      {
        id: 'proj_sch_data_visualizer',
        title: 'Real-World Climate Data Visualizer',
        tagline: 'Tabular Analytics & Interactive Charts',
        description: 'Analyze real-world rainfall and temperature historical data using Python scripts, rendering multi-line trend plots.',
        difficulty: 'intermediate',
        estimatedHours: 8,
        technologies: ['Python', 'Data Analysis', 'Charting'],
        skillsTargeted: ['Data Interpretation & Charting', 'Statistical Averages'],
        whyRecommended: 'Prepares high schoolers for data science and senior secondary mathematics through tangible analytics.'
      },
      {
        id: 'proj_sch_study_planner_app',
        title: 'Active-Recall Board Exam Sprint Planner',
        tagline: 'Pomodoro Productivity & Time Mastery',
        description: 'Construct an interactive study session planner with spaced repetition reminders and revision milestone tracking.',
        difficulty: 'intermediate',
        estimatedHours: 10,
        technologies: ['HTML', 'CSS', 'JavaScript'],
        skillsTargeted: ['Structured Time Management', 'Web Fundamentals'],
        whyRecommended: 'Directly reinforces productive study habits for board exams while publishing a practical web tool in portfolio.'
      }
    ],
    career: [
      {
        id: 'proj_car_entrance_diagnostic_tool',
        title: 'Competitive Entrance Timed Mock Engine',
        tagline: 'JEE / NEET / CUET Question Sprint Simulator',
        description: 'Develop an interactive timed mock assessment tool with negative marking logic, topic-level error logs, and performance heatmaps.',
        difficulty: 'intermediate',
        estimatedHours: 12,
        technologies: ['JavaScript', 'REST API', 'Data Structures'],
        skillsTargeted: ['Quantitative Logic', 'System Architecture'],
        whyRecommended: 'Provides invaluable mock test discipline for Class 11-12 entrance aspirants while showcasing production engineering skills.'
      },
      {
        id: 'proj_car_admission_portfolio',
        title: 'Personalized Academic & Innovation Showcase',
        tagline: 'Verified University Admissions Portfolio',
        description: 'Design and deploy a responsive portfolio highlighting verified research projects, Olympiad achievements, and code repositories.',
        difficulty: 'intermediate',
        estimatedHours: 10,
        technologies: ['Responsive CSS', 'Web Design', 'Git'],
        skillsTargeted: ['Portfolio Curation', 'Technical Communication'],
        whyRecommended: 'Crucial for university application profiles, international admissions, and scholarship radars.'
      },
      {
        id: 'proj_car_fullstack_tracker',
        title: 'Deep-Work Focus & Goal Velocity Platform',
        tagline: 'Full-Stack Habit & Milestone Engine',
        description: 'Create a full-stack task manager with REST endpoints, persistent database storage, and analytical progress charts.',
        difficulty: 'advanced',
        estimatedHours: 16,
        technologies: ['Node.js', 'Express', 'PostgreSQL'],
        skillsTargeted: ['REST APIs', 'Relational Databases', 'Deep Work Execution'],
        whyRecommended: 'Advanced capstone demonstrating engineering readiness for university computer science and competitive technology programs.'
      }
    ],
    professional: [
      {
        id: 'proj_pro_rest_microservice',
        title: 'Scalable E-Commerce REST API with PostgreSQL',
        tagline: 'Production Backend Architecture',
        description: 'Architect a containerized RESTful API with JWT authentication, RBAC authorization, pagination, indexing, and transactional integrity.',
        difficulty: 'intermediate',
        estimatedHours: 18,
        technologies: ['Node.js', 'Express', 'PostgreSQL', 'Docker'],
        skillsTargeted: ['Production REST APIs & DBs', 'Database Transactions'],
        whyRecommended: 'Indispensable core showcase for college engineering students targeting backend and full-stack software placements.'
      },
      {
        id: 'proj_pro_ml_classifier',
        title: 'End-to-End Predictive ML Service & Dashboard',
        tagline: 'Machine Learning Model Deployment',
        description: 'Train a tabular classification model, serialize model weights, and serve inferences through a high-performance REST endpoint.',
        difficulty: 'advanced',
        estimatedHours: 22,
        technologies: ['Python', 'FastAPI', 'Scikit-Learn', 'Pandas'],
        skillsTargeted: ['Machine Learning Engineering', 'Model Inference'],
        whyRecommended: 'Demonstrates real-world AI/ML development beyond toy Jupyter notebooks to hiring engineering managers.'
      },
      {
        id: 'proj_pro_distributed_cache',
        title: 'High-Concurrency Redis Rate-Limiter & Cache',
        tagline: 'Distributed Systems & Resilience',
        description: 'Build a distributed sliding-window rate limiting middleware backed by Redis with atomic Lua scripting and fault tolerance.',
        difficulty: 'advanced',
        estimatedHours: 24,
        technologies: ['Redis', 'Node.js', 'Distributed Systems'],
        skillsTargeted: ['Distributed System Design', 'High-Concurrency Systems'],
        whyRecommended: 'Advanced senior capstone project showcasing systems engineering depth for competitive technical interviews.'
      }
    ]
  };

  const segmentProjects = PROJECT_CATALOG[segment] || PROJECT_CATALOG.school;

  // Filter out already published projects
  const availableProjects = segmentProjects.filter(p => !existingTitles.has(p.title.toLowerCase().trim()));

  return availableProjects;
}

/**
 * 6. STUDENT GROWTH INTELLIGENCE & MOMENTUM
 * Tracks empirical developmental progression avoiding vanity XP inflation.
 */
async function computeGrowthIntelligence(userId) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) {
    throw new ApiError(404, 'Profile not found');
  }

  const [
    skillsRes,
    projectsRes,
    achievementsRes,
    completionsRes,
    roadmapRes
  ] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS total,
              count(CASE WHEN provenance_type != 'SELF_DECLARED' OR verified = true THEN 1 END)::int AS verified_count
       FROM student_profile_skills WHERE profile_id = $1`,
      [profile.id]
    ),
    db.query(
      `SELECT count(*)::int AS count,
              count(CASE WHEN verified_by_org_id IS NOT NULL THEN 1 END)::int AS org_verified
       FROM student_projects WHERE student_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT count(*)::int AS count,
              COALESCE(sum(xp_bonus), 0)::int AS total_xp
       FROM achievements WHERE student_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT count(*)::int AS count,
              COALESCE(sum(a.xp_reward), 0)::int AS total_xp
       FROM student_activity_completions c
       JOIN student_segment_activities a ON a.id = c.activity_id
       WHERE c.user_id = $1 AND c.status = 'completed'`,
      [userId]
    ),
    db.query(
      `SELECT overall_progress, total_tasks, completed_tasks, status 
       FROM student_learning_roadmaps 
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    )
  ]);

  const skillsData = skillsRes.rows[0] || { total: 0, verified_count: 0 };
  const projectsData = projectsRes.rows[0] || { count: 0, org_verified: 0 };
  const achievementsData = achievementsRes.rows[0] || { count: 0, total_xp: 0 };
  const completionsData = completionsRes.rows[0] || { count: 0, total_xp: 0 };
  const activeRoadmap = roadmapRes.rows[0] || null;

  // Real developmental momentum index (0 - 100)
  // Balanced across learning, building, demonstrating, and planning
  const learningScore = Math.min(25, completionsData.count * 5);
  const buildingScore = Math.min(30, projectsData.count * 15);
  const roadmapScore = activeRoadmap ? Math.round(parseFloat(activeRoadmap.overall_progress) * 0.25) : 0;
  const verificationScore = Math.min(20, (skillsData.verified_count * 5) + (projectsData.org_verified * 10));
  
  const developmentalVelocity = Math.min(100, learningScore + buildingScore + roadmapScore + verificationScore);

  // Chronological genuine growth timeline events
  const timelineRes = await db.query(
    `(SELECT 'activity' as event_type, a.title, c.completed_at as timestamp, 
             a.xp_reward as xp, 'Completed verified learning quest' as description
      FROM student_activity_completions c
      JOIN student_segment_activities a ON a.id = c.activity_id
      WHERE c.user_id = $1 AND c.status = 'completed')
     UNION ALL
     (SELECT 'project' as event_type, title, created_at as timestamp, 
             100 as xp, 'Published verified project showcase' as description
      FROM student_projects
      WHERE student_id = $1)
     UNION ALL
     (SELECT 'achievement' as event_type, badge_title AS title, awarded_at as timestamp, 
             xp_bonus as xp, description
      FROM achievements
      WHERE student_id = $1)
     ORDER BY timestamp DESC LIMIT 8`,
    [userId]
  );

  return {
    studentSegment: profile.student_segment,
    academicClass: profile.academic_class,
    developmentalVelocity,
    metrics: {
      totalSkillsTracked: skillsData.total,
      verifiedSkills: skillsData.verified_count,
      projectsPublished: projectsData.count,
      organizationEndorsedProjects: projectsData.org_verified,
      learningQuestsCompleted: completionsData.count,
      roadmapProgress: activeRoadmap ? parseFloat(activeRoadmap.overall_progress) : 0,
      achievementsAwarded: achievementsData.count
    },
    growthTimeline: timelineRes.rows || []
  };
}

/**
 * 7. OPPORTUNITY MATCHING & AFFINITY SCORING ENGINE
 * Evaluates verified skills, interests, and project experience against Capacity Connect opportunities.
 * Enforces strict Minor Protection: Junior learners are restricted to youth academic & coding challenges.
 */
async function getMatchedOpportunities(userId) {
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) return [];

  const segment = profile.student_segment;
  const isMinor = ['junior', 'school'].includes(segment);

  // Student skill set (with provenance)
  const skills = profile.skills || [];
  const skillNames = new Set(skills.map(s => s.skill_name.toLowerCase().trim()));
  const verifiedSkills = new Set(skills.filter(s => s.provenance_type !== PROVENANCE.SELF_DECLARED || s.verified).map(s => s.skill_name.toLowerCase().trim()));

  // Student interest set
  const interests = (profile.interests || []).map(i => ((typeof i === 'string' ? i : i.interest_name) || '').toLowerCase().trim()).filter(Boolean);

  // Fetch published opportunities
  let query = `
    SELECT o.id, o.title, o.description, o.opportunity_type, 
           o.eligibility_segments, o.required_skills, 
           o.stipend_or_reward, o.location_type, o.created_at,
           org.name AS organization_name, org.logo_url AS organization_logo, (org.verification_status = 'verified') AS org_verified
    FROM capacity_opportunities o
    JOIN organizations org ON org.id = o.organization_id
    WHERE o.status = 'published'
  `;
  const params = [];

  // Minor Safeguards: Strictly segment-filtered & no corporate internships for minors
  if (isMinor) {
    query += ` AND o.opportunity_type != 'internship'`;
    query += ` AND (o.eligibility_segments @> $1::jsonb OR o.eligibility_segments IS NULL)`;
    params.push(JSON.stringify([segment]));
  }

  query += ` ORDER BY o.created_at DESC LIMIT 20`;

  const oppRes = await db.query(query, params);
  const opportunities = oppRes.rows || [];

  const matched = [];

  for (const opp of opportunities) {
    const reqSkills = Array.isArray(opp.required_skills) ? opp.required_skills : [];
    
    // 1. Skill Match Calculation (50% weight)
    let skillScore = 0;
    if (reqSkills.length > 0) {
      let matchedCount = 0;
      reqSkills.forEach(req => {
        const norm = String(req).toLowerCase().trim();
        if (verifiedSkills.has(norm)) {
          matchedCount += 1.0; // Full weight for verified skills
        } else if (skillNames.has(norm)) {
          matchedCount += 0.5; // Partial weight for self-declared
        }
      });
      skillScore = Math.min(50, Math.round((matchedCount / reqSkills.length) * 50));
    } else {
      skillScore = 40; // Open eligibility
    }

    // 2. Interest / Department Match Calculation (25% weight)
    let interestScore = 0;
    const deptNorm = (opp.department || '').toLowerCase().trim();
    if (interests.some(i => i.includes(deptNorm) || deptNorm.includes(i))) {
      interestScore = 25;
    } else {
      interestScore = 15;
    }

    // 3. Segment & Eligibility Match (25% weight)
    let eligibilityScore = 25;
    if (opp.student_segment && opp.student_segment !== segment) {
      eligibilityScore = 10;
    }

    const totalMatchScore = Math.min(100, skillScore + interestScore + eligibilityScore);

    // Minor Protection Filtering:
    // If user is Junior, suppress any opportunity marked as corporate internship or jobs
    if (segment === 'junior' && ['internship', 'job', 'b2b_project'].includes(opp.opportunity_type)) {
      continue;
    }

    matched.push({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      opportunityType: opp.opportunity_type,
      department: opp.department,
      organizationName: opp.organization_name,
      organizationLogo: opp.organization_logo,
      isOrgVerified: opp.org_verified,
      stipendOrReward: opp.stipend_or_reward || 'Certificate of Excellence',
      locationType: opp.location_type || 'remote',
      requiredSkills: reqSkills,
      matchScore: totalMatchScore,
      matchRationale: totalMatchScore >= 80 
        ? 'Exceptional match based on your demonstrated skill set and interest trajectory.'
        : 'Good opportunity to apply your skills and gain practical project experience.'
    });
  }

  // Sort descending by match score
  return matched.sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  PROVENANCE,
  getHolisticStudentProfile,
  evaluateSkillGaps,
  adaptRoadmap,
  computeNextBestAction,
  getProjectRecommendations,
  computeGrowthIntelligence,
  getMatchedOpportunities
};

const db = require('../db');
const studentIntelligenceModel = require('./studentIntelligenceModel');

/**
 * Segment-specific catalogs of Age-Appropriate Goals, Career Paths, Academic Objectives, and Skills.
 * Strictly prevents junior and middle-school students from being pushed into corporate / placement jargon.
 */
const SEGMENT_CATALOGS = {
  junior: {
    segment: 'junior',
    displayName: 'DTV Junior (Classes 5–8)',
    tagline: 'Exploratory STEM, Curiosity & Computational Logic',
    careerCuriosities: [
      'Visual Robotics & Automation',
      'Space Sciences & Astronomy',
      'Wildlife & Environmental Detective',
      'Game Design & Creative Animation',
      'Mathematical Ciphers & Detective Logic'
    ],
    learningGoals: [
      'Build Computational Thinking with Visual Block Logic',
      'Master Everyday Scientific Experiments & Scientific Method',
      'Strengthen Mathematical Deductive Logic & Patterns',
      'Create Interactive Animated Stories & Digital Art'
    ],
    academicObjectives: [
      'Conceptual Clarity in Middle School Science & Mathematics',
      'Prepare for Junior Science & Math Olympiad Exploration',
      'Cultivate Independent Daily Reading & Creative Problem Solving'
    ],
    targetSkills: [
      'Scratch Block Logic',
      'Pattern Deduction',
      'Scientific Observation',
      'Algorithmic Loops',
      'Spatial Geometry & Coordinates'
    ],
    preferredDevelopmentAreas: [
      'Computational Logic',
      'Natural & Space Sciences',
      'Creative Storytelling',
      'Hands-on Maker Projects'
    ]
  },
  school: {
    segment: 'school',
    displayName: 'DTV School (Classes 9–10)',
    tagline: 'Stream Selection Aptitude & Board Exam Balance',
    careerCuriosities: [
      'Computer Science & Software Development',
      'Physical & Engineering Sciences',
      'Biological Sciences & Medicine',
      'Commerce, Accounting & Financial Markets',
      'Humanities, Law & Public Policy',
      'Design & Digital Media'
    ],
    learningGoals: [
      'Class 10 Stream Discovery & Aptitude Audit',
      'Board Exam Preparation with Zero Burnout',
      'Python Algorithmic Foundations',
      'Real-World Data Analysis & Visualization'
    ],
    academicObjectives: [
      'Achieve 95%+ in Class 10 Board Examinations',
      'Identify Ideal Senior Secondary Stream (PCM / PCB / Commerce / Arts)',
      'Build an Early Technical & Mathematical Advantage'
    ],
    targetSkills: [
      'Python Algorithmic Foundations',
      'Algebraic Problem Solving',
      'Data Interpretation & Charting',
      'Experimental Physics & Chemistry',
      'Structured Time Management'
    ],
    preferredDevelopmentAreas: [
      'Stream Selection Aptitude',
      'High School Mathematics',
      'Programming Foundations',
      'Stress-Free Study Habits'
    ]
  },
  career: {
    segment: 'career',
    displayName: 'DTV Career (Classes 11–12)',
    tagline: 'Competitive Entrance Rigor & Premier College Admissions',
    careerCuriosities: [
      'Premier Engineering (IIT / NIT / BITS)',
      'Medical & Healthcare Sciences (NEET / AIIMS)',
      'Pure Sciences & Fundamental Research (IISc / IISER)',
      'Economics, Finance & Management (IIM IPMAT / CUET)',
      'Legal Studies & Judiciary (NLUs / CLAT)',
      'Global Undergraduate Admissions & Scholarships'
    ],
    learningGoals: [
      'Competitive Entrance Readiness Diagnostic (JEE/NEET/CUET)',
      'High-Speed Concept Depth & Numerical Problem Sprints',
      'Target College Portfolio & Extracurricular Matrix',
      'National & International Scholarship Radar'
    ],
    academicObjectives: [
      'Maximize Percentile in National Entrance Exams (99+ percentile)',
      'Secure 90%+ in 12th Board Examinations',
      'Master High-Speed Timed Problem Solving under Exam Conditions'
    ],
    targetSkills: [
      'Calculus & Advanced Numerical Algebra',
      'Mechanics & Electromagnetism Problem Solving',
      'Speed Calculation & Elimination Techniques',
      'Organic Chemistry Reaction Mapping',
      'Pomodoro Deep Work Exam Stamina'
    ],
    preferredDevelopmentAreas: [
      'Competitive Entrance Rigor',
      'Target University Portfolio',
      'Timed Accuracy & Negative Marking Minimization',
      'Mental Endurance & Stress Resilience'
    ]
  },
  professional: {
    segment: 'professional',
    displayName: 'DTV Professional (College & Higher Ed)',
    tagline: 'Industry Engineering Portfolio & Placement Clearance',
    careerCuriosities: [
      'Full-Stack Software Engineering (SWE-1 / SDE-1)',
      'AI & Machine Learning Engineering',
      'Cloud Architecture & DevOps Systems',
      'Data Science & Quantitative Analytics',
      'Product Management & Technical Strategy',
      'Cybersecurity & Network Defense'
    ],
    learningGoals: [
      'Production REST API Architecture & DB Pool Sprint',
      'Distributed Systems & Scalability Simulation',
      'ATS Resume Keyword Calibration & Metric Bullet Teardowns',
      'Open Source Contribution & Verified GitHub Pull Requests'
    ],
    academicObjectives: [
      'Maintain 8.5+ CGPA across Core Engineering / CS Semesters',
      'Clear Tier-1 Tech Placement Rounds (DSA + System Design + HR)',
      'Build 3 Production Deployed Full-Stack Capstone Applications'
    ],
    targetSkills: [
      'Data Structures & Algorithms (Trees, Graphs, DP)',
      'Node.js / Express / PostgreSQL Connection Pooling',
      'Docker Containerization & CI/CD Pipelines',
      'Distributed System Design (Caching, Queues, Microservices)',
      'Technical Interview Code Walkthroughs'
    ],
    preferredDevelopmentAreas: [
      'Production Microservice Engineering',
      'Scalable Database Design',
      'Placement Coding Round Clearance',
      'Open Source & Public Portfolio Proof'
    ]
  }
};

/**
 * Module 2: Skill Gap Analysis Engine
 * Analyzes existing student skills against target skills for their chosen segment and goal.
 * Strictly avoids fabricating test scores or arbitrary metrics.
 */
function analyzeSkillGaps(segment, existingSkills = [], targetSkills = []) {
  const catalog = SEGMENT_CATALOGS[segment] || SEGMENT_CATALOGS.school;
  const defaultTargetSkills = catalog.targetSkills;
  const combinedTargetSkills = Array.from(new Set([...targetSkills, ...defaultTargetSkills]));

  // Index existing student skills by lowercase name
  const existingMap = new Map();
  existingSkills.forEach(s => {
    const name = (typeof s === 'string' ? s : s.name || s.skill_name || '').toLowerCase().trim();
    const level = (typeof s === 'object' && (s.level || s.proficiency_level)) ? (s.level || s.proficiency_level) : 'beginner';
    if (name) existingMap.set(name, level);
  });

  const skillGaps = [];

  combinedTargetSkills.forEach((skillName, index) => {
    const cleanName = skillName.trim();
    const lowerName = cleanName.toLowerCase();
    const currentProf = existingMap.get(lowerName) || 'none';

    let targetProf = 'intermediate';
    let priority = 'high';

    if (segment === 'junior') {
      targetProf = 'beginner';
      priority = index === 0 ? 'critical' : 'high';
    } else if (segment === 'school') {
      targetProf = 'intermediate';
      priority = (index <= 1) ? 'critical' : 'high';
    } else if (segment === 'career') {
      targetProf = 'advanced';
      priority = (index <= 1) ? 'critical' : 'high';
    } else {
      targetProf = 'advanced';
      priority = (index === 0) ? 'critical' : 'high';
    }

    if (currentProf === 'advanced' || (currentProf === 'intermediate' && targetProf === 'intermediate')) {
      // Skill is already at or near target level
      priority = 'low';
    }

    let reason = '';
    if (currentProf === 'none') {
      reason = `Foundational competency in ${cleanName} is missing and required for ${catalog.displayName} objectives.`;
    } else if (currentProf === 'beginner') {
      reason = `Student has introductory exposure to ${cleanName}; needs advancement to ${targetProf} level.`;
    } else {
      reason = `Competency in ${cleanName} is established; maintain agility through practice tasks.`;
    }

    skillGaps.push({
      skill_name: cleanName,
      current_proficiency: currentProf,
      target_proficiency: targetProf,
      priority,
      status: (currentProf === targetProf || currentProf === 'advanced') ? 'closed' : 'open',
      identified_reason: reason
    });
  });

  return skillGaps;
}

/**
 * Module 3: Deterministic 6-Month Roadmap Synthesizer
 * Generates 6 Monthly Milestones with 24 Weekly Actionable Tasks tailored to segment & goals.
 */
function generateDeterministicRoadmap(segment, profile, options = {}) {
  const catalog = SEGMENT_CATALOGS[segment] || SEGMENT_CATALOGS.school;
  const primaryGoal = options.primaryGoal || options.primary_goal || catalog.learningGoals[0];
  const targetCareerPath = options.targetCareerPath || options.target_career_path || (profile && profile.target_career_path) || catalog.careerCuriosities[0];
  const academicObjectives = options.academicObjectives || catalog.academicObjectives;
  const preferredAreas = options.preferredDevelopmentAreas || catalog.preferredDevelopmentAreas;
  const targetSkills = options.targetSkills || catalog.targetSkills;

  const milestones = [];
  const tasks = [];

  if (segment === 'junior') {
    // ══════════════════════════════════════════════════════════
    // DTV JUNIOR (Classes 5-8) — 6 Month Curiosity Roadmap
    // ══════════════════════════════════════════════════════════
    const mData = [
      { m: 1, title: 'Month 1: Computational Logic & Creative Block Basics', obj: 'Introduce visual logic, loops, and sequencing without code syntax friction.', outcomes: 'Creates first 2 animated Scratch stories with interactive user choices.' },
      { m: 2, title: 'Month 2: Everyday Science & Astronomical Exploration', obj: 'Explore the scientific method through gravity simulations and space observation.', outcomes: 'Understands orbital mechanics, planetary scale, and basic observational logging.' },
      { m: 3, title: 'Month 3: Pattern Puzzles & Mathematical Ciphers', obj: 'Develop deductive reasoning and secret cipher decoding agility.', outcomes: 'Solves 15 pattern logic grids and constructs a Caesar cipher mystery decoder.' },
      { m: 4, title: 'Month 4: Young Environmental Detective Lab', obj: 'Investigate energy conservation and biodiversity in local ecosystems.', outcomes: 'Produces an illustrated household conservation blueprint and data log.' },
      { m: 5, title: 'Month 5: Interactive Game Design Mini-Quest', obj: 'Design a multi-level maze game with score tracking and sound effects.', outcomes: 'Working playable game deployed to student portfolio with instructions.' },
      { m: 6, title: 'Month 6: Junior Showcase & Curiosity Certification', obj: 'Synthesize semester projects and present findings to parents and peers.', outcomes: 'Verifiable Junior Maker Badge and developmental milestone certificate.' }
    ];

    mData.forEach((m, idx) => {
      milestones.push({
        month_number: m.m,
        title: m.title,
        objective: m.obj,
        expected_outcomes: m.outcomes,
        order_index: idx
      });

      const baseWeek = (m.m - 1) * 4;
      tasks.push(
        { week_number: baseWeek + 1, title: `Week ${baseWeek + 1}: Interactive Visual Logic Setup`, description: 'Explore visual programming blocks, character sprites, and sound triggers.', task_type: 'daily_activity', skills_targeted: ['Scratch Block Logic'], completion_criteria: 'Assemble 10 connected logic blocks and trigger an animation loop.', estimated_minutes: 25, xp_reward: 40, order_index: 0 },
        { week_number: baseWeek + 2, title: `Week ${baseWeek + 2}: Science & Logic Hands-On Discovery`, description: 'Engage with simulated gravity experiments or mathematical patterns.', task_type: 'skill_builder', skills_targeted: ['Scientific Observation', 'Pattern Deduction'], completion_criteria: 'Record 3 hypothesis observations in the digital workbook.', estimated_minutes: 30, xp_reward: 45, order_index: 1 },
        { week_number: baseWeek + 3, title: `Week ${baseWeek + 3}: Practical Creative Mini-Assignment`, description: 'Build an original story scene or cipher puzzle for friends/family to test.', task_type: 'assignment', skills_targeted: ['Creative Storytelling', 'Spatial Geometry & Coordinates'], completion_criteria: 'Publish one completed scene with custom sound and dialogue.', estimated_minutes: 35, xp_reward: 50, order_index: 2 },
        { week_number: baseWeek + 4, title: `Week ${baseWeek + 4}: Milestone Reflection & Knowledge Check`, description: 'Consolidate this month’s concepts and share your creative breakthrough.', task_type: 'project', skills_targeted: ['Computational Logic'], completion_criteria: 'Complete the monthly visual quiz with 80%+ accuracy.', estimated_minutes: 30, xp_reward: 60, order_index: 3 }
      );
    });

  } else if (segment === 'school') {
    // ══════════════════════════════════════════════════════════
    // DTV SCHOOL (Classes 9-10) — 6 Month Stream & Board Roadmap
    // ══════════════════════════════════════════════════════════
    const mData = [
      { m: 1, title: 'Month 1: Stream Aptitude Discovery & Baseline Diagnostic', obj: 'Map cognitive strengths across Science, Commerce, and Humanities with empirical tests.', outcomes: 'Personalized stream aptitude matrix eliminating peer pressure bias.' },
      { m: 2, title: 'Month 2: Python Algorithmic Foundations & Core Logic', obj: 'Write Python scripts for series calculations, lists, and mathematical algorithms.', outcomes: 'Working command-line tools computing statistics and solving equations.' },
      { m: 3, title: 'Month 3: Class 10 Board Exam Strategy & Stress Blueprint', obj: 'Construct a balanced daily timetable that shields personal passions from burnout.', outcomes: 'Sustained study calendar proven to improve retention and lower exam stress.' },
      { m: 4, title: 'Month 4: Real-World Data Analysis & Visual Storytelling', obj: 'Analyze environmental or economic data using Python and tabular charts.', outcomes: 'Visual data report demonstrating cross-disciplinary analytical thinking.' },
      { m: 5, title: 'Month 5: Senior Secondary Stream Decision Lock-In', obj: 'Finalize stream selection and prerequisite subject roadmap for Classes 11-12.', outcomes: 'Documented 2-year subject trajectory with entrance exam alignment.' },
      { m: 6, title: 'Month 6: High School Excellence & Milestone Showcase', obj: 'Consolidate 10th grade portfolio, code repository, and academic blueprint.', outcomes: 'Class 10 Graduation Readiness Certificate & verified digital twin profile.' }
    ];

    mData.forEach((m, idx) => {
      milestones.push({
        month_number: m.m,
        title: m.title,
        objective: m.obj,
        expected_outcomes: m.outcomes,
        order_index: idx
      });

      const baseWeek = (m.m - 1) * 4;
      tasks.push(
        { week_number: baseWeek + 1, title: `Week ${baseWeek + 1}: Conceptual Fundamentals & Diagnostic Sprints`, description: 'Audit aptitude across Science PCM, PCB, Commerce, and Arts with timed questions.', task_type: 'daily_activity', skills_targeted: ['Algebraic Problem Solving'], completion_criteria: 'Complete the 30-minute stream diagnostic assessment.', estimated_minutes: 35, xp_reward: 50, order_index: 0 },
        { week_number: baseWeek + 2, title: `Week ${baseWeek + 2}: Python Code & Mathematical Series`, description: 'Implement numerical algorithms (Fibonacci, Prime checks, Factorials) in Python.', task_type: 'skill_builder', skills_targeted: ['Python Algorithmic Foundations'], completion_criteria: 'Write and run 3 verified Python algorithmic scripts.', estimated_minutes: 45, xp_reward: 60, order_index: 1 },
        { week_number: baseWeek + 3, title: `Week ${baseWeek + 3}: Board Subject Mastery & Active Recall`, description: 'Apply 25-minute Pomodoro study blocks for high-weightage board topics.', task_type: 'assignment', skills_targeted: ['Structured Time Management'], completion_criteria: 'Summarize 2 core chapters using mind-maps and active recall notes.', estimated_minutes: 40, xp_reward: 55, order_index: 2 },
        { week_number: baseWeek + 4, title: `Week ${baseWeek + 4}: Data Interpretation & Practical Synthesis`, description: 'Compute averages, plot trends, and analyze real-world datasets.', task_type: 'project', skills_targeted: ['Data Interpretation & Charting'], completion_criteria: 'Generate one visual chart summarizing trend observations.', estimated_minutes: 45, xp_reward: 70, order_index: 3 }
      );
    });

  } else if (segment === 'career') {
    // ══════════════════════════════════════════════════════════
    // DTV CAREER (Classes 11-12) — 6 Month Competitive Entrance Roadmap
    // ══════════════════════════════════════════════════════════
    const mData = [
      { m: 1, title: 'Month 1: National Entrance Diagnostic & Syllabus Triaging', obj: 'Identify high-weightage syllabus topics and accuracy under timed pressure.', outcomes: 'Detailed heat-map of strengths, weaknesses, and negative marking patterns.' },
      { m: 2, title: 'Month 2: Calculus & High-Speed Mechanics Sprints', obj: 'Master calculus fundamentals and mechanics problem-solving templates.', outcomes: 'Speed calculation agility resolving multi-concept numerical problems.' },
      { m: 3, title: 'Month 3: Target Institution & Extracurricular Matrix', obj: 'Map target institutions (IITs, NITs, Central Universities, Global Colleges).', outcomes: 'Strategic college portfolio aligned with cut-offs and application criteria.' },
      { m: 4, title: 'Month 4: Deep Work Problem Stamina & Mock Sprints', obj: 'Simulate 3-hour exam sessions with strict negative marking rules.', outcomes: 'Sustained concentration without cognitive fatigue or panic mistakes.' },
      { m: 5, title: 'Month 5: National Scholarship & Fellowship Radar', obj: 'Scan eligible merit-cum-means and institutional scholarships with deadlines.', outcomes: 'Submitted applications for 2 eligible fellowship/scholarship grants.' },
      { m: 6, title: 'Month 6: Final Revision Sprints & Exam Day Psychology', obj: 'Execute high-yield formula sheets, mental calmness drills, and speed recall.', outcomes: 'Verified Entrance Readiness Score & Complete Revision Blueprint.' }
    ];

    mData.forEach((m, idx) => {
      milestones.push({
        month_number: m.m,
        title: m.title,
        objective: m.obj,
        expected_outcomes: m.outcomes,
        order_index: idx
      });

      const baseWeek = (m.m - 1) * 4;
      tasks.push(
        { week_number: baseWeek + 1, title: `Week ${baseWeek + 1}: Diagnostic Entrance Question Sprint`, description: 'Solve 20 high-yield questions under strict exam timing (2 minutes per question).', task_type: 'daily_activity', skills_targeted: ['Speed Calculation & Elimination Techniques'], completion_criteria: 'Submit timed solution sheet with accuracy percentage.', estimated_minutes: 50, xp_reward: 65, order_index: 0 },
        { week_number: baseWeek + 2, title: `Week ${baseWeek + 2}: Complex Numerical Problem Drill`, description: 'Tackle multi-step physics mechanics or calculus derivative problems.', task_type: 'skill_builder', skills_targeted: ['Calculus & Advanced Numerical Algebra', 'Mechanics & Electromagnetism Problem Solving'], completion_criteria: 'Demonstrate step-by-step problem breakdown for 5 advanced problems.', estimated_minutes: 60, xp_reward: 80, order_index: 1 },
        { week_number: baseWeek + 3, title: `Week ${baseWeek + 3}: Target Institution & Cutoff Alignment`, description: 'Research previous year opening/closing ranks for target degree programs.', task_type: 'assignment', skills_targeted: ['Pomodoro Deep Work Exam Stamina'], completion_criteria: 'Complete the 5-college target comparison spreadsheet.', estimated_minutes: 45, xp_reward: 60, order_index: 2 },
        { week_number: baseWeek + 4, title: `Week ${baseWeek + 4}: 90-Minute Simulated Mock Exam`, description: 'Simulate an authentic section test with strict negative marking penalties.', task_type: 'project', skills_targeted: ['Speed Calculation & Elimination Techniques'], completion_criteria: 'Score above 65% net positive marks on the mock test.', estimated_minutes: 90, xp_reward: 100, order_index: 3 }
      );
    });

  } else {
    // ══════════════════════════════════════════════════════════
    // DTV PROFESSIONAL (College) — 6 Month Placement & Portfolio Roadmap
    // ══════════════════════════════════════════════════════════
    const mData = [
      { m: 1, title: 'Month 1: Production REST API Architecture & PostgreSQL Pool', obj: 'Architect an enterprise-grade Express service with pool connections and Docker.', outcomes: 'Deployed REST API service with automated healthchecks and query metrics.' },
      { m: 2, title: 'Month 2: Data Structures & Algorithmic Problem Solving (LeetCode)', obj: 'Master high-frequency interview patterns: Two Pointers, Trees, Graphs, and DP.', outcomes: 'Solved 40 medium algorithmic questions with verified time/space complexity.' },
      { m: 3, title: 'Month 3: Distributed System Design & Microservice Scalability', obj: 'Design a high-throughput URL shortener with Redis caching and rate-limiting.', outcomes: 'Documented architecture blueprint and latency benchmark report.' },
      { m: 4, title: 'Month 4: ATS Resume Optimization & Quantifiable Metric Teardown', obj: 'Rewrite resume with Google XYZ metric format and pass recruiter ATS screening.', outcomes: 'Clean single-page ATS-verified resume scoring 90%+ on job match tools.' },
      { m: 5, title: 'Month 5: Open Source Contribution & Public GitHub Mastery', obj: 'Contribute to an active open source repository and land a merged pull request.', outcomes: 'Verified public pull request link demonstrating collaborative Git hygiene.' },
      { m: 6, title: 'Month 6: Placement Mock Interviews & Technical Walkthrough', obj: 'Simulate live technical interview rounds with system design and live coding.', outcomes: 'Production Engineering Portfolio Badge & Placement Clearance Ready status.' }
    ];

    mData.forEach((m, idx) => {
      milestones.push({
        month_number: m.m,
        title: m.title,
        objective: m.obj,
        expected_outcomes: m.outcomes,
        order_index: idx
      });

      const baseWeek = (m.m - 1) * 4;
      tasks.push(
        { week_number: baseWeek + 1, title: `Week ${baseWeek + 1}: Express REST Architecture & Connection Pooling`, description: 'Build an Express controller with pg connection pooling and error middleware.', task_type: 'daily_activity', skills_targeted: ['Node.js / Express / PostgreSQL Connection Pooling'], completion_criteria: 'All endpoints return structured JSON with correlation IDs.', estimated_minutes: 60, xp_reward: 75, order_index: 0 },
        { week_number: baseWeek + 2, title: `Week ${baseWeek + 2}: High-Frequency Algorithmic Pattern Sprint`, description: 'Solve 10 medium LeetCode questions focusing on Sliding Window and Trees.', task_type: 'skill_builder', skills_targeted: ['Data Structures & Algorithms (Trees, Graphs, DP)'], completion_criteria: 'All solutions pass test cases with O(N) or O(N log N) runtime.', estimated_minutes: 90, xp_reward: 90, order_index: 1 },
        { week_number: baseWeek + 3, title: `Week ${baseWeek + 3}: Dockerization & CI/CD GitHub Action`, description: 'Create multi-stage Dockerfile and test pipeline in GitHub Actions.', task_type: 'assignment', skills_targeted: ['Docker Containerization & CI/CD Pipelines'], completion_criteria: 'Automated test suite executes and passes on git push.', estimated_minutes: 60, xp_reward: 80, order_index: 2 },
        { week_number: baseWeek + 4, title: `Week ${baseWeek + 4}: Production Architecture Sprint & Benchmark`, description: 'Deploy service to container host and run load-testing with autocannon.', task_type: 'project', skills_targeted: ['Distributed System Design (Caching, Queues, Microservices)'], completion_criteria: 'Demonstrate <50ms p95 latency under concurrent load.', estimated_minutes: 90, xp_reward: 120, order_index: 3 }
      );
    });
  }

  return {
    title: `${catalog.displayName}: 6-Month Accelerated Roadmap`,
    description: `A personalized, empirically calibrated development journey tailored to ${primaryGoal} and targeted career path ${targetCareerPath}.`,
    primary_goal: primaryGoal,
    target_career_path: targetCareerPath,
    academic_objectives: academicObjectives,
    preferred_development_areas: preferredAreas,
    target_skills: targetSkills,
    student_segment: segment,
    duration_months: 6,
    total_tasks: tasks.length,
    completed_tasks: 0,
    overall_progress: 0.0,
    milestones,
    tasks
  };
}

/**
 * Saves a new active roadmap, archiving any previously active roadmap for the student.
 * Transactional to guarantee zero orphaned records.
 */
async function saveRoadmap(userId, roadmapData, skillGaps, client = null) {
  const runner = client || db;

  // 1. Archive prior active roadmaps for this user
  await runner.query(
    `UPDATE student_learning_roadmaps
     SET status = 'archived', updated_at = NOW()
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );

  // 2. Insert new roadmap
  const insRoadmap = await runner.query(
    `INSERT INTO student_learning_roadmaps (
       user_id, student_segment, title, description, primary_goal,
       target_career_path, academic_objectives, preferred_development_areas,
       target_skills, duration_months, status, overall_progress,
       total_tasks, completed_tasks, ai_generated, ai_rationale,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, 'active', 0.0,
       $11, 0, $12, $13,
       NOW(), NOW()
     ) RETURNING *`,
    [
      userId,
      roadmapData.student_segment,
      roadmapData.title,
      roadmapData.description,
      roadmapData.primary_goal,
      roadmapData.target_career_path,
      JSON.stringify(roadmapData.academic_objectives || []),
      JSON.stringify(roadmapData.preferred_development_areas || []),
      JSON.stringify(roadmapData.target_skills || []),
      roadmapData.duration_months || 6,
      roadmapData.total_tasks || roadmapData.tasks.length,
      Boolean(roadmapData.ai_generated),
      roadmapData.ai_rationale || null
    ]
  );

  const roadmap = insRoadmap.rows[0];

  // 3. Insert Milestones and Tasks
  const savedMilestones = [];
  const savedTasks = [];

  for (let mIdx = 0; mIdx < roadmapData.milestones.length; mIdx++) {
    const m = roadmapData.milestones[mIdx];
    const insM = await runner.query(
      `INSERT INTO roadmap_milestones (
         roadmap_id, user_id, month_number, title, objective,
         expected_outcomes, status, progress_percentage,
         total_tasks, completed_tasks, order_index, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, 'pending', 0.0,
         4, 0, $7, NOW(), NOW()
       ) RETURNING *`,
      [
        roadmap.id,
        userId,
        m.month_number,
        m.title,
        m.objective,
        m.expected_outcomes || '',
        mIdx
      ]
    );
    const savedM = insM.rows[0];
    savedMilestones.push(savedM);

    // Filter tasks belonging to this milestone (4 per month)
    const mTasks = roadmapData.tasks.slice(mIdx * 4, (mIdx + 1) * 4);
    for (let tIdx = 0; tIdx < mTasks.length; tIdx++) {
      const t = mTasks[tIdx];
      const insT = await runner.query(
        `INSERT INTO roadmap_tasks (
           roadmap_id, milestone_id, user_id, week_number, title,
           description, task_type, skills_targeted, completion_criteria,
           estimated_minutes, xp_reward, status, order_index, created_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, 'pending', $12, NOW()
         ) RETURNING *`,
        [
          roadmap.id,
          savedM.id,
          userId,
          t.week_number,
          t.title,
          t.description,
          t.task_type || 'daily_activity',
          JSON.stringify(t.skills_targeted || []),
          t.completion_criteria || 'Complete verification steps.',
          t.estimated_minutes || 30,
          t.xp_reward || 40,
          tIdx
        ]
      );
      savedTasks.push(insT.rows[0]);
    }
  }

  // 4. Save Skill Gaps
  const savedGaps = [];
  if (Array.isArray(skillGaps)) {
    for (const g of skillGaps) {
      const insG = await runner.query(
        `INSERT INTO student_skill_gaps (
           user_id, roadmap_id, skill_name, current_proficiency,
           target_proficiency, priority, status, identified_reason,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           NOW(), NOW()
         ) RETURNING *`,
        [
          userId,
          roadmap.id,
          g.skill_name,
          g.current_proficiency || 'none',
          g.target_proficiency || 'intermediate',
          g.priority || 'high',
          g.status || 'open',
          g.identified_reason || ''
        ]
      );
      savedGaps.push(insG.rows[0]);
    }
  }

  // 5. Initial Revision Entry
  await runner.query(
    `INSERT INTO roadmap_revisions (
       roadmap_id, user_id, revision_number, reason, changes_summary, created_at
     ) VALUES (
       $1, $2, 1, 'Initial Generation',
       $3, NOW()
     )`,
    [
      roadmap.id,
      userId,
      `Generated 6-month developmental roadmap for ${roadmap.student_segment} segment with ${savedTasks.length} tasks and ${savedGaps.length} identified skill gaps.`
    ]
  );

  return {
    ...roadmap,
    milestones: savedMilestones,
    tasks: savedTasks,
    skillGaps: savedGaps
  };
}

/**
 * Retrieves the student's active roadmap with milestones, tasks, and skill gaps.
 */
async function getActiveRoadmap(userId) {
  const roadmapRes = await db.query(
    `SELECT * FROM student_learning_roadmaps
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (roadmapRes.rows.length === 0) {
    return null;
  }

  const roadmap = roadmapRes.rows[0];

  // Milestones
  const mRes = await db.query(
    `SELECT * FROM roadmap_milestones
     WHERE roadmap_id = $1
     ORDER BY month_number ASC`,
    [roadmap.id]
  );

  // Tasks
  const tRes = await db.query(
    `SELECT * FROM roadmap_tasks
     WHERE roadmap_id = $1
     ORDER BY week_number ASC, order_index ASC`,
    [roadmap.id]
  );

  // Skill Gaps
  const gRes = await db.query(
    `SELECT * FROM student_skill_gaps
     WHERE roadmap_id = $1
     ORDER BY priority DESC, created_at ASC`,
    [roadmap.id]
  );

  // Revisions count
  const revRes = await db.query(
    `SELECT COUNT(*) as count FROM roadmap_revisions WHERE roadmap_id = $1`,
    [roadmap.id]
  );

  const milestones = mRes.rows;
  const tasks = tRes.rows;
  const skillGaps = gRes.rows;

  // Attach tasks to respective milestones
  const milestonesWithTasks = milestones.map(m => ({
    ...m,
    tasks: tasks.filter(t => t.milestone_id === m.id)
  }));

  // Identify active milestone and next actionable task
  const activeMilestone = milestones.find(m => m.status !== 'completed') || milestones[0];
  const nextTask = tasks.find(t => t.status !== 'completed') || null;

  return {
    ...roadmap,
    milestones: milestonesWithTasks,
    skillGaps,
    activeMilestone,
    nextTask,
    revisionCount: parseInt(revRes.rows[0].count, 10) || 1
  };
}

/**
 * Module 7: Adaptive Task Completion & Idempotency Engine
 * Completes a task, recalculates milestone and overall progress, updates skill gaps,
 * and awards XP strictly once.
 */
async function completeTask(userId, taskId, notes = '') {
  return await db.withTransaction(async client => {
    // 1. Fetch Task
    const tRes = await client.query(
      `SELECT * FROM roadmap_tasks WHERE id = $1 AND user_id = $2`,
      [taskId, userId]
    );

    if (tRes.rows.length === 0) {
      const err = new Error('Roadmap task not found.');
      err.statusCode = 404;
      throw err;
    }

    const task = tRes.rows[0];

    // 2. Idempotency Guard: prevent duplicate completion and duplicate XP rewards
    if (task.status === 'completed') {
      return {
        alreadyCompleted: true,
        xpAwarded: 0,
        task,
        message: 'Task was already completed previously.'
      };
    }

    // 3. Mark task completed
    const updatedTaskRes = await client.query(
      `UPDATE roadmap_tasks
       SET status = 'completed', completed_at = NOW(), completion_notes = $1
       WHERE id = $2 RETURNING *`,
      [notes || 'Completed developmental task milestone.', taskId]
    );
    const updatedTask = updatedTaskRes.rows[0];

    // 4. Recalculate Milestone Progress
    const mTasksRes = await client.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM roadmap_tasks
       WHERE milestone_id = $1`,
      [task.milestone_id]
    );
    const mTotal = parseInt(mTasksRes.rows[0].total, 10) || 1;
    const mCompleted = parseInt(mTasksRes.rows[0].completed, 10) || 0;
    const mProgress = Math.round((mCompleted / mTotal) * 100);
    const mStatus = (mCompleted === mTotal) ? 'completed' : 'in_progress';

    await client.query(
      `UPDATE roadmap_milestones
       SET status = $1, progress_percentage = $2,
           total_tasks = $3, completed_tasks = $4, updated_at = NOW()
       WHERE id = $5`,
      [mStatus, mProgress, mTotal, mCompleted, task.milestone_id]
    );

    // 5. Recalculate Overall Roadmap Progress
    const rTasksRes = await client.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM roadmap_tasks
       WHERE roadmap_id = $1`,
      [task.roadmap_id]
    );
    const rTotal = parseInt(rTasksRes.rows[0].total, 10) || 1;
    const rCompleted = parseInt(rTasksRes.rows[0].completed, 10) || 0;
    const rProgress = Math.round((rCompleted / rTotal) * 100);
    const rStatus = (rCompleted === rTotal) ? 'completed' : 'active';

    await client.query(
      `UPDATE student_learning_roadmaps
       SET status = $1, overall_progress = $2,
           total_tasks = $3, completed_tasks = $4, updated_at = NOW()
       WHERE id = $5`,
      [rStatus, rProgress, rTotal, rCompleted, task.roadmap_id]
    );

    // 6. Update Skill Gaps: if targeted skill was open, move to in_progress or closed
    const targetedSkills = Array.isArray(task.skills_targeted) ? task.skills_targeted : [];
    for (const sk of targetedSkills) {
      await client.query(
        `UPDATE student_skill_gaps
         SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
             updated_at = NOW()
         WHERE roadmap_id = $1 AND LOWER(skill_name) = LOWER($2)`,
        [task.roadmap_id, sk]
      );
    }

    // 7. Award XP to Student Profile
    const xpAward = task.xp_reward || 40;
    await client.query(
      `UPDATE student_intelligence_profiles
       SET xp_points = xp_points + $1, updated_at = NOW()
       WHERE user_id = $2`,
      [xpAward, userId]
    );

    return {
      alreadyCompleted: false,
      xpAwarded: xpAward,
      task: updatedTask,
      milestoneProgress: mProgress,
      overallProgress: rProgress,
      message: `Task completed successfully! (+${xpAward} XP)`
    };
  });
}

/**
 * Updates roadmap goals and records a revision.
 */
async function updateRoadmapGoals(userId, goalsUpdate) {
  return await db.withTransaction(async client => {
    const activeRes = await client.query(
      `SELECT * FROM student_learning_roadmaps
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (activeRes.rows.length === 0) {
      const err = new Error('No active roadmap found to update.');
      err.statusCode = 404;
      throw err;
    }

    const current = activeRes.rows[0];
    const newGoal = goalsUpdate.primaryGoal || current.primary_goal;
    const newCareer = goalsUpdate.targetCareerPath || current.target_career_path;
    const newObjectives = goalsUpdate.academicObjectives || current.academic_objectives;
    const newAreas = goalsUpdate.preferredDevelopmentAreas || current.preferred_development_areas;
    const newSkills = goalsUpdate.targetSkills || current.target_skills;

    const updatedRes = await client.query(
      `UPDATE student_learning_roadmaps
       SET primary_goal = $1, target_career_path = $2,
           academic_objectives = $3, preferred_development_areas = $4,
           target_skills = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [
        newGoal,
        newCareer,
        JSON.stringify(newObjectives),
        JSON.stringify(newAreas),
        JSON.stringify(newSkills),
        current.id
      ]
    );

    // Fetch revision count
    const revCountRes = await client.query(
      `SELECT COUNT(*) as count FROM roadmap_revisions WHERE roadmap_id = $1`,
      [current.id]
    );
    const nextRevNum = (parseInt(revCountRes.rows[0].count, 10) || 1) + 1;

    // Insert revision log
    await client.query(
      `INSERT INTO roadmap_revisions (
         roadmap_id, user_id, revision_number, reason, changes_summary, created_at
       ) VALUES (
         $1, $2, $3, 'Student Goals Update',
         $4, NOW()
       )`,
      [
        current.id,
        userId,
        nextRevNum,
        `Updated primary goal to "${newGoal}" and target career path to "${newCareer}".`
      ]
    );

    return updatedRes.rows[0];
  });
}

/**
 * Returns all active skill gap records for the user.
 */
async function getSkillGaps(userId) {
  const res = await db.query(
    `SELECT * FROM student_skill_gaps
     WHERE user_id = $1
     ORDER BY priority DESC, created_at ASC`,
    [userId]
  );
  return res.rows;
}

module.exports = {
  SEGMENT_CATALOGS,
  analyzeSkillGaps,
  generateDeterministicRoadmap,
  saveRoadmap,
  getActiveRoadmap,
  completeTask,
  updateRoadmapGoals,
  getSkillGaps
};

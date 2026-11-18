const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const env = require('../src/config/env');
const userModel = require('../src/models/userModel');
const studentIntelligenceModel = require('../src/models/studentIntelligenceModel');
const learningRoadmapModel = require('../src/models/learningRoadmapModel');
const roadmapAiEngine = require('../src/services/roadmapAiEngine');

describe('Milestone 2: Dynamic Learning Roadmap Engine', () => {
  let juniorToken;
  let schoolToken;
  let careerToken;
  let proToken;

  const mockUsers = {
    junior: { id: '11111111-1111-4111-a111-111111111111', email: 'junior@gmail.com', role: 'student', name: 'Aarav Junior', isActive: true },
    school: { id: '22222222-2222-4222-a222-222222222222', email: 'school@gmail.com', role: 'student', name: 'Priya School', isActive: true },
    career: { id: '33333333-3333-4333-a333-333333333333', email: 'career@gmail.com', role: 'student', name: 'Rohan Career', isActive: true },
    pro: { id: '44444444-4444-4444-a444-444444444444', email: 'pro@gmail.com', role: 'student', name: 'Ananya College', isActive: true }
  };

  // Mock in-memory persistence store for unit/integration isolation
  const mockDb = {
    profiles: new Map(),
    roadmaps: new Map(),
    milestones: new Map(),
    tasks: new Map(),
    skillGaps: new Map(),
    revisions: new Map()
  };

  function signTestToken(user) {
    return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
  }

  beforeAll(async () => {
    juniorToken = signTestToken(mockUsers.junior);
    schoolToken = signTestToken(mockUsers.school);
    careerToken = signTestToken(mockUsers.career);
    proToken = signTestToken(mockUsers.pro);

    // Mock user lookup
    jest.spyOn(userModel, 'findById').mockImplementation(async (id) => {
      const match = Object.values(mockUsers).find(u => u.id === id);
      return match || null;
    });

    // Mock database query calls
    jest.spyOn(db, 'query').mockImplementation(async (text) => {
      return { rows: [] };
    });

    // Seed mock profiles
    mockDb.profiles.set(mockUsers.junior.id, {
      user_id: mockUsers.junior.id,
      student_segment: 'junior',
      academic_class: '6',
      stream_or_focus: 'STEM Curiosity',
      target_career_path: 'Visual Robotics & Automation',
      skills: [{ skill_name: 'Scratch Block Logic', proficiency_level: 'beginner' }],
      xp_points: 0
    });

    mockDb.profiles.set(mockUsers.school.id, {
      user_id: mockUsers.school.id,
      student_segment: 'school',
      academic_class: '10',
      stream_or_focus: 'General Exploratory',
      target_career_path: 'Computer Science & Software Development',
      skills: [{ skill_name: 'Python Algorithmic Foundations', proficiency_level: 'beginner' }],
      xp_points: 0
    });

    mockDb.profiles.set(mockUsers.career.id, {
      user_id: mockUsers.career.id,
      student_segment: 'career',
      academic_class: '11',
      stream_or_focus: 'Science PCM',
      target_career_path: 'Premier Engineering (IIT / NIT / BITS)',
      skills: [{ skill_name: 'Speed Calculation & Elimination Techniques', proficiency_level: 'beginner' }],
      xp_points: 0
    });

    mockDb.profiles.set(mockUsers.pro.id, {
      user_id: mockUsers.pro.id,
      student_segment: 'professional',
      academic_class: 'college_3',
      stream_or_focus: 'Computer Science',
      target_career_path: 'Full-Stack Software Engineering (SWE-1 / SDE-1)',
      skills: [{ skill_name: 'Node.js / Express / PostgreSQL Connection Pooling', proficiency_level: 'intermediate' }],
      xp_points: 0
    });

    // Mock studentIntelligenceModel.getProfileByUserId
    jest.spyOn(studentIntelligenceModel, 'getProfileByUserId').mockImplementation(async (userId) => {
      return mockDb.profiles.get(userId) || null;
    });

    // Mock learningRoadmapModel methods with in-memory store
    jest.spyOn(learningRoadmapModel, 'saveRoadmap').mockImplementation(async (userId, roadmapData, skillGaps) => {
      const rmId = 'rm-' + userId;
      const savedM = (roadmapData.milestones || []).map((m, idx) => ({
        id: 'm-' + (idx + 1),
        roadmap_id: rmId,
        user_id: userId,
        month_number: m.month_number,
        title: m.title,
        objective: m.objective,
        expected_outcomes: m.expected_outcomes,
        status: 'pending',
        progress_percentage: 0.0,
        total_tasks: 4,
        completed_tasks: 0,
        order_index: idx
      }));

      const savedT = (roadmapData.tasks || []).map((t, idx) => {
        const mIdx = Math.floor(idx / 4);
        return {
          id: 'task-' + (idx + 1),
          roadmap_id: rmId,
          milestone_id: savedM[mIdx] ? savedM[mIdx].id : 'm-1',
          user_id: userId,
          week_number: t.week_number,
          title: t.title,
          description: t.description,
          task_type: t.task_type || 'daily_activity',
          skills_targeted: t.skills_targeted || [],
          completion_criteria: t.completion_criteria,
          estimated_minutes: t.estimated_minutes || 30,
          xp_reward: t.xp_reward || 40,
          status: 'pending',
          completed_at: null,
          completion_notes: null,
          order_index: idx % 4
        };
      });

      const savedG = (skillGaps || []).map((g, idx) => ({
        id: 'gap-' + (idx + 1),
        user_id: userId,
        roadmap_id: rmId,
        skill_name: g.skill_name,
        current_proficiency: g.current_proficiency,
        target_proficiency: g.target_proficiency,
        priority: g.priority,
        status: g.status,
        identified_reason: g.identified_reason
      }));

      const rmRecord = {
        id: rmId,
        user_id: userId,
        student_segment: roadmapData.student_segment,
        title: roadmapData.title,
        description: roadmapData.description,
        primary_goal: roadmapData.primary_goal,
        target_career_path: roadmapData.target_career_path,
        academic_objectives: roadmapData.academic_objectives,
        preferred_development_areas: roadmapData.preferred_development_areas,
        target_skills: roadmapData.target_skills,
        duration_months: 6,
        status: 'active',
        overall_progress: 0.0,
        total_tasks: savedT.length,
        completed_tasks: 0,
        ai_generated: roadmapData.ai_generated,
        ai_rationale: roadmapData.ai_rationale,
        milestones: savedM,
        tasks: savedT,
        skillGaps: savedG
      };

      mockDb.roadmaps.set(userId, rmRecord);
      mockDb.milestones.set(rmId, savedM);
      mockDb.tasks.set(rmId, savedT);
      mockDb.skillGaps.set(rmId, savedG);

      return rmRecord;
    });

    jest.spyOn(learningRoadmapModel, 'getActiveRoadmap').mockImplementation(async (userId) => {
      const rm = mockDb.roadmaps.get(userId);
      if (!rm) return null;
      const ms = mockDb.milestones.get(rm.id) || [];
      const ts = mockDb.tasks.get(rm.id) || [];
      const gs = mockDb.skillGaps.get(rm.id) || [];

      const milestonesWithTasks = ms.map(m => ({
        ...m,
        tasks: ts.filter(t => t.milestone_id === m.id)
      }));

      return {
        ...rm,
        milestones: milestonesWithTasks,
        skillGaps: gs,
        activeMilestone: ms.find(m => m.status !== 'completed') || ms[0],
        nextTask: ts.find(t => t.status !== 'completed') || null
      };
    });

    jest.spyOn(learningRoadmapModel, 'completeTask').mockImplementation(async (userId, taskId, notes) => {
      const rm = mockDb.roadmaps.get(userId);
      if (!rm) {
        const err = new Error('Roadmap task not found.');
        err.statusCode = 404;
        throw err;
      }
      const tasks = mockDb.tasks.get(rm.id) || [];
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        const err = new Error('Roadmap task not found.');
        err.statusCode = 404;
        throw err;
      }

      // Idempotency
      if (task.status === 'completed') {
        return {
          alreadyCompleted: true,
          xpAwarded: 0,
          task,
          message: 'Task was already completed previously.'
        };
      }

      task.status = 'completed';
      task.completed_at = new Date().toISOString();
      task.completion_notes = notes || 'Completed';

      // Update milestone
      const ms = mockDb.milestones.get(rm.id) || [];
      const m = ms.find(m => m.id === task.milestone_id);
      if (m) {
        const mTasks = tasks.filter(t => t.milestone_id === m.id);
        const mDone = mTasks.filter(t => t.status === 'completed').length;
        m.completed_tasks = mDone;
        m.progress_percentage = Math.round((mDone / mTasks.length) * 100);
        if (mDone === mTasks.length) m.status = 'completed';
      }

      // Update roadmap
      const totalDone = tasks.filter(t => t.status === 'completed').length;
      rm.completed_tasks = totalDone;
      rm.overall_progress = Math.round((totalDone / tasks.length) * 100);

      // Award XP
      const prof = mockDb.profiles.get(userId);
      if (prof) {
        prof.xp_points = (prof.xp_points || 0) + (task.xp_reward || 40);
      }

      return {
        alreadyCompleted: false,
        xpAwarded: task.xp_reward || 40,
        task,
        milestoneProgress: m ? m.progress_percentage : 0,
        overallProgress: rm.overall_progress,
        message: `Task completed successfully! (+${task.xp_reward || 40} XP)`
      };
    });

    jest.spyOn(learningRoadmapModel, 'updateRoadmapGoals').mockImplementation(async (userId, goalsUpdate) => {
      const rm = mockDb.roadmaps.get(userId);
      if (!rm) {
        const err = new Error('No active roadmap found to update.');
        err.statusCode = 404;
        throw err;
      }
      rm.primary_goal = goalsUpdate.primaryGoal || rm.primary_goal;
      rm.target_career_path = goalsUpdate.targetCareerPath || rm.target_career_path;
      return rm;
    });

    jest.spyOn(learningRoadmapModel, 'getSkillGaps').mockImplementation(async (userId) => {
      const rm = mockDb.roadmaps.get(userId);
      return rm ? (mockDb.skillGaps.get(rm.id) || []) : [];
    });
  });

  describe('1. Security & Authentication Access Gates', () => {
    it('blocks unauthenticated requests to /api/v1/student/roadmap with 401', async () => {
      const res = await request(app).get('/api/v1/student/roadmap');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/roadmap/generate with 401', async () => {
      const res = await request(app).post('/api/v1/student/roadmap/generate').send({});
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/roadmap/tasks/task-1/complete with 401', async () => {
      const res = await request(app).post('/api/v1/student/roadmap/tasks/task-1/complete').send({});
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/roadmap/goals with 401', async () => {
      const res = await request(app).put('/api/v1/student/roadmap/goals').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('2. Segment Catalogs & Age-Appropriateness Boundaries', () => {
    it('provides age-appropriate catalogs for all 4 segments without corporate jargon for younger students', async () => {
      const res = await request(app)
        .get('/api/v1/student/roadmap/catalog')
        .set('Authorization', 'Bearer ' + juniorToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.currentSegment).toBe('junior');
      expect(res.body.catalog.careerCuriosities).toContain('Visual Robotics & Automation');
      expect(res.body.catalog.careerCuriosities).not.toContain('Placement & Industry Titan');
      expect(res.body.catalog.learningGoals).toContain('Build Computational Thinking with Visual Block Logic');
    });

    it('returns senior secondary and competitive entrance focus for Class 11 Career segment', async () => {
      const res = await request(app)
        .get('/api/v1/student/roadmap/catalog')
        .set('Authorization', 'Bearer ' + careerToken);

      expect(res.status).toBe(200);
      expect(res.body.currentSegment).toBe('career');
      expect(res.body.catalog.learningGoals).toContain('Competitive Entrance Readiness Diagnostic (JEE/NEET/CUET)');
    });
  });

  describe('3. Skill Gap Analysis Engine (No Fabricated Metrics)', () => {
    it('identifies missing and developing skills objectively based on current proficiency', () => {
      const existingSkills = [{ skill_name: 'Algebraic Problem Solving', proficiency_level: 'beginner' }];
      const targetSkills = ['Python Algorithmic Foundations', 'Algebraic Problem Solving', 'Data Interpretation & Charting'];

      const gaps = learningRoadmapModel.analyzeSkillGaps('school', existingSkills, targetSkills);

      expect(Array.isArray(gaps)).toBe(true);
      expect(gaps.length).toBeGreaterThanOrEqual(3);

      const pythonGap = gaps.find(g => g.skill_name === 'Python Algorithmic Foundations');
      expect(pythonGap).toBeDefined();
      expect(pythonGap.current_proficiency).toBe('none');
      expect(pythonGap.status).toBe('open');
      expect(pythonGap.identified_reason).toContain('Foundational competency in Python Algorithmic Foundations is missing');

      const algebraGap = gaps.find(g => g.skill_name === 'Algebraic Problem Solving');
      expect(algebraGap).toBeDefined();
      expect(algebraGap.current_proficiency).toBe('beginner');
    });
  });

  describe('4. 6-Month Roadmap Generation & Milestones Structure', () => {
    it('generates a 6-month roadmap with exactly 6 monthly milestones and 24 weekly tasks for School segment', async () => {
      const res = await request(app)
        .post('/api/v1/student/roadmap/generate')
        .set('Authorization', 'Bearer ' + schoolToken)
        .send({
          primaryGoal: 'Class 10 Stream Discovery & Aptitude Audit',
          targetCareerPath: 'Computer Science & Software Development',
          targetSkills: ['Python Algorithmic Foundations'],
          useAi: false
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.roadmap).toBeDefined();
      expect(res.body.roadmap.duration_months).toBe(6);
      expect(res.body.roadmap.milestones.length).toBe(6);
      expect(res.body.roadmap.tasks.length).toBe(24);
      expect(res.body.roadmap.overall_progress).toBe(0.0);
    });

    it('generates an age-appropriate 6-month roadmap for Junior segment with playful exploratory quests', async () => {
      const res = await request(app)
        .post('/api/v1/student/roadmap/generate')
        .set('Authorization', 'Bearer ' + juniorToken)
        .send({
          primaryGoal: 'Build Computational Thinking with Visual Block Logic',
          targetCareerPath: 'Visual Robotics & Automation',
          useAi: false
        });

      expect(res.status).toBe(201);
      expect(res.body.roadmap.student_segment).toBe('junior');
      const firstTask = res.body.roadmap.tasks[0];
      expect(firstTask.skills_targeted).toContain('Scratch Block Logic');
      expect(firstTask.task_type).toBe('daily_activity');
    });
  });

  describe('5. Active Roadmap Retrieval & Dashboard Integration', () => {
    it('retrieves active roadmap with milestones, tasks, and skill gaps for authenticated student', async () => {
      const res = await request(app)
        .get('/api/v1/student/roadmap')
        .set('Authorization', 'Bearer ' + schoolToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasRoadmap).toBe(true);
      expect(res.body.roadmap.milestones.length).toBe(6);
      expect(res.body.roadmap.milestones[0].tasks.length).toBe(4);
      expect(res.body.roadmap.activeMilestone).toBeDefined();
      expect(res.body.roadmap.nextTask).toBeDefined();
    });
  });

  describe('6. Task Completion, Dynamic Progress Recalculation & Idempotency', () => {
    it('completes a task and recalculates milestone and overall roadmap progress', async () => {
      const completeRes = await request(app)
        .post('/api/v1/student/roadmap/tasks/task-1/complete')
        .set('Authorization', 'Bearer ' + schoolToken)
        .send({ notes: 'Completed diagnostic week 1 sprint.' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);
      expect(completeRes.body.alreadyCompleted).toBe(false);
      expect(completeRes.body.xpAwarded).toBe(50);
      expect(completeRes.body.milestoneProgress).toBe(25); // 1 out of 4 tasks in Month 1
      expect(completeRes.body.overallProgress).toBe(4);    // 1 out of 24 tasks in Roadmap (~4%)
    });

    it('strictly enforces idempotency: re-completing the same task awards 0 XP and leaves progress unchanged', async () => {
      const repeatRes = await request(app)
        .post('/api/v1/student/roadmap/tasks/task-1/complete')
        .set('Authorization', 'Bearer ' + schoolToken)
        .send({ notes: 'Duplicate complete attempt.' });

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.alreadyCompleted).toBe(true);
      expect(repeatRes.body.xpAwarded).toBe(0);
    });

    it('returns 404 when attempting to complete a non-existent task', async () => {
      const notFoundRes = await request(app)
        .post('/api/v1/student/roadmap/tasks/non-existent-task-999/complete')
        .set('Authorization', 'Bearer ' + schoolToken)
        .send({});

      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.success).toBe(false);
    });
  });

  describe('7. Roadmap Goals Update & Audit Revision History', () => {
    it('updates roadmap goals and preserves student progress', async () => {
      const updateRes = await request(app)
        .put('/api/v1/student/roadmap/goals')
        .set('Authorization', 'Bearer ' + schoolToken)
        .send({
          primaryGoal: 'Class 10 Board Exam Strategy & Python Mastery',
          targetCareerPath: 'AI & Data Engineering'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.roadmap.primary_goal).toBe('Class 10 Board Exam Strategy & Python Mastery');
      expect(updateRes.body.roadmap.target_career_path).toBe('AI & Data Engineering');
    });
  });

  describe('8. AI Synthesis Validation & Deterministic Fallback Guard', () => {
    it('validates AI roadmap JSON schema with strict shape checking', () => {
      const sampleAiOutput = {
        title: 'Class 10 Python & Stream Navigator',
        description: 'Comprehensive 6-month roadmap.',
        aiRationale: 'Addresses python gap and board exam preparation balance.',
        milestones: Array.from({ length: 6 }).map((_, mIdx) => ({
          month_number: mIdx + 1,
          title: `Month ${mIdx + 1} Milestone`,
          objective: 'Test objective',
          expected_outcomes: 'Test outcome',
          tasks: Array.from({ length: 4 }).map((_, tIdx) => ({
            week_number: mIdx * 4 + tIdx + 1,
            title: `Week ${mIdx * 4 + tIdx + 1} Action`,
            description: 'Action description',
            task_type: 'daily_activity',
            skills_targeted: ['Python'],
            completion_criteria: 'Submit script',
            estimated_minutes: 30,
            xp_reward: 40
          }))
        }))
      };

      const { error, value } = roadmapAiEngine.aiRoadmapSchema.validate(sampleAiOutput);
      expect(error).toBeUndefined();
      expect(value.milestones.length).toBe(6);
    });

    it('gracefully applies deterministic fallback when AI response is unavailable or invalid', async () => {
      const profile = mockDb.profiles.get(mockUsers.school.id);
      const fallbackRoadmap = await roadmapAiEngine.generateAdaptiveRoadmap(
        'school',
        profile,
        { primaryGoal: 'Stream Selection Aptitude' },
        [],
        { useAi: false }
      );

      expect(fallbackRoadmap).toBeDefined();
      expect(fallbackRoadmap.duration_months).toBe(6);
      expect(fallbackRoadmap.ai_generated).toBe(false);
      expect(fallbackRoadmap.ai_rationale).toContain('Synthesized via DTV Deterministic Empirical Engine');
      expect(fallbackRoadmap.milestones.length).toBe(6);
      expect(fallbackRoadmap.tasks.length).toBe(24);
    });
  });
});

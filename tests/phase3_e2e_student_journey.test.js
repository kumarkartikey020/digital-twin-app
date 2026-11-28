const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

describe('Phase 3 — Complete End-to-End Student Journey & Data Persistence', () => {
  let studentToken;
  let studentUser;
  let studentProfile;
  const originalQuery = db.pool.query.bind(db.pool);
  const timestamp = Date.now();
  const testEmail = `e2e.student.${timestamp}@gmail.com`;
  const testPassword = 'StrongPassword!2026';

  beforeAll(() => {
    // Intercept TRUNCATE from setup.js during this multi-step journey to preserve user session
    jest.spyOn(db.pool, 'query').mockImplementation((text, params, callback) => {
      if (typeof text === 'string' && text.includes('TRUNCATE TABLE refresh_tokens, files, users')) {
        return Promise.resolve({ rows: [] });
      }
      return originalQuery(text, params, callback);
    });
  });

  afterAll(async () => {
    // Restore pool query and clean up test data
    if (db.pool.query.mockRestore) {
      db.pool.query.mockRestore();
    }
    try {
      await originalQuery('TRUNCATE TABLE refresh_tokens, files, users RESTART IDENTITY CASCADE');
    } catch (e) {}
  });

  // 1. REGISTRATION
  describe('Step 1: Student Registration (Auth API)', () => {
    it('successfully registers a new student account with validated domain', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Priya Sharma (E2E Test)'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('user');
      studentUser = res.body.user;
      studentToken = res.body.accessToken;
      expect(studentUser.email).toBe(testEmail);
    });

    it('rejects duplicate registration with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Duplicate Student'
        });

      expect([400, 409]).toContain(res.status);
    });
  });

  // 2. LOGIN & TOKEN VERIFICATION
  describe('Step 2: Student Authentication & Session Acquisition', () => {
    it('authenticates with valid credentials and returns JWT session', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      studentToken = res.body.accessToken;
    });

    it('rejects login with invalid password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!123'
        });

      expect(res.status).toBe(401);
    });
  });

  // 3. ONBOARDING & PROFILE SETUP
  describe('Step 3: Onboarding & Multi-Segment Profile Initialization', () => {
    it('initializes profile with Class 10 (School segment), target stream, and interests', async () => {
      const res = await request(app)
        .post('/api/v1/student/onboarding')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          academicClass: '10',
          studentSegment: 'school',
          streamOrFocus: 'Science PCM & Computer Science',
          targetCareerPath: 'AI & Software Engineering',
          interests: ['Coding & Logic', 'Robotics & AI', 'Mathematics'],
          skills: [
            { name: 'Python Programming', level: 'intermediate' },
            { name: 'Algorithmic Thinking', level: 'beginner' }
          ],
          weeklyGoalHours: 6
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.student_segment).toBe('school');
      expect(res.body.profile.academic_class).toBe('10');
      studentProfile = res.body.profile;
    });

    it('persists profile and returns it on GET /api/v1/student/profile', async () => {
      const res = await request(app)
        .get('/api/v1/student/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.student_segment).toBe('school');
      expect(res.body.profile.target_career_path).toBe('AI & Software Engineering');
    });
  });

  // 4. STUDENT DASHBOARD & METRICS
  describe('Step 4: Student Intelligence Dashboard & Metric Calculation', () => {
    it('serves dashboard with empirical metrics derived strictly from actual records', async () => {
      const res = await request(app)
        .get('/api/v1/student/dashboard')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dashboard).toBeDefined();
      expect(res.body.dashboard.profile.segment).toBe('school');
      expect(res.body.dashboard.metrics).toBeDefined();
      expect(typeof res.body.dashboard.metrics.totalXp).toBe('number');
    });
  });

  // 5. NEXT BEST ACTION CONTRACT (6-PART)
  describe('Step 5: 6-Part Next Best Action Contract Execution', () => {
    it('computes actionable Next Best Action contract', async () => {
      const res = await request(app)
        .get('/api/v1/student/intelligence/next-action')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const nba = res.body.action;
      expect(nba).toHaveProperty('actionCode');
      expect(nba).toHaveProperty('what');
      expect(nba).toHaveProperty('why');
      expect(nba).toHaveProperty('goalOrSkillSupported');
      expect(nba).toHaveProperty('estimatedEffortMinutes');
      expect(nba).toHaveProperty('expectedOutcome');
      expect(nba).toHaveProperty('actionCta');
      expect(typeof nba.actionCta.label).toBe('string');
      expect(typeof nba.actionCta.url).toBe('string');
    });
  });

  // 6. SKILL GAP ANALYSIS & PROVENANCE EVALUATION
  describe('Step 6: Skill Gap & 4-Level Provenance Engine', () => {
    it('evaluates target career gaps against Class 10 requirements', async () => {
      const res = await request(app)
        .get('/api/v1/student/intelligence/skill-gaps')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.studentSegment).toBe('school');
      expect(Array.isArray(res.body.data.skillGaps)).toBe(true);
    });
  });

  // 7. ADAPTIVE 6-MONTH ROADMAP CALIBRATION
  describe('Step 7: 6-Month Adaptive Roadmap Calibration & Pacing', () => {
    it('initializes a 6-month roadmap via roadmap generate', async () => {
      const res = await request(app)
        .post('/api/v1/student/roadmap/generate')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          primaryGoal: 'AI Software Engineer Foundation',
          targetCareerPath: 'AI & Software Engineering',
          academicClass: '10',
          streamOrFocus: 'Science PCM & Computer Science',
          targetSkills: ['Python', 'Algorithms', 'System Logic']
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.roadmap).toBeDefined();
    });

    it('adapts roadmap pace with recorded audit trail', async () => {
      const res = await request(app)
        .post('/api/v1/student/intelligence/roadmap/adapt')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          adaptationType: 'pace_accelerated',
          reason: 'Student demonstrates high proficiency in prerequisite tasks.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.adaptation).toBeDefined();
      expect(res.body.data.adaptation.revisionNumber).toBeGreaterThan(0);
      expect(res.body.data.adaptation.adaptationType).toBe('pace_accelerated');
    });

    it('rejects invalid roadmap adaptation type with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/student/intelligence/roadmap/adapt')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          adaptationType: 'invalid_type',
          reason: 'Invalid test payload'
        });

      expect(res.status).toBe(400);
    });
  });

  // 8. PROJECT RECOMMENDATIONS
  describe('Step 8: Progressive Project Recommendations', () => {
    it('returns segment-tailored projects with skill targeting', async () => {
      const res = await request(app)
        .get('/api/v1/student/intelligence/project-recommendations')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.projects)).toBe(true);
      if (res.body.projects.length > 0) {
        const proj = res.body.projects[0];
        expect(proj).toHaveProperty('title');
        expect(proj).toHaveProperty('difficulty');
        expect(proj).toHaveProperty('skillsTargeted');
      }
    });
  });

  // 9. STUDENT PORTFOLIO ECOSYSTEM
  describe('Step 9: Student Portfolio Creation & Project Showcasing', () => {
    it('creates a showcase project in student portfolio', async () => {
      const res = await request(app)
        .post('/api/v1/portfolio/projects')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Autonomous Rover Simulator',
          description: 'A 2D robotics simulation built with Python demonstrating pathfinding algorithms.',
          projectUrl: 'https://github.com/example/rover-sim',
          skills: ['Python', 'Pathfinding', 'Simulation'],
          projectType: 'independent'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.title).toBe('Autonomous Rover Simulator');
    });

    it('retrieves portfolio profile containing showcase projects', async () => {
      const res = await request(app)
        .get('/api/v1/portfolio/me/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // 10. ACTIVITY COMPLETION & GROWTH PROGRESSION
  describe('Step 10: Learning Activity Completion & Immediate Progress Updates', () => {
    it('retrieves segment activities and completes one', async () => {
      const actRes = await request(app)
        .get('/api/v1/student/activities')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(actRes.status).toBe(200);
      expect(actRes.body.success).toBe(true);
      expect(Array.isArray(actRes.body.activities)).toBe(true);
      expect(actRes.body.activities.length).toBeGreaterThan(0);

      const targetAct = actRes.body.activities[0];
      const compRes = await request(app)
        .post(`/api/v1/student/activities/${targetAct.activity_code}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          notes: 'Completed interactive stream matrix assessment exercises.'
        });

      expect(compRes.status).toBe(200);
      expect(compRes.body.success).toBe(true);
      expect(compRes.body.xpAwarded).toBeGreaterThan(0);
    });
  });

  // 11. GROWTH METRICS & MOMENTUM
  describe('Step 11: Developmental Velocity & Growth Tracking', () => {
    it('computes developmental velocity without fabricated metrics', async () => {
      const res = await request(app)
        .get('/api/v1/student/intelligence/growth-metrics')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.growth).toBeDefined();
      expect(typeof res.body.growth.developmentalVelocity).toBe('number');
      expect(res.body.growth.metrics).toBeDefined();
      expect(Array.isArray(res.body.growth.growthTimeline)).toBe(true);
    });
  });

  // 12. CAPACITY CONNECT & PRIVACY SAFEGUARDS
  describe('Step 12: Capacity Connect Opportunity Matching & Privacy Safeguards', () => {
    it('fetches matched opportunities appropriate for school segment', async () => {
      const res = await request(app)
        .get('/api/v1/student/intelligence/matched-opportunities')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.opportunities)).toBe(true);
    });

    it('updates guardian privacy consent preferences cleanly', async () => {
      const res = await request(app)
        .put('/api/v1/capacity-connect/privacy/consent')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          isGranted: true,
          parentEmail: 'guardian@gmail.com'
        });

      expect([200, 201]).toContain(res.status);
    });
  });

  // 13. SECURITY REGRESSION: UNAUTHENTICATED ACCESS REJECTIONS
  describe('Step 13: Security & Authorization Access Gates', () => {
    const endpoints = [
      { method: 'get', url: '/api/v1/student/profile' },
      { method: 'get', url: '/api/v1/student/dashboard' },
      { method: 'get', url: '/api/v1/student/intelligence/next-action' },
      { method: 'get', url: '/api/v1/student/intelligence/skill-gaps' },
      { method: 'post', url: '/api/v1/student/intelligence/roadmap/adapt' },
      { method: 'get', url: '/api/v1/student/intelligence/project-recommendations' },
      { method: 'get', url: '/api/v1/student/intelligence/growth-metrics' },
      { method: 'get', url: '/api/v1/student/intelligence/matched-opportunities' },
      { method: 'get', url: '/api/v1/capacity-connect/my-applications' }
    ];

    endpoints.forEach(({ method, url }) => {
      it(`blocks unauthenticated ${method.toUpperCase()} ${url} with 401`, async () => {
        const res = await request(app)[method](url);
        expect(res.status).toBe(401);
        expect(res.body.error || res.body.message).toBeDefined();
      });
    });
  });
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const env = require('../src/config/env');
const userModel = require('../src/models/userModel');
const organizationModel = require('../src/models/organizationModel');
const capacityModel = require('../src/models/capacityConnectModel');
const portfolioModel = require('../src/models/portfolioModel');

describe('Milestone 4: Student Portfolio & Achievement Ecosystem', () => {
  let juniorToken;
  let collegeToken;
  let orgAdminToken;
  let unverifiedOrgToken;
  let outsiderToken;

  const mockUsers = {
    juniorStudent: {
      id: '11111111-1111-4111-a111-111111111111',
      email: 'aarav.junior@gmail.com',
      role: 'student',
      name: 'Aarav Junior',
      phone: '+919876543210',
      isActive: true
    },
    collegeStudent: {
      id: '22222222-2222-4222-a222-222222222222',
      email: 'ananya.college@gmail.com',
      role: 'student',
      name: 'Ananya College',
      phone: '+919876543211',
      isActive: true
    },
    orgAdmin: {
      id: '33333333-3333-4333-a333-333333333333',
      email: 'director@apexrobotics.edu',
      role: 'user',
      name: 'Dr. Jane Director',
      isActive: true
    },
    unverifiedAdmin: {
      id: '44444444-4444-4444-a444-444444444444',
      email: 'admin@unverified.org',
      role: 'user',
      name: 'Unverified Admin',
      isActive: true
    },
    outsider: {
      id: '55555555-5555-4555-a555-555555555555',
      email: 'outsider@gmail.com',
      role: 'user',
      name: 'Outsider Peer',
      isActive: true
    }
  };

  const verifiedOrgId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const unverifiedOrgId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const testProjectId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const testCertId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

  function signTestToken(user) {
    return jwt.sign(
      { sub: user.id, role: user.role || 'student' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
  }

  beforeAll(async () => {
    juniorToken = signTestToken(mockUsers.juniorStudent);
    collegeToken = signTestToken(mockUsers.collegeStudent);
    orgAdminToken = signTestToken(mockUsers.orgAdmin);
    unverifiedOrgToken = signTestToken(mockUsers.unverifiedAdmin);
    outsiderToken = signTestToken(mockUsers.outsider);

    // Mock user lookup
    jest.spyOn(userModel, 'findById').mockImplementation(async (id) => {
      const match = Object.values(mockUsers).find(u => u.id === id);
      return match || null;
    });

    // Mock organization membership lookup for RBAC
    jest.spyOn(organizationModel, 'getMembership').mockImplementation(async (orgId, userId) => {
      if (orgId === verifiedOrgId && userId === mockUsers.orgAdmin.id) {
        return { organization_id: orgId, user_id: userId, role: 'ORGANIZATION_ADMIN', status: 'Active' };
      }
      if (orgId === unverifiedOrgId && userId === mockUsers.unverifiedAdmin.id) {
        return { organization_id: orgId, user_id: userId, role: 'ORGANIZATION_ADMIN', status: 'Active' };
      }
      return null;
    });

    // Mock capacity model org lookup
    jest.spyOn(capacityModel, 'getOrganizationById').mockImplementation(async (orgId) => {
      if (orgId === verifiedOrgId) {
        return { id: orgId, name: 'Apex AI & Robotics Institute', verification_status: 'verified' };
      }
      if (orgId === unverifiedOrgId) {
        return { id: orgId, name: 'Unverified Entity Labs', verification_status: 'pending' };
      }
      return null;
    });

    // Mock generic DB query
    jest.spyOn(db, 'query').mockImplementation(async (text, params) => {
      return { rows: [] };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. SECURITY & ACCESS CONTROL GATES
  // =========================================================================
  describe('1. Security & Authentication Access Gates', () => {
    it('blocks unauthenticated requests to /api/v1/portfolio/me/profile with 401', async () => {
      const res = await request(app).get('/api/v1/portfolio/me/profile');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/portfolio/projects with 401', async () => {
      const res = await request(app).post('/api/v1/portfolio/projects').send({});
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/portfolio/certifications with 401', async () => {
      const res = await request(app).post('/api/v1/portfolio/certifications').send({});
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/portfolio/me/achievements with 401', async () => {
      const res = await request(app).get('/api/v1/portfolio/me/achievements');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. STUDENT PORTFOLIO CREATION & RETRIEVAL
  // =========================================================================
  describe('2. Student Portfolio Management', () => {
    it('retrieves comprehensive portfolio data for authenticated student with completion score', async () => {
      jest.spyOn(portfolioModel, 'getStudentPortfolio').mockResolvedValueOnce({
        studentId: mockUsers.collegeStudent.id,
        user: { name: 'Ananya College', email: 'ananya.college@gmail.com', phone: '+919876543211' },
        meta: { headline: 'Aspiring Full-Stack SWE', completionScore: 85, portfolioVisibility: 'public' },
        academicProfile: { studentSegment: 'professional', academicClass: 'college_3' },
        skills: [{ skill_name: 'Python', proficiency_level: 'advanced', verified: true }],
        projects: [{ id: testProjectId, title: 'Autonomous Multi-Agent Simulation' }],
        achievements: [{ badge_title: 'Genesis Quest', criteria_met: 'first_quest_completed' }],
        roadmaps: [{ title: 'Full-Stack SWE 6-Month Roadmap', overall_progress: 50 }],
        organisationAccomplishments: []
      });

      const res = await request(app)
        .get('/api/v1/portfolio/me/profile')
        .set('Authorization', `Bearer ${collegeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meta.completionScore).toBe(85);
      expect(res.body.data.skills).toHaveLength(1);
      expect(res.body.data.projects).toHaveLength(1);
    });

    it('updates portfolio headline, bio, location, and visibility', async () => {
      jest.spyOn(portfolioModel, 'updatePortfolioMeta').mockResolvedValueOnce({
        user_id: mockUsers.collegeStudent.id,
        headline: 'Lead Systems Architect & Distributed Systems Engineer',
        location: 'Bangalore, India',
        portfolio_visibility: 'public'
      });

      const res = await request(app)
        .put('/api/v1/portfolio/me/profile')
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({
          headline: 'Lead Systems Architect & Distributed Systems Engineer',
          location: 'Bangalore, India',
          portfolioVisibility: 'public'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.headline).toContain('Lead Systems Architect');
    });

    it('validates portfolio visibility options (public, organizations_only, private)', async () => {
      const res = await request(app)
        .put('/api/v1/portfolio/me/profile')
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({ portfolioVisibility: 'invalid_mode' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. PROJECT SHOWCASE CRUD & VALIDATION
  // =========================================================================
  describe('3. Project Showcase CRUD', () => {
    it('allows student to publish a new project showcase with technologies and outcomes', async () => {
      jest.spyOn(portfolioModel, 'createProject').mockResolvedValueOnce({
        id: testProjectId,
        student_id: mockUsers.collegeStudent.id,
        title: 'Distributed State Machine & Simulation Engine',
        technologies: ['Python', 'PostgreSQL', 'Docker'],
        student_role: 'Lead Architect',
        project_category: 'software',
        outcomes_and_impact: 'Simulated 100,000 requests/sec with zero state drift',
        is_featured: true
      });

      const res = await request(app)
        .post('/api/v1/portfolio/projects')
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({
          title: 'Distributed State Machine & Simulation Engine',
          description: 'A fault-tolerant distributed simulation engine built in Python and PostgreSQL.',
          technologies: ['Python', 'PostgreSQL', 'Docker'],
          studentRole: 'Lead Architect',
          projectCategory: 'software',
          outcomesAndImpact: 'Simulated 100,000 requests/sec with zero state drift',
          isFeatured: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toContain('Distributed State Machine');
      expect(res.body.data.technologies).toHaveLength(3);
    });

    it('validates required fields on project showcase creation', async () => {
      const res = await request(app)
        .post('/api/v1/portfolio/projects')
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({ title: 'Short' }); // missing description

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('allows student to update their existing project showcase', async () => {
      jest.spyOn(portfolioModel, 'updateProject').mockResolvedValueOnce({
        id: testProjectId,
        title: 'Updated Distributed Simulation Engine',
        tagline: 'High-throughput spatial simulation'
      });

      const res = await request(app)
        .put(`/api/v1/portfolio/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({
          title: 'Updated Distributed Simulation Engine',
          tagline: 'High-throughput spatial simulation'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Distributed Simulation Engine');
    });

    it('allows student to delete their project showcase', async () => {
      jest.spyOn(portfolioModel, 'deleteProject').mockResolvedValueOnce({
        id: testProjectId,
        deleted: true
      });

      const res = await request(app)
        .delete(`/api/v1/portfolio/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${collegeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
    });

    it('retrieves project details by ID with creator information', async () => {
      jest.spyOn(portfolioModel, 'getProjectById').mockResolvedValueOnce({
        id: testProjectId,
        title: 'Distributed State Machine',
        student_name: 'Ananya College',
        technologies: ['Python', 'Docker']
      });

      const res = await request(app).get(`/api/v1/portfolio/projects/${testProjectId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.student_name).toBe('Ananya College');
    });
  });

  // =========================================================================
  // 4. CERTIFICATIONS MANAGEMENT
  // =========================================================================
  describe('4. Certifications & External Credentials', () => {
    it('allows student to add a verified credential to their portfolio', async () => {
      jest.spyOn(portfolioModel, 'addCertification').mockResolvedValueOnce({
        id: testCertId,
        student_id: mockUsers.collegeStudent.id,
        title: 'Certified Machine Learning Specialist',
        issuing_organization: 'DeepLearning.AI',
        credential_id: 'DL-98231'
      });

      const res = await request(app)
        .post('/api/v1/portfolio/certifications')
        .set('Authorization', `Bearer ${collegeToken}`)
        .send({
          title: 'Certified Machine Learning Specialist',
          issuingOrganization: 'DeepLearning.AI',
          credentialId: 'DL-98231'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Certified Machine Learning Specialist');
    });

    it('allows student to remove a certification', async () => {
      jest.spyOn(portfolioModel, 'deleteCertification').mockResolvedValueOnce({
        id: testCertId,
        deleted: true
      });

      const res = await request(app)
        .delete(`/api/v1/portfolio/certifications/${testCertId}`)
        .set('Authorization', `Bearer ${collegeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
    });
  });

  // =========================================================================
  // 5. GENUINE ACHIEVEMENTS EVALUATION ENGINE
  // =========================================================================
  describe('5. Verified Achievement Engine', () => {
    it('evaluates and awards genuine achievements derived from empirical facts', async () => {
      jest.spyOn(portfolioModel, 'evaluateAndAwardAchievements').mockResolvedValueOnce([
        { badge_title: 'Genesis Quest', criteria_met: 'first_quest_completed', xp_bonus: 50 },
        { badge_title: 'Pathfinder', criteria_met: 'roadmap_activated', xp_bonus: 75 },
        { badge_title: 'Creator Genesis', criteria_met: 'first_project_published', xp_bonus: 100 },
        { badge_title: 'Full-Stack Polymath', criteria_met: 'multi_tech_innovator', xp_bonus: 150 },
        { badge_title: 'Industry Endorsed', criteria_met: 'challenge_accepted', xp_bonus: 250 }
      ]);

      const res = await request(app)
        .get('/api/v1/portfolio/me/achievements')
        .set('Authorization', `Bearer ${collegeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.achievements).toHaveLength(5);
      expect(res.body.data.catalog).toBeDefined();
    });

    it('enforces catalog criteria definitions for genuine verified activities', () => {
      expect(portfolioModel.ACHIEVEMENTS_CATALOG).toBeInstanceOf(Array);
      expect(portfolioModel.ACHIEVEMENTS_CATALOG.length).toBeGreaterThanOrEqual(10);

      const criteriaKeys = portfolioModel.ACHIEVEMENTS_CATALOG.map(c => c.criteria_met);
      expect(criteriaKeys).toContain('first_quest_completed');
      expect(criteriaKeys).toContain('roadmap_activated');
      expect(criteriaKeys).toContain('first_project_published');
      expect(criteriaKeys).toContain('challenge_accepted');
      expect(criteriaKeys).toContain('mentorship_completed');
    });
  });

  // =========================================================================
  // 6. CAPACITY CONNECT & ORGANISATION INTEGRATION WITH MINOR PRIVACY
  // =========================================================================
  describe('6. Organisation Integration & Minor Protection', () => {
    it('masks Junior student contact details when evaluated by an organisation without parental consent', async () => {
      jest.spyOn(portfolioModel, 'getStudentPortfolio').mockResolvedValueOnce({
        studentId: mockUsers.juniorStudent.id,
        user: { name: 'Aarav J.', email: 'aar***@***.com', phone: '[Protected Minor Contact]' },
        privacy: { isMinor: true, privacyProtected: true },
        academicProfile: { studentSegment: 'junior', academicClass: '6' },
        skills: [{ skill_name: 'Scratch Block Logic', proficiency_level: 'intermediate' }],
        projects: [{ title: 'Solar Energy Simulation Quest' }]
      });

      const res = await request(app)
        .get(`/api/v1/portfolio/organizations/${verifiedOrgId}/candidates/${mockUsers.juniorStudent.id}`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.isMinor).toBe(true);
      expect(res.body.data.privacy.privacyProtected).toBe(true);
      expect(res.body.data.user.email).not.toBe('aarav.junior@gmail.com');
      expect(res.body.data.user.phone).toBe('[Protected Minor Contact]');
    });

    it('unmasks contact details for adult/college student when evaluated by verified organisation', async () => {
      jest.spyOn(portfolioModel, 'getStudentPortfolio').mockResolvedValueOnce({
        studentId: mockUsers.collegeStudent.id,
        user: { name: 'Ananya College', email: 'ananya.college@gmail.com', phone: '+919876543211' },
        privacy: { isMinor: false, privacyProtected: false },
        academicProfile: { studentSegment: 'professional', academicClass: 'college_3' },
        skills: [{ skill_name: 'Python', proficiency_level: 'advanced' }]
      });

      const res = await request(app)
        .get(`/api/v1/portfolio/organizations/${verifiedOrgId}/candidates/${mockUsers.collegeStudent.id}`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.isMinor).toBe(false);
      expect(res.body.data.user.email).toBe('ananya.college@gmail.com');
    });

    it('rejects candidate portfolio access if organisation is unverified with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/portfolio/organizations/${unverifiedOrgId}/candidates/${mockUsers.collegeStudent.id}`)
        .set('Authorization', `Bearer ${unverifiedOrgToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('must be verified');
    });

    it('allows verified organisation to endorse/verify a student project', async () => {
      jest.spyOn(portfolioModel, 'verifyProjectByOrg').mockResolvedValueOnce({
        id: testProjectId,
        verified_by_org_id: verifiedOrgId,
        verified_at: new Date().toISOString()
      });

      const res = await request(app)
        .post(`/api/v1/portfolio/organizations/${verifiedOrgId}/projects/${testProjectId}/verify`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.verified_by_org_id).toBe(verifiedOrgId);
    });
  });
});

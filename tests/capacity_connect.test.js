const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const env = require('../src/config/env');
const userModel = require('../src/models/userModel');
const organizationModel = require('../src/models/organizationModel');
const capacityModel = require('../src/models/capacityConnectModel');

describe('Milestone 3: Capacity Connect B2B & Organisation Ecosystem', () => {
  let adminToken;
  let orgAdminToken;
  let trainerToken;
  let juniorStudentToken;
  let collegeStudentToken;
  let outsiderToken;

  const mockUsers = {
    admin: { id: '00000000-0000-4000-a000-000000000000', email: 'admin@dtv.com', role: 'admin', name: 'Platform Admin', isActive: true },
    orgAdmin: { id: '11111111-1111-4111-a111-111111111111', email: 'director@acmetech.com', role: 'user', name: 'Dr. Jane Director', isActive: true },
    trainer: { id: '22222222-2222-4222-a222-222222222222', email: 'mentor@acmetech.com', role: 'user', name: 'Alex Mentor', isActive: true },
    juniorStudent: { id: '33333333-3333-4333-a333-333333333333', email: 'aarav.junior@gmail.com', role: 'student', name: 'Aarav Junior', phone: '+919876543210', isActive: true },
    collegeStudent: { id: '44444444-4444-4444-a444-444444444444', email: 'ananya.college@gmail.com', role: 'student', name: 'Ananya College', phone: '+919876543211', isActive: true },
    outsider: { id: '55555555-5555-4555-a555-555555555555', email: 'outsider@gmail.com', role: 'user', name: 'Outsider User', isActive: true }
  };

  const testOrgId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testOppId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const testAppId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const testMentorId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
  const testSessionId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

  // In-memory mock database store
  const mockDb = {
    organizations: new Map(),
    memberships: new Map(),
    opportunities: new Map(),
    applications: new Map(),
    mentors: new Map(),
    sessions: new Map(),
    consents: new Map()
  };

  function signTestToken(user) {
    return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
  }

  beforeAll(async () => {
    adminToken = signTestToken(mockUsers.admin);
    orgAdminToken = signTestToken(mockUsers.orgAdmin);
    trainerToken = signTestToken(mockUsers.trainer);
    juniorStudentToken = signTestToken(mockUsers.juniorStudent);
    collegeStudentToken = signTestToken(mockUsers.collegeStudent);
    outsiderToken = signTestToken(mockUsers.outsider);

    // Mock user lookup
    jest.spyOn(userModel, 'findById').mockImplementation(async (id) => {
      const match = Object.values(mockUsers).find(u => u.id === id);
      return match || null;
    });

    // Mock organization membership lookup for RBAC
    jest.spyOn(organizationModel, 'getMembership').mockImplementation(async (orgId, userId) => {
      const key = `${orgId}:${userId}`;
      return mockDb.memberships.get(key) || null;
    });

    // Mock generic DB query
    jest.spyOn(db, 'query').mockImplementation(async (text, params) => {
      return { rows: [] };
    });

    // Seed test organisation
    mockDb.organizations.set(testOrgId, {
      id: testOrgId,
      name: 'Acme AI Research Labs',
      slug: 'acme-ai-research-labs',
      org_type: 'company',
      verification_status: 'verified',
      industry_sector: 'Artificial Intelligence',
      website: 'https://acme-ai.org',
      contact_email: 'contact@acme-ai.org'
    });

    // Seed memberships
    mockDb.memberships.set(`${testOrgId}:${mockUsers.orgAdmin.id}`, {
      organization_id: testOrgId,
      user_id: mockUsers.orgAdmin.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'Active'
    });

    mockDb.memberships.set(`${testOrgId}:${mockUsers.trainer.id}`, {
      organization_id: testOrgId,
      user_id: mockUsers.trainer.id,
      role: 'TRAINER',
      status: 'Active'
    });

    // Seed opportunity
    mockDb.opportunities.set(testOppId, {
      id: testOppId,
      organization_id: testOrgId,
      organization_name: 'Acme AI Research Labs',
      title: 'Autonomous Robotics Multi-Agent Challenge',
      opportunity_type: 'project_challenge',
      description: 'Develop an empirical multi-agent reinforcement learning simulation.',
      eligibility_segments: ['junior', 'school', 'career', 'professional'],
      required_skills: ['Python', 'System Architecture'],
      stipend_or_reward: 'Rs 15,000 / Merit Certificate',
      location_type: 'remote',
      max_participants: 50,
      status: 'published',
      application_deadline: new Date(Date.now() + 86400000 * 30).toISOString()
    });

    // Seed mentor
    mockDb.mentors.set(testMentorId, {
      id: testMentorId,
      organization_id: testOrgId,
      user_id: mockUsers.trainer.id,
      mentor_name: 'Alex Mentor',
      title: 'Principal AI Architect',
      expertise_areas: ['Machine Learning', 'Reinforcement Learning'],
      max_mentees: 5,
      is_active: true
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // REQUIREMENT 1: ORGANISATION MANAGEMENT & ONBOARDING
  // =========================================================================
  describe('1. Organisation Onboarding & Registration', () => {
    it('registers a new organization with pending verification status and assigns creator as ORGANIZATION_ADMIN', async () => {
      jest.spyOn(capacityModel, 'registerOrganization').mockResolvedValueOnce({
        id: 'new-org-123',
        name: 'St. Jude International Academy',
        slug: 'st-jude-international-academy-1',
        org_type: 'school',
        verification_status: 'pending',
        industry_sector: 'K-12 Education',
        created_at: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/v1/capacity-connect/organizations')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          name: 'St. Jude International Academy',
          orgType: 'school',
          industrySector: 'K-12 Education',
          contactEmail: 'admissions@stjude.edu',
          phone: '+91 9876543200'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verification_status).toBe('pending');
      expect(res.body.data.org_type).toBe('school');
    });

    it('validates required fields on organization registration', async () => {
      const res = await request(app)
        .post('/api/v1/capacity-connect/organizations')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ orgType: 'invalid_type' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('allows platform admin to verify an organization', async () => {
      jest.spyOn(capacityModel, 'verifyOrganization').mockResolvedValueOnce({
        id: testOrgId,
        verification_status: 'verified',
        verification_notes: 'Accredited institution credentials verified.'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/organizations/${testOrgId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verificationStatus: 'verified',
          verificationNotes: 'Accredited institution credentials verified.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.verification_status).toBe('verified');
    });

    it('rejects verification requests by non-platform admins with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/capacity-connect/organizations/${testOrgId}/verify`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ verificationStatus: 'verified' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // REQUIREMENT 2: REAL DB COMPUTED DASHBOARD METRICS
  // =========================================================================
  describe('2. Organisation Dashboard Metrics', () => {
    it('returns real computed dashboard statistics for verified organization', async () => {
      jest.spyOn(capacityModel, 'getOrganizationDashboardMetrics').mockResolvedValueOnce({
        organizationId: testOrgId,
        activeOpportunities: 3,
        publishedChallenges: 2,
        totalOpportunities: 4,
        totalApplications: 12,
        totalCandidates: 10,
        applicationsBreakdown: { submitted: 4, reviewing: 3, shortlisted: 2, accepted: 2, rejected: 1, withdrawn: 0 },
        conversionRatePercentage: 16.7,
        mentorship: { activeMentors: 2, totalSessions: 6, completedSessions: 5, averageRating: 4.8 },
        skillDistribution: [{ skill: 'Python', count: 8 }, { skill: 'Machine Learning', count: 5 }],
        recentApplications: []
      });

      const res = await request(app)
        .get(`/api/v1/capacity-connect/organizations/${testOrgId}/dashboard`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeOpportunities).toBe(3);
      expect(res.body.data.totalApplications).toBe(12);
      expect(res.body.data.conversionRatePercentage).toBe(16.7);
      expect(res.body.data.mentorship.averageRating).toBe(4.8);
      expect(res.body.data.skillDistribution).toHaveLength(2);
    });

    it('blocks outsider from accessing organization dashboard (IDOR protection)', async () => {
      const res = await request(app)
        .get(`/api/v1/capacity-connect/organizations/${testOrgId}/dashboard`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // REQUIREMENT 3: TALENT DISCOVERY & MINOR PRIVACY MASKING
  // =========================================================================
  describe('3. Student Discovery with Minor Protection', () => {
    it('masks minor contact details (email and phone) for Junior and School learners when parental consent is absent', async () => {
      jest.spyOn(capacityModel, 'discoverStudents').mockResolvedValueOnce([
        {
          userId: mockUsers.juniorStudent.id,
          profileId: 'prof-junior-1',
          studentSegment: 'junior',
          academicClass: '6',
          streamOrFocus: 'STEM Curiosity',
          targetCareerPath: 'Robotics',
          xpPoints: 340,
          skills: [{ skillName: 'Scratch Logic', proficiencyLevel: 'intermediate', verified: true }],
          isMinor: true,
          privacyProtected: true,
          displayName: 'Aarav J.',
          email: 'aar***@***.com',
          phone: '[Protected Minor Contact]'
        },
        {
          userId: mockUsers.collegeStudent.id,
          profileId: 'prof-college-1',
          studentSegment: 'professional',
          academicClass: 'college_3',
          streamOrFocus: 'Computer Science',
          targetCareerPath: 'Full-Stack Software Engineering',
          xpPoints: 1200,
          skills: [{ skillName: 'Python', proficiencyLevel: 'advanced', verified: true }],
          isMinor: false,
          privacyProtected: false,
          displayName: 'Ananya College',
          email: 'ananya.college@gmail.com',
          phone: '+919876543211'
        }
      ]);

      const res = await request(app)
        .get(`/api/v1/capacity-connect/organizations/${testOrgId}/talent?skills=Python,Scratch`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.students).toHaveLength(2);

      const junior = res.body.data.students[0];
      expect(junior.isMinor).toBe(true);
      expect(junior.privacyProtected).toBe(true);
      expect(junior.email).not.toBe('aarav.junior@gmail.com');
      expect(junior.email).toContain('***@***.');
      expect(junior.phone).toBe('[Protected Minor Contact]');

      const college = res.body.data.students[1];
      expect(college.isMinor).toBe(false);
      expect(college.privacyProtected).toBe(false);
      expect(college.email).toBe('ananya.college@gmail.com');
      expect(college.phone).toBe('+919876543211');
    });

    it('unmasks contact details when parental / contact consent is explicitly granted', () => {
      const masked = capacityModel.maskMinorData(
        mockUsers.juniorStudent,
        { student_segment: 'junior' },
        false
      );
      expect(masked.privacyProtected).toBe(true);
      expect(masked.phone).toBe('[Protected Minor Contact]');

      const unmaskedWithConsent = capacityModel.maskMinorData(
        mockUsers.juniorStudent,
        { student_segment: 'junior' },
        true
      );
      expect(unmaskedWithConsent.privacyProtected).toBe(false);
      expect(unmaskedWithConsent.email).toBe('aarav.junior@gmail.com');
      expect(unmaskedWithConsent.phone).toBe('+919876543210');
    });
  });

  // =========================================================================
  // REQUIREMENT 4: OPPORTUNITY & CHALLENGE CREATION AND PUBLISHING
  // =========================================================================
  describe('4. Opportunity & Challenge Management', () => {
    it('creates and publishes a project challenge opportunity', async () => {
      jest.spyOn(capacityModel, 'createOpportunity').mockResolvedValueOnce({
        id: 'new-opp-456',
        organization_id: testOrgId,
        title: 'Deep Reinforcement Learning Navigation Challenge',
        opportunity_type: 'project_challenge',
        description: 'Implement a simulated rover obstacle avoidance agent.',
        eligibility_segments: ['career', 'professional'],
        required_skills: ['Python', 'PyTorch'],
        stipend_or_reward: 'Rs 20,000',
        location_type: 'remote',
        max_participants: 25,
        status: 'published'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/organizations/${testOrgId}/opportunities`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          title: 'Deep Reinforcement Learning Navigation Challenge',
          opportunityType: 'project_challenge',
          description: 'Implement a simulated rover obstacle avoidance agent.',
          eligibilitySegments: ['career', 'professional'],
          requiredSkills: ['Python', 'PyTorch'],
          stipendOrReward: 'Rs 20,000',
          locationType: 'remote',
          maxParticipants: 25,
          status: 'published'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.opportunity_type).toBe('project_challenge');
    });

    it('updates an existing opportunity with validation checks', async () => {
      jest.spyOn(capacityModel, 'updateOpportunity').mockResolvedValueOnce({
        id: testOppId,
        title: 'Updated Autonomous Robotics Challenge',
        max_participants: 60
      });

      const res = await request(app)
        .put(`/api/v1/capacity-connect/organizations/${testOrgId}/opportunities/${testOppId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          title: 'Updated Autonomous Robotics Challenge',
          maxParticipants: 60
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Autonomous Robotics Challenge');
    });

    it('lists published opportunities accessible to students matching segment', async () => {
      jest.spyOn(capacityModel, 'listOpportunities').mockResolvedValueOnce([
        mockDb.opportunities.get(testOppId)
      ]);

      const res = await request(app)
        .get('/api/v1/capacity-connect/opportunities?studentSegment=junior');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // REQUIREMENT 5: STUDENT APPLICATION PIPELINE & WITHDRAWAL
  // =========================================================================
  describe('5. Student Application Pipeline', () => {
    it('allows student to apply to an opportunity with a cover note and portfolio', async () => {
      jest.spyOn(capacityModel, 'applyToOpportunity').mockResolvedValueOnce({
        id: testAppId,
        opportunity_id: testOppId,
        student_id: mockUsers.collegeStudent.id,
        status: 'submitted',
        cover_note: 'Eager to build robust RL models for autonomous navigation.',
        portfolio_link: 'https://github.com/ananya/rl-agents',
        applicant_segment: 'professional'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/opportunities/${testOppId}/apply`)
        .set('Authorization', `Bearer ${collegeStudentToken}`)
        .send({
          coverNote: 'Eager to build robust RL models for autonomous navigation.',
          portfolioLink: 'https://github.com/ananya/rl-agents'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('submitted');
    });

    it('enforces idempotency and prevents duplicate application submissions', async () => {
      const ApiError = require('../src/utils/apiError');
      jest.spyOn(capacityModel, 'applyToOpportunity').mockRejectedValueOnce(
        new ApiError(409, 'You have already submitted an application for this opportunity.')
      );

      const res = await request(app)
        .post(`/api/v1/capacity-connect/opportunities/${testOppId}/apply`)
        .set('Authorization', `Bearer ${collegeStudentToken}`)
        .send({ coverNote: 'Duplicate application attempt.' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already submitted');
    });

    it('allows student to view their submitted applications', async () => {
      jest.spyOn(capacityModel, 'getStudentApplications').mockResolvedValueOnce([
        {
          id: testAppId,
          opportunity_id: testOppId,
          opportunity_title: 'Autonomous Robotics Multi-Agent Challenge',
          organization_name: 'Acme AI Research Labs',
          status: 'submitted'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/capacity-connect/my-applications')
        .set('Authorization', `Bearer ${collegeStudentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('allows organisation to review and update application status (e.g. accepted)', async () => {
      jest.spyOn(capacityModel, 'updateApplicationStatus').mockResolvedValueOnce({
        id: testAppId,
        status: 'accepted',
        reviewer_feedback: 'Outstanding portfolio and strong RL foundations.'
      });

      const res = await request(app)
        .put(`/api/v1/capacity-connect/organizations/${testOrgId}/applications/${testAppId}/status`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          status: 'accepted',
          reviewerFeedback: 'Outstanding portfolio and strong RL foundations.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');
    });

    it('allows student to withdraw application when in submitted or reviewing state', async () => {
      jest.spyOn(capacityModel, 'withdrawApplication').mockResolvedValueOnce({
        id: testAppId,
        status: 'withdrawn'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/applications/${testAppId}/withdraw`)
        .set('Authorization', `Bearer ${collegeStudentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('withdrawn');
    });

    it('prevents withdrawal of accepted application with 400', async () => {
      const ApiError = require('../src/utils/apiError');
      jest.spyOn(capacityModel, 'withdrawApplication').mockRejectedValueOnce(
        new ApiError(400, 'Cannot withdraw an application that has already been accepted.')
      );

      const res = await request(app)
        .post(`/api/v1/capacity-connect/applications/${testAppId}/withdraw`)
        .set('Authorization', `Bearer ${collegeStudentToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already been accepted');
    });
  });

  // =========================================================================
  // REQUIREMENT 6: MENTORSHIP & GUIDANCE SYSTEM
  // =========================================================================
  describe('6. Mentorship Network & Session Tracking', () => {
    it('registers an organisation mentor', async () => {
      jest.spyOn(capacityModel, 'registerMentor').mockResolvedValueOnce({
        id: testMentorId,
        organization_id: testOrgId,
        title: 'Principal AI Architect',
        expertise_areas: ['Machine Learning', 'Reinforcement Learning'],
        max_mentees: 5
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/organizations/${testOrgId}/mentors`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          title: 'Principal AI Architect',
          expertiseAreas: ['Machine Learning', 'Reinforcement Learning'],
          maxMentees: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Principal AI Architect');
    });

    it('schedules a mentorship session with agenda and meeting URL', async () => {
      jest.spyOn(capacityModel, 'scheduleMentorshipSession').mockResolvedValueOnce({
        id: testSessionId,
        mentor_id: testMentorId,
        student_id: mockUsers.collegeStudent.id,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 45,
        meeting_link: 'https://meet.google.com/abc-defg-hij',
        agenda: 'System Design and RL Distributed Simulation Review',
        status: 'scheduled'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/organizations/${testOrgId}/mentorship/schedule`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          mentorId: testMentorId,
          studentId: mockUsers.collegeStudent.id,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 45,
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          agenda: 'System Design and RL Distributed Simulation Review'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('scheduled');
      expect(res.body.data.agenda).toContain('System Design');
    });

    it('completes a session with outcome summary', async () => {
      jest.spyOn(capacityModel, 'completeMentorshipSession').mockResolvedValueOnce({
        id: testSessionId,
        status: 'completed',
        outcome_summary: 'Targeted model architecture designed with state checkpointing.'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/mentorship/sessions/${testSessionId}/complete`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          outcomeSummary: 'Targeted model architecture designed with state checkpointing.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
    });

    it('submits student feedback rating for completed session', async () => {
      jest.spyOn(capacityModel, 'submitSessionFeedback').mockResolvedValueOnce({
        id: testSessionId,
        student_feedback_rating: 5,
        student_feedback_notes: 'Extremely insightful session on scaling multi-agent environments.'
      });

      const res = await request(app)
        .post(`/api/v1/capacity-connect/mentorship/sessions/${testSessionId}/feedback`)
        .set('Authorization', `Bearer ${collegeStudentToken}`)
        .send({
          rating: 5,
          notes: 'Extremely insightful session on scaling multi-agent environments.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.student_feedback_rating).toBe(5);
    });
  });

  // =========================================================================
  // REQUIREMENT 7: STRATEGIC ANALYTICS & INSIGHTS
  // =========================================================================
  describe('7. Analytics & Reporting', () => {
    it('returns structured analytics including conversion funnel and mentorship impact', async () => {
      jest.spyOn(capacityModel, 'getOrganizationAnalyticsReport').mockResolvedValueOnce({
        organizationId: testOrgId,
        metrics: { totalApplications: 20, conversionRatePercentage: 25.0 },
        opportunitiesByType: [{ type: 'project_challenge', count: 3 }],
        applicationsBySegment: [{ segment: 'career', count: 8 }, { segment: 'professional', count: 12 }],
        mentorshipImpact: { totalHours: 12.5, averageRating: 4.9, completedSessions: 15 }
      });

      const res = await request(app)
        .get(`/api/v1/capacity-connect/organizations/${testOrgId}/analytics`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.mentorshipImpact.totalHours).toBe(12.5);
      expect(res.body.data.applicationsBySegment).toHaveLength(2);
    });
  });

  // =========================================================================
  // REQUIREMENT 8: PRIVACY & PARENTAL CONSENT CONTROLS
  // =========================================================================
  describe('8. Minor Privacy & Parental Consent Management', () => {
    it('allows student to query their current privacy consent status', async () => {
      jest.spyOn(capacityModel, 'getStudentConsent').mockResolvedValueOnce({
        student_id: mockUsers.juniorStudent.id,
        consent_type: 'contact_sharing',
        is_granted: false,
        parent_email: 'parent@home.com'
      });

      const res = await request(app)
        .get('/api/v1/capacity-connect/privacy/consent')
        .set('Authorization', `Bearer ${juniorStudentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isGranted).toBe(false);
      expect(res.body.data.parentEmail).toBe('parent@home.com');
    });

    it('allows student or parent to update consent settings', async () => {
      jest.spyOn(capacityModel, 'updateStudentConsent').mockResolvedValueOnce({
        student_id: mockUsers.juniorStudent.id,
        consent_type: 'contact_sharing',
        is_granted: true,
        parent_email: 'parent@home.com',
        granted_at: new Date().toISOString()
      });

      const res = await request(app)
        .put('/api/v1/capacity-connect/privacy/consent')
        .set('Authorization', `Bearer ${juniorStudentToken}`)
        .send({
          isGranted: true,
          parentEmail: 'parent@home.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.is_granted).toBe(true);
    });
  });
});

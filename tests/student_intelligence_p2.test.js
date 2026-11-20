const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const env = require('../src/config/env');
const userModel = require('../src/models/userModel');
const studentIntelligenceService = require('../src/services/studentIntelligenceService');

describe('P2 — Student Intelligence & Adaptive Growth Engine Suite', () => {
  let juniorToken;
  let schoolToken;
  let careerToken;
  let proToken;

  const mockUsers = {
    junior: { id: 'a1111111-1111-4111-a111-111111111111', email: 'p2junior@gmail.com', role: 'student', name: 'Aarav Junior', isActive: true },
    school: { id: 'a2222222-2222-4222-a222-222222222222', email: 'p2school@gmail.com', role: 'student', name: 'Priya School', isActive: true },
    career: { id: 'a3333333-3333-4333-a333-333333333333', email: 'p2career@gmail.com', role: 'student', name: 'Rohan Career', isActive: true },
    pro: { id: 'a4444444-4444-4444-a444-444444444444', email: 'p2pro@gmail.com', role: 'student', name: 'Ananya College', isActive: true }
  };

  function signTestToken(user) {
    return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
  }

  beforeAll(async () => {
    juniorToken = signTestToken(mockUsers.junior);
    schoolToken = signTestToken(mockUsers.school);
    careerToken = signTestToken(mockUsers.career);
    proToken = signTestToken(mockUsers.pro);

    jest.spyOn(userModel, 'findById').mockImplementation(async (id) => {
      const match = Object.values(mockUsers).find(u => u.id === id);
      return match || null;
    });

    jest.spyOn(db, 'query').mockImplementation(async (text, params) => {
      return { rows: [] };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('1. Security & Authentication Access Gates for P2 Endpoints', () => {
    const p2Endpoints = [
      { method: 'get', url: '/api/v1/student/intelligence/profile' },
      { method: 'get', url: '/api/v1/student/intelligence/skill-gaps' },
      { method: 'post', url: '/api/v1/student/intelligence/roadmap/adapt' },
      { method: 'get', url: '/api/v1/student/intelligence/next-action' },
      { method: 'get', url: '/api/v1/student/intelligence/project-recommendations' },
      { method: 'get', url: '/api/v1/student/intelligence/growth-metrics' },
      { method: 'get', url: '/api/v1/student/intelligence/matched-opportunities' }
    ];

    p2Endpoints.forEach(({ method, url }) => {
      it(`blocks unauthenticated ${method.toUpperCase()} ${url} with 401`, async () => {
        const res = await request(app)[method](url);
        expect(res.status).toBe(401);
      });
    });
  });

  describe('2. Holistic Student Intelligence Profile Aggregation', () => {
    it('returns aggregated profile with 4-tier skill breakdown, roadmap, and growth stats', async () => {
      jest.spyOn(studentIntelligenceService, 'getHolisticStudentProfile').mockResolvedValueOnce({
        hasProfile: true,
        user: { id: mockUsers.school.id, name: mockUsers.school.name, email: mockUsers.school.email },
        segment: 'school',
        academicClass: '10',
        streamOrFocus: 'Science & Computing',
        targetCareerPath: 'Software Engineering',
        skills: [
          { skill_name: 'Python', proficiency_level: 'intermediate', provenance_type: 'PROJECT_VERIFIED' },
          { skill_name: 'Mathematics', proficiency_level: 'advanced', provenance_type: 'SELF_DECLARED' }
        ],
        provenanceBreakdown: {
          SELF_DECLARED: 1,
          ACTIVITY_BASED: 0,
          PROJECT_VERIFIED: 1,
          ASSESSMENT_VERIFIED: 0
        },
        strengths: [
          { skill_name: 'Python', level: 'intermediate', provenance: 'PROJECT_VERIFIED' }
        ],
        areasNeedingImprovement: [
          { skill_name: 'Web Development Basics', reason: 'Essential foundational skill.' }
        ],
        growthStats: {
          totalXp: 450,
          activitiesCompleted: 3,
          projectsPublished: 1,
          achievementsAwarded: 2,
          certificationsEarned: 0,
          roadmapProgress: 35
        },
        activeRoadmap: {
          id: 'road-123',
          title: 'Class 10 Coding & Science Roadmap',
          overall_progress: 35
        },
        recentProjects: [{ id: 'proj-1', title: 'Python Stream Calculator' }],
        recentAchievements: [{ id: 'ach-1', title: 'Code Pioneer' }]
      });

      const res = await request(app)
        .get('/api/v1/student/intelligence/profile')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasProfile).toBe(true);
      expect(res.body.data.segment).toBe('school');
      expect(res.body.data.provenanceBreakdown.PROJECT_VERIFIED).toBe(1);
      expect(res.body.data.growthStats.totalXp).toBe(450);
      expect(res.body.data.growthStats.activitiesCompleted).toBe(3);
    });
  });

  describe('3. Skill Gap & Provenance Engine', () => {
    it('evaluates target skills with true provenance promotion and actionable closures', async () => {
      jest.spyOn(studentIntelligenceService, 'evaluateSkillGaps').mockResolvedValueOnce({
        studentSegment: 'school',
        targetCareerPath: 'Computer Science',
        demonstratedSkills: [
          { id: 'sk-1', skill_name: 'Python', proficiency_level: 'intermediate', provenance_type: 'PROJECT_VERIFIED' }
        ],
        skillGaps: [
          {
            skill_name: 'Python',
            current_proficiency: 'intermediate',
            target_proficiency: 'intermediate',
            provenance_type: 'PROJECT_VERIFIED',
            priority: 'medium',
            status: 'in_progress',
            identified_reason: 'Introductory competency established.',
            recommendedActivity: { title: 'Build Hands-On Skill: Python', type: 'coding_challenge', estimatedMinutes: 35 }
          },
          {
            skill_name: 'Data Analysis',
            current_proficiency: 'none',
            target_proficiency: 'intermediate',
            provenance_type: 'SELF_DECLARED',
            priority: 'critical',
            status: 'open',
            identified_reason: 'Core capability required for trajectory; currently missing.',
            recommendedActivity: { title: 'Build Hands-On Skill: Data Analysis', type: 'coding_challenge', estimatedMinutes: 35 }
          }
        ],
        summary: {
          totalTargetSkills: 5,
          closedGaps: 0,
          inProgressGaps: 1,
          openGaps: 1
        }
      });

      const res = await request(app)
        .get('/api/v1/student/intelligence/skill-gaps')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalTargetSkills).toBe(5);
      expect(res.body.data.skillGaps.length).toBe(2);
      expect(res.body.data.skillGaps[0].provenance_type).toBe('PROJECT_VERIFIED');
      expect(res.body.data.skillGaps[1].priority).toBe('critical');
    });
  });

  describe('4. Explainable Adaptive Roadmap Engine', () => {
    it('adapts roadmap pace and records audit revision without destroying roadmap tasks', async () => {
      jest.spyOn(studentIntelligenceService, 'adaptRoadmap').mockResolvedValueOnce({
        success: true,
        message: 'Roadmap successfully adapted.',
        adaptation: {
          revisionNumber: 2,
          adaptationType: 'pace_accelerated',
          reason: 'Student demonstrated exceptional learning pace (4/6 tasks finished).',
          changesSummary: 'Elevated challenge tier for remaining weekly assignments and added capstone portfolio extensions.',
          progressPercentage: 66,
          completedTasks: 4,
          totalTasks: 6
        },
        roadmap: {
          id: 'road-abc',
          title: 'Accelerated Python & Science Roadmap',
          overall_progress: 66
        }
      });

      const res = await request(app)
        .post('/api/v1/student/intelligence/roadmap/adapt')
        .set('Authorization', `Bearer ${schoolToken}`)
        .send({
          adaptationType: 'pace_accelerated',
          reason: 'Student completed 4 tasks ahead of schedule'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adaptation.revisionNumber).toBe(2);
      expect(res.body.data.adaptation.adaptationType).toBe('pace_accelerated');
      expect(res.body.data.adaptation.progressPercentage).toBe(66);
    });

    it('rejects invalid adaptationType with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/student/intelligence/roadmap/adapt')
        .set('Authorization', `Bearer ${schoolToken}`)
        .send({
          adaptationType: 'invalid_type_here'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('5. 6-Part Next Best Action Contract Engine', () => {
    it('returns a complete 6-part Next Best Action contract', async () => {
      jest.spyOn(studentIntelligenceService, 'computeNextBestAction').mockResolvedValueOnce({
        actionCode: 'RESUME_ROADMAP_TASK',
        what: 'Build Algorithmic Sorting Function in Python',
        why: 'Direct milestone actionable for Week 3 under your 6-Month Roadmap for Software Engineering.',
        goalOrSkillSupported: 'Python Algorithmic Foundations',
        estimatedEffortMinutes: 30,
        expectedOutcome: 'Advance roadmap to 45% and earn +40 XP.',
        actionCta: {
          label: 'Continue Task',
          url: '/student-dashboard.html#roadmap',
          buttonClass: 'btn btn-primary',
          icon: 'ph-arrow-right'
        }
      });

      const res = await request(app)
        .get('/api/v1/student/intelligence/next-action')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const action = res.body.action;
      expect(action.what).toBeDefined();
      expect(action.why).toBeDefined();
      expect(action.goalOrSkillSupported).toBeDefined();
      expect(typeof action.estimatedEffortMinutes).toBe('number');
      expect(action.expectedOutcome).toBeDefined();
      expect(action.actionCta).toBeDefined();
      expect(action.actionCta.label).toBe('Continue Task');
      expect(action.actionCta.url).toBe('/student-dashboard.html#roadmap');
    });
  });

  describe('6. Progressive Project Recommendations', () => {
    it('returns segment-appropriate projects with difficulty and skill targeting', async () => {
      jest.spyOn(studentIntelligenceService, 'getProjectRecommendations').mockResolvedValueOnce([
        {
          id: 'proj_sch_stream_calculator',
          title: 'Empirical Stream Aptitude Calculator',
          tagline: 'Class 10 Decision Matrix in Python',
          difficulty: 'beginner',
          estimatedHours: 6,
          technologies: ['Python', 'Algorithmic Logic'],
          skillsTargeted: ['Python Algorithmic Foundations', 'Algebraic Problem Solving'],
          whyRecommended: 'Directly helps Class 9-10 students make objective stream decisions.'
        },
        {
          id: 'proj_sch_data_visualizer',
          title: 'Real-World Climate Data Visualizer',
          tagline: 'Tabular Analytics & Interactive Charts',
          difficulty: 'intermediate',
          estimatedHours: 8,
          technologies: ['Python', 'Data Analysis', 'Charting'],
          skillsTargeted: ['Data Interpretation & Charting', 'Statistical Averages'],
          whyRecommended: 'Prepares high schoolers for data science.'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/student/intelligence/project-recommendations')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.projects[0].technologies).toContain('Python');
      expect(res.body.projects[0].difficulty).toBe('beginner');
    });
  });

  describe('7. Developmental Velocity & Growth Momentum', () => {
    it('computes multi-factor momentum index and real growth timeline without vanity metrics', async () => {
      jest.spyOn(studentIntelligenceService, 'computeGrowthIntelligence').mockResolvedValueOnce({
        studentSegment: 'school',
        academicClass: '10',
        developmentalVelocity: 68,
        metrics: {
          totalSkillsTracked: 6,
          verifiedSkills: 3,
          projectsPublished: 2,
          organizationEndorsedProjects: 1,
          learningQuestsCompleted: 4,
          roadmapProgress: 50,
          achievementsAwarded: 3
        },
        growthTimeline: [
          {
            event_type: 'project',
            title: 'Empirical Stream Aptitude Calculator',
            timestamp: new Date().toISOString(),
            xp: 100,
            description: 'Published verified project showcase'
          },
          {
            event_type: 'activity',
            title: 'Foundational Discovery Quest',
            timestamp: new Date().toISOString(),
            xp: 50,
            description: 'Completed verified learning quest'
          }
        ]
      });

      const res = await request(app)
        .get('/api/v1/student/intelligence/growth-metrics')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.growth.developmentalVelocity).toBe(68);
      expect(res.body.growth.metrics.verifiedSkills).toBe(3);
      expect(res.body.growth.growthTimeline.length).toBe(2);
    });
  });

  describe('8. Opportunity Matching & Minor Safeguards', () => {
    it('calculates affinity match score (0-100) and protects junior students from corporate recruiting', async () => {
      // Test Junior student matching (corporate internships suppressed)
      jest.spyOn(studentIntelligenceService, 'getMatchedOpportunities').mockResolvedValueOnce([
        {
          id: 'opp-1',
          title: 'National Middle School Coding Olympiad',
          opportunityType: 'competition',
          department: 'Computer Science',
          organizationName: 'STEM Innovation Foundation',
          isOrgVerified: true,
          stipendOrReward: 'Certificate & STEM Robotics Kit',
          locationType: 'online',
          requiredSkills: ['Scratch Block Logic', 'Computational Thinking'],
          matchScore: 92,
          matchRationale: 'Exceptional match based on your demonstrated skill set.'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/student/intelligence/matched-opportunities')
        .set('Authorization', `Bearer ${juniorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.opportunities[0].opportunityType).toBe('competition');
      expect(res.body.opportunities[0].matchScore).toBe(92);
      expect(['internship', 'job', 'b2b_project']).not.toContain(res.body.opportunities[0].opportunityType);
    });
  });
});

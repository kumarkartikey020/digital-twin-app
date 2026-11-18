const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const env = require('../src/config/env');
const userModel = require('../src/models/userModel');
const studentIntelligenceModel = require('../src/models/studentIntelligenceModel');

describe('Student Intelligence System & Multi-Segment Ecosystem', () => {
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

  function signTestToken(user) {
    return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
  }

  beforeAll(async () => {
    // Generate valid test JWT tokens for each simulated student segment
    juniorToken = signTestToken(mockUsers.junior);
    schoolToken = signTestToken(mockUsers.school);
    careerToken = signTestToken(mockUsers.career);
    proToken = signTestToken(mockUsers.pro);

    // Mock user lookup for authentication middleware
    jest.spyOn(userModel, 'findById').mockImplementation(async (id) => {
      const match = Object.values(mockUsers).find(u => u.id === id);
      return match || null;
    });

    // Mock audit log insert in auth middleware for non-GET requests
    jest.spyOn(db, 'query').mockImplementation(async (text) => {
      return { rows: [] };
    });
  });

  describe('1. Security & Authentication Access Gates', () => {
    it('blocks unauthenticated requests to /api/v1/student/profile with 401', async () => {
      const res = await request(app).get('/api/v1/student/profile');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/dashboard with 401', async () => {
      const res = await request(app).get('/api/v1/student/dashboard');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/onboarding with 401', async () => {
      const res = await request(app).post('/api/v1/student/onboarding').send({});
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated requests to /api/v1/student/activities with 401', async () => {
      const res = await request(app).get('/api/v1/student/activities');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Segment Determination Logic', () => {
    it('correctly maps classes 5-8 to DTV Junior segment', () => {
      expect(studentIntelligenceModel.determineSegment('5')).toBe('junior');
      expect(studentIntelligenceModel.determineSegment('6')).toBe('junior');
      expect(studentIntelligenceModel.determineSegment('7')).toBe('junior');
      expect(studentIntelligenceModel.determineSegment('8')).toBe('junior');
      expect(studentIntelligenceModel.determineSegment('Class 7')).toBe('junior');
    });

    it('correctly maps classes 9-10 to DTV School segment', () => {
      expect(studentIntelligenceModel.determineSegment('9')).toBe('school');
      expect(studentIntelligenceModel.determineSegment('10')).toBe('school');
      expect(studentIntelligenceModel.determineSegment('Class 10')).toBe('school');
    });

    it('correctly maps classes 11-12 to DTV Career segment', () => {
      expect(studentIntelligenceModel.determineSegment('11')).toBe('career');
      expect(studentIntelligenceModel.determineSegment('12')).toBe('career');
      expect(studentIntelligenceModel.determineSegment('Grade 12')).toBe('career');
    });

    it('correctly maps higher education to DTV Professional segment', () => {
      expect(studentIntelligenceModel.determineSegment('college_1')).toBe('professional');
      expect(studentIntelligenceModel.determineSegment('college_3')).toBe('professional');
      expect(studentIntelligenceModel.determineSegment('postgraduate')).toBe('professional');
      expect(studentIntelligenceModel.determineSegment('1st Year BTech')).toBe('professional');
    });
  });

  describe('3. Student Onboarding Workflow & Persistence', () => {
    it('rejects onboarding without required academic class with 400', async () => {
      const res = await request(app)
        .post('/api/v1/student/onboarding')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          streamOrFocus: 'STEM'
        });
      expect(res.status).toBe(400);
    });

    it('successfully processes full onboarding for a Junior student', async () => {
      const mockProfileId = 'aaaa-bbbb-cccc-dddd';
      jest.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const client = {
          query: jest.fn().mockImplementation((text, params) => {
            if (text.includes('INSERT INTO student_intelligence_profiles')) {
              return {
                rows: [{
                  id: mockProfileId,
                  user_id: mockUsers.junior.id,
                  student_segment: 'junior',
                  academic_class: '7',
                  stream_or_focus: 'Foundational STEM',
                  onboarding_completed: true,
                  xp_points: 0
                }]
              };
            }
            if (text.includes('SELECT count(*)::int AS count FROM student_recommendations')) {
              return { rows: [{ count: 0 }] };
            }
            return { rows: [] };
          })
        };
        return callback(client);
      });

      jest.spyOn(studentIntelligenceModel, 'getProfileByUserId').mockResolvedValue({
        id: mockProfileId,
        user_id: mockUsers.junior.id,
        name: mockUsers.junior.name,
        email: mockUsers.junior.email,
        student_segment: 'junior',
        academic_class: '7',
        stream_or_focus: 'Foundational STEM',
        onboarding_completed: true,
        xp_points: 0,
        interests: [{ interest_name: 'Robotics', category: 'stem' }],
        skills: [{ skill_name: 'Scratch Logic', proficiency_level: 'beginner', verified: false }],
        segmentMeta: studentIntelligenceModel.SEGMENT_META.junior
      });

      const res = await request(app)
        .post('/api/v1/student/onboarding')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({
          academicClass: '7',
          streamOrFocus: 'Foundational STEM',
          targetCareerPath: 'Robotics Creator',
          interests: ['Robotics'],
          skills: [{ name: 'Scratch Logic', level: 'beginner' }]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.student_segment).toBe('junior');
      expect(res.body.profile.academic_class).toBe('7');
    });
  });

  describe('4. Dynamic Dashboard & Metric Calculations (Zero Fabricated Statistics)', () => {
    it('returns dynamic metrics derived strictly from actual completed activities', async () => {
      const mockActivities = [
        { id: 'act-1', activity_code: 'sch_stream_matrix', title: 'Class 10 Stream Discovery', xp_reward: 75, is_completed: true, category: 'aptitude' },
        { id: 'act-2', activity_code: 'sch_python_basics', title: 'Python Fundamentals', xp_reward: 80, is_completed: false, category: 'skill_builder' },
        { id: 'act-3', activity_code: 'sch_board_balance', title: 'Board Exam Strategy', xp_reward: 50, is_completed: false, category: 'project' },
        { id: 'act-4', activity_code: 'sch_data_science_intro', title: 'Data Analysis Intro', xp_reward: 70, is_completed: false, category: 'exploration' }
      ];

      const mockProfile = {
        id: 'prof-school',
        user_id: mockUsers.school.id,
        name: mockUsers.school.name,
        email: mockUsers.school.email,
        student_segment: 'school',
        academic_class: '10',
        stream_or_focus: 'Class 10 General',
        target_career_path: 'AI Architect',
        weekly_goal_hours: 6.0,
        onboarding_completed: true,
        xp_points: 75,
        interests: [{ interest_name: 'Coding' }],
        skills: [{ skill_name: 'Python', proficiency_level: 'beginner', verified: false }],
        segmentMeta: studentIntelligenceModel.SEGMENT_META.school
      };

      jest.spyOn(studentIntelligenceModel, 'getProfileByUserId').mockResolvedValue(mockProfile);
      jest.spyOn(studentIntelligenceModel, 'getSegmentActivities').mockResolvedValue(mockActivities);
      jest.spyOn(studentIntelligenceModel, 'getRecommendations').mockResolvedValue([
        {
          id: 'rec-1',
          item_type: 'activity',
          item_id: 'sch_stream_matrix',
          title: 'Class 10 Stream Discovery',
          description: 'Assess strengths across streams',
          relevance_score: 98,
          reason_text: 'Essential milestone for Class 10 to establish empirical aptitude baseline.'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/student/dashboard')
        .set('Authorization', `Bearer ${schoolToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const dash = res.body.dashboard;
      expect(dash.hasProfile).toBe(true);
      expect(dash.profile.segment).toBe('school');

      // Metric derivations: 1 of 4 completed -> 25% exactly
      expect(dash.metrics.totalActivities).toBe(4);
      expect(dash.metrics.completedCount).toBe(1);
      expect(dash.metrics.progressPercentage).toBe(25);
      expect(dash.metrics.totalXp).toBe(75);
      expect(dash.metrics.skillsCount).toBe(1);

      // Recommendations must contain explicit reasoning
      expect(dash.recommendations.length).toBeGreaterThan(0);
      expect(dash.recommendations[0].reason_text).toContain('Class 10');
    });
  });

  describe('5. Activity Completion & Immediate Progress Updates', () => {
    it('completes an activity and returns updated progress and awarded XP', async () => {
      jest.spyOn(studentIntelligenceModel, 'completeActivity').mockResolvedValue({
        completion: { id: 'comp-1', status: 'completed' },
        activityTitle: 'Class 10 Stream Discovery & Aptitude Audit',
        xpAwarded: 75
      });

      jest.spyOn(studentIntelligenceModel, 'getDashboardData').mockResolvedValue({
        hasProfile: true,
        metrics: {
          progressPercentage: 50,
          totalActivities: 4,
          completedCount: 2,
          skillsCount: 2,
          totalXp: 155
        }
      });

      const res = await request(app)
        .post('/api/v1/student/activities/sch_stream_matrix/complete')
        .set('Authorization', `Bearer ${schoolToken}`)
        .send({ notes: 'Completed full stream aptitude matrix.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.xpAwarded).toBe(75);
      expect(res.body.metrics.progressPercentage).toBe(50);
      expect(res.body.metrics.completedCount).toBe(2);
    });
  });
});

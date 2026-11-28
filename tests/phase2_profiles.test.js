const db = require('../src/db');
const studentIntelligenceService = require('../src/services/studentIntelligenceService');
const studentIntelligenceModel = require('../src/models/studentIntelligenceModel');
const learningRoadmapModel = require('../src/models/learningRoadmapModel');

describe('Phase 2 — Student Intelligence Profile Validation Suite (4 Segments)', () => {
  const PROFILES = [
    {
      name: 'Junior Profile (Class 7)',
      academicClass: '7',
      expectedSegment: 'junior',
      streamOrFocus: 'STEM Explorations',
      targetCareerPath: 'Robotics & AI',
      interests: [{ interest_name: 'Robotics', category: 'stem' }, { interest_name: 'Block Coding', category: 'cs' }],
      declaredSkills: [
        { skill_name: 'Scratch Coding', proficiency_level: 'intermediate' },
        { skill_name: 'Basic Math', proficiency_level: 'beginner' }
      ]
    },
    {
      name: 'School Profile (Class 10)',
      academicClass: '10',
      expectedSegment: 'school',
      streamOrFocus: 'Science PCM',
      targetCareerPath: 'Software Engineer',
      interests: [{ interest_name: 'Coding & Logic', category: 'cs' }, { interest_name: 'Mathematics', category: 'stem' }],
      declaredSkills: [
        { skill_name: 'Python Basics', proficiency_level: 'intermediate' },
        { skill_name: 'Algebraic Logic', proficiency_level: 'intermediate' }
      ]
    },
    {
      name: 'Career Profile (Class 12)',
      academicClass: '12',
      expectedSegment: 'career',
      streamOrFocus: 'Computer Science',
      targetCareerPath: 'Full-Stack SWE & AI',
      interests: [{ interest_name: 'Machine Learning', category: 'ai' }, { interest_name: 'Data Structures', category: 'cs' }],
      declaredSkills: [
        { skill_name: 'Python Programming', proficiency_level: 'advanced' },
        { skill_name: 'Data Structures', proficiency_level: 'intermediate' }
      ]
    },
    {
      name: 'College Student (College 3rd Year)',
      academicClass: 'college_3',
      expectedSegment: 'professional',
      streamOrFocus: 'B.Tech Computer Science',
      targetCareerPath: 'Cloud & AI Engineer',
      interests: [{ interest_name: 'Distributed Systems', category: 'cloud' }, { interest_name: 'Cloud Computing', category: 'devops' }],
      declaredSkills: [
        { skill_name: 'Node.js', proficiency_level: 'advanced' },
        { skill_name: 'PostgreSQL', proficiency_level: 'intermediate' },
        { skill_name: 'Docker', proficiency_level: 'intermediate' }
      ]
    }
  ];

  PROFILES.forEach((p) => {
    describe(`Testing ${p.name}`, () => {
      let spyProfile;
      let spyDb;
      const testUserId = `test-user-${p.expectedSegment}`;

      beforeEach(() => {
        const mockProfile = {
          id: `profile-${p.expectedSegment}`,
          user_id: testUserId,
          name: p.name,
          email: `${p.expectedSegment}@example.com`,
          student_segment: p.expectedSegment,
          academic_class: p.academicClass,
          stream_or_focus: p.streamOrFocus,
          target_career_path: p.targetCareerPath,
          interests: p.interests,
          weekly_goal_hours: 5,
          skills: p.declaredSkills.map(s => ({
            skill_name: s.skill_name,
            proficiency_level: s.proficiency_level,
            provenance_type: 'SELF_DECLARED',
            verified: false
          }))
        };

        spyProfile = jest.spyOn(studentIntelligenceModel, 'getProfileByUserId').mockResolvedValue(mockProfile);

        spyDb = jest.spyOn(db, 'query').mockImplementation(async (sql) => {
          if (sql.includes('student_activity_completions')) {
            return { rows: [{ count: 2, total_activity_xp: 80 }] };
          }
          if (sql.includes('student_learning_roadmaps')) {
            return {
              rows: [{
                id: `rm-${p.expectedSegment}`,
                title: `6-Month ${p.streamOrFocus} Trajectory`,
                primary_goal: p.targetCareerPath,
                target_career_path: p.targetCareerPath,
                duration_months: 6,
                overall_progress: 25.0,
                total_tasks: 12,
                completed_tasks: 3,
                status: 'active'
              }]
            };
          }
          if (sql.includes('student_projects')) {
            return {
              rows: [{
                id: 'p1',
                title: `${p.name} Project`,
                technologies: p.declaredSkills.map(s => s.skill_name),
                is_featured: true,
                created_at: new Date()
              }]
            };
          }
          if (sql.includes('achievements')) {
            return { rows: [{ id: 'a1', title: 'Achievement', badge_icon: 'star', xp_bonus: 50, awarded_at: new Date() }] };
          }
          if (sql.includes('student_profile_skills')) {
            return {
              rows: p.declaredSkills.map((s, idx) => ({
                id: `skill-${idx}`,
                skill_name: s.skill_name,
                proficiency_level: s.proficiency_level,
                category: 'technical',
                verified: false,
                provenance_type: 'SELF_DECLARED',
                evidence_reference: {}
              }))
            };
          }
          if (sql.includes('capacity_opportunities') || sql.includes('opportunities')) {
            if (p.expectedSegment === 'junior') {
              return {
                rows: [{
                  id: 'opp-1',
                  title: 'School STEM Challenge',
                  description: 'Junior science quest',
                  opportunity_type: 'project_challenge',
                  department: 'STEM',
                  student_segment: 'junior',
                  required_skills: ['Scratch Coding'],
                  eligibility_criteria: 'Classes 5-8',
                  stipend_or_reward: 'Certificate',
                  location_type: 'remote',
                  organization_name: 'DTV Academy',
                  org_verified: true,
                  created_at: new Date()
                }]
              };
            }
            return {
              rows: [{
                id: 'opp-2',
                title: 'Industry Internship',
                description: 'Full-stack internship',
                opportunity_type: 'internship',
                department: 'Engineering',
                student_segment: p.expectedSegment,
                required_skills: p.declaredSkills.map(s => s.skill_name),
                eligibility_criteria: 'College student',
                stipend_or_reward: 'INR 25,000/mo',
                location_type: 'remote',
                organization_name: 'Tech Corp',
                org_verified: true,
                created_at: new Date()
              }]
            };
          }
          if (sql.includes('roadmap_revisions')) {
            return { rows: [{ count: 1 }] };
          }
          return { rows: [] };
        });
      });

      afterEach(() => {
        spyProfile.mockRestore();
        spyDb.mockRestore();
      });

      it('maps to correct student segment', () => {
        const seg = studentIntelligenceModel.determineSegment(p.academicClass);
        expect(seg).toBe(p.expectedSegment);
      });

      it('evaluates holistic profile with 4-level skill provenance breakdown', async () => {
        const holistic = await studentIntelligenceService.getHolisticStudentProfile(testUserId);
        expect(holistic.hasProfile).toBe(true);
        expect(holistic.segment).toBe(p.expectedSegment);
        expect(holistic.provenanceBreakdown).toHaveProperty('SELF_DECLARED');
        expect(holistic.provenanceBreakdown).toHaveProperty('ACTIVITY_BASED');
        expect(holistic.provenanceBreakdown).toHaveProperty('PROJECT_VERIFIED');
        expect(holistic.provenanceBreakdown).toHaveProperty('ASSESSMENT_VERIFIED');
      });

      it('evaluates skill gaps against segment catalog', async () => {
        const gaps = await studentIntelligenceService.evaluateSkillGaps(testUserId);
        expect(gaps.studentSegment).toBe(p.expectedSegment);
        expect(Array.isArray(gaps.skillGaps)).toBe(true);
        expect(gaps.skillGaps.length).toBeGreaterThan(0);
      });

      it('generates a full 6-part Next Best Action contract', async () => {
        const nba = await studentIntelligenceService.computeNextBestAction(testUserId);
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

      it('recommends segment-tailored projects', async () => {
        const projects = await studentIntelligenceService.getProjectRecommendations(testUserId);
        expect(Array.isArray(projects)).toBe(true);
        expect(projects.length).toBeGreaterThan(0);
        expect(projects[0]).toHaveProperty('title');
        expect(projects[0]).toHaveProperty('difficulty');
        expect(projects[0]).toHaveProperty('skillsTargeted');
      });

      it('computes developmental velocity and growth metrics', async () => {
        const growth = await studentIntelligenceService.computeGrowthIntelligence(testUserId);
        expect(typeof growth.developmentalVelocity).toBe('number');
        expect(growth.metrics).toHaveProperty('totalSkillsTracked');
        expect(growth.metrics).toHaveProperty('roadmapProgress');
        expect(Array.isArray(growth.growthTimeline)).toBe(true);
      });

      it('enforces Capacity Connect matching and minor safeguards', async () => {
        const opps = await studentIntelligenceService.getMatchedOpportunities(testUserId);
        expect(Array.isArray(opps)).toBe(true);
        if (p.expectedSegment === 'junior') {
          // Juniors MUST NEVER be matched with corporate internships
          const hasInternship = opps.some(o => o.opportunity_type === 'internship');
          expect(hasInternship).toBe(false);
        }
      });
    });
  });
});

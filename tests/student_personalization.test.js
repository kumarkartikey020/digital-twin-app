const DTV = require('../public/js/dtv-student-core.js');

describe('DTV Student Personalization & Experience Engine (P1)', () => {

    describe('1. Academic Class to Segment Determination', () => {
        test('Maps Classes 5 through 8 to Junior segment', () => {
            const juniorClasses = ['5', '6', '7', '8', 'Class 5', 'class 6', 'grade 7', 'Class 8', 'junior', 'middle school'];
            juniorClasses.forEach(cls => {
                expect(DTV.Personalization.determineSegment(cls)).toBe('junior');
            });
        });

        test('Maps Classes 9 and 10 to School segment', () => {
            const schoolClasses = ['9', '10', 'Class 9', 'class 10', 'grade 9', 'Grade 10', 'secondary', 'high school'];
            schoolClasses.forEach(cls => {
                expect(DTV.Personalization.determineSegment(cls)).toBe('school');
            });
        });

        test('Maps Classes 11 and 12 to Career segment', () => {
            const careerClasses = ['11', '12', 'Class 11', 'class 12', 'grade 11', 'grade 12', '11th', '12th', 'senior secondary'];
            careerClasses.forEach(cls => {
                expect(DTV.Personalization.determineSegment(cls)).toBe('career');
            });
        });

        test('Maps College and Higher Education to Professional segment', () => {
            const proClasses = ['college_1', 'college_2', 'college_3', 'college_4', 'btech', 'undergraduate', 'postgraduate', 'masters', 'degree'];
            proClasses.forEach(cls => {
                expect(DTV.Personalization.determineSegment(cls)).toBe('professional');
            });
        });

        test('Defaults to School segment if academicClass is missing or null', () => {
            expect(DTV.Personalization.determineSegment(null)).toBe('school');
            expect(DTV.Personalization.determineSegment(undefined)).toBe('school');
            expect(DTV.Personalization.determineSegment('')).toBe('school');
        });
    });

    describe('2. Segment Metadata & Focus Pillars', () => {
        const segments = ['junior', 'school', 'career', 'professional'];

        test('Every segment has required metadata fields and distinct branding colors', () => {
            const colors = new Set();
            segments.forEach(seg => {
                const meta = DTV.Personalization.SEGMENT_META[seg];
                expect(meta).toBeDefined();
                expect(meta.displayName).toBeDefined();
                expect(meta.tagline).toBeDefined();
                expect(meta.themeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
                expect(Array.isArray(meta.focusPillars)).toBe(true);
                expect(meta.focusPillars.length).toBeGreaterThanOrEqual(3);
                expect(Array.isArray(meta.kpis)).toBe(true);
                expect(meta.kpis.length).toBe(4);
                colors.add(meta.themeColor);
            });
            // Ensure 4 distinct theme colors
            expect(colors.size).toBe(4);
        });

        test('Junior segment is marked as minor and suppresses corporate sections', () => {
            const junior = DTV.Personalization.SEGMENT_META.junior;
            expect(junior.isMinor).toBe(true);
            expect(junior.hiddenSections).toContain('capacity-connect-b2b');
            expect(junior.hiddenSections).toContain('corporate-internships');
        });

        test('School segment is marked as minor', () => {
            const school = DTV.Personalization.SEGMENT_META.school;
            expect(school.isMinor).toBe(true);
            expect(school.hiddenSections).toContain('corporate-internships');
        });

        test('Career and Professional segments are non-minor for recruitment and opportunities', () => {
            expect(DTV.Personalization.SEGMENT_META.career.isMinor).toBe(false);
            expect(DTV.Personalization.SEGMENT_META.professional.isMinor).toBe(false);
        });
    });

    describe('3. Dynamic NEXT STEP Decision Engine', () => {
        test('Returns profile setup step when dashboard has no profile', () => {
            const step = DTV.Personalization.computeNextStep(null, null);
            expect(step.badge).toBe('PROFILE SETUP PENDING');
            expect(step.actionType).toBe('modal');
            expect(step.target).toBe('onboarding-modal');
        });

        test('Returns interests discovery step when profile has zero interests', () => {
            const dash = {
                hasProfile: true,
                profile: { segment: 'school', academicClass: '10', interests: [] },
                activities: []
            };
            const step = DTV.Personalization.computeNextStep(dash, null);
            expect(step.badge).toBe('DISCOVERY INCOMPLETE');
            expect(step.actionType).toBe('modal');
        });

        test('Returns first quest step when 0 activities completed', () => {
            const dash = {
                hasProfile: true,
                profile: { segment: 'school', academicClass: '10', interests: ['Math', 'Science'] },
                activities: [
                    { id: 'quest_1', title: 'Stream Discovery', description: 'Audit your strengths', why_explanation_template: 'Why', is_completed: false }
                ]
            };
            const step = DTV.Personalization.computeNextStep(dash, null);
            expect(step.badge).toBe('RECOMMENDED QUEST');
            expect(step.actionType).toBe('quest');
            expect(step.target).toBe('quest_1');
        });

        test('Returns active roadmap milestone step when quests are done and roadmap task is in progress', () => {
            const dash = {
                hasProfile: true,
                profile: { segment: 'career', academicClass: '11', interests: ['JEE', 'Physics'] },
                activities: [
                    { id: 'q1', is_completed: true }
                ]
            };
            const roadmap = {
                milestones: [
                    {
                        month_number: 1,
                        title: 'Foundations',
                        tasks: [
                            { id: 'task_1', title: 'Kinematics Drill', description: 'Solve 20 problems', status: 'in_progress' }
                        ]
                    }
                ]
            };
            const step = DTV.Personalization.computeNextStep(dash, roadmap);
            expect(step.badge).toBe('ACTIVE ROADMAP MILESTONE');
            expect(step.actionType).toBe('task');
            expect(step.target).toBe('task_1');
        });

        test('Returns portfolio prompt when quests and roadmap are done but 0 showcase projects published', () => {
            const dash = {
                hasProfile: true,
                profile: { segment: 'professional', academicClass: 'college_3', interests: ['Full-stack'] },
                activities: [{ id: 'q1', is_completed: true }]
            };
            const roadmap = {
                milestones: [{ month_number: 1, tasks: [{ id: 't1', status: 'completed' }] }]
            };
            const portfolio = {
                projects: []
            };
            const step = DTV.Personalization.computeNextStep(dash, roadmap, portfolio);
            expect(step.badge).toBe('SHOWCASE READY');
            expect(step.actionType).toBe('link');
            expect(step.target).toBe('/student-portfolio');
        });

        test('Returns celebration milestone when student is fully up to date', () => {
            const dash = {
                hasProfile: true,
                profile: { segment: 'school', academicClass: '10', interests: ['Python'] },
                activities: [{ id: 'q1', is_completed: true }]
            };
            const roadmap = {
                milestones: [{ month_number: 1, tasks: [{ id: 't1', status: 'completed' }] }]
            };
            const portfolio = {
                projects: [{ id: 'p1', title: 'Solar Calculator' }]
            };
            const opportunities = { data: [] };
            const step = DTV.Personalization.computeNextStep(dash, roadmap, portfolio, opportunities);
            expect(step.badge).toBe('ALL MILESTONES CLEARED');
        });
    });

    describe('4. Minor Protection Safeguards', () => {
        test('isMinorSegment accurately flags junior and school segments only', () => {
            expect(DTV.Privacy.isMinorSegment('junior')).toBe(true);
            expect(DTV.Privacy.isMinorSegment('school')).toBe(true);
            expect(DTV.Privacy.isMinorSegment('career')).toBe(false);
            expect(DTV.Privacy.isMinorSegment('professional')).toBe(false);
        });
    });

    describe('5. Unified Multi-Storage Auth Resolution', () => {
        beforeEach(() => {
            global.localStorage = {
                getItem: jest.fn(),
                setItem: jest.fn(),
                removeItem: jest.fn()
            };
            global.sessionStorage = {
                getItem: jest.fn(),
                setItem: jest.fn(),
                removeItem: jest.fn()
            };
        });

        test('Resolves token from dt_appdata_v3 in sessionStorage', () => {
            global.sessionStorage.getItem.mockReturnValueOnce(JSON.stringify({
                userData: { token: 'jwt_session_token_123', name: 'Aarav' }
            }));
            expect(DTV.Auth.getToken()).toBe('jwt_session_token_123');
        });

        test('Resolves token from standard localStorage accessToken key', () => {
            global.sessionStorage.getItem.mockReturnValueOnce(null);
            global.localStorage.getItem.mockImplementation(key => {
                if (key === 'accessToken') return 'jwt_local_access_token_456';
                return null;
            });
            expect(DTV.Auth.getToken()).toBe('jwt_local_access_token_456');
        });

        test('Resolves token from dt_user JSON in localStorage', () => {
            global.sessionStorage.getItem.mockReturnValueOnce(null);
            global.localStorage.getItem.mockImplementation(key => {
                if (key === 'dt_user') return JSON.stringify({ token: 'jwt_user_object_token_789' });
                return null;
            });
            expect(DTV.Auth.getToken()).toBe('jwt_user_object_token_789');
        });

        test('Generates correct Authorization Bearer header', () => {
            global.sessionStorage.getItem.mockReturnValueOnce(JSON.stringify({
                userData: { token: 'valid_jwt_header_token' }
            }));
            const headers = DTV.Auth.getAuthHeaders();
            expect(headers['Authorization']).toBe('Bearer valid_jwt_header_token');
            expect(headers['Accept']).toBe('application/json');
        });
    });
});

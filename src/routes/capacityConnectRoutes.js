const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { requireOrganizationMembership } = require('../middlewares/rbac');
const capacityCtrl = require('../controllers/capacityConnectController');

const router = express.Router();

// Public / Discovery routes (unauthenticated or public verified view)
router.get('/organizations', capacityCtrl.listOrganizations);
router.get('/opportunities', capacityCtrl.listOpportunities);
router.get('/opportunities/:opportunityId', capacityCtrl.getOpportunity);
router.get('/mentors', capacityCtrl.listAvailableMentors);

// All subsequent routes require valid user authentication
router.use(authenticate);

// 1. ORGANISATION ONBOARDING & MANAGEMENT
const registerOrgSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    orgType: Joi.string().valid('school', 'college', 'university', 'company', 'training_institution').default('company'),
    description: Joi.string().max(2000).allow('', null).optional(),
    website: Joi.string().uri().max(255).allow('', null).optional(),
    contactEmail: Joi.string().email().max(255).allow('', null).optional(),
    phone: Joi.string().max(50).allow('', null).optional(),
    address: Joi.string().max(500).allow('', null).optional(),
    industrySector: Joi.string().max(128).allow('', null).optional(),
    logoUrl: Joi.string().uri().max(500).allow('', null).optional()
  }).required()
});

router.post('/organizations', validate(registerOrgSchema), capacityCtrl.registerOrganization);

// Verification (Admin only)
const verifyOrgSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    verificationStatus: Joi.string().valid('verified', 'rejected', 'pending').required(),
    verificationNotes: Joi.string().max(1000).allow('', null).optional()
  }).required()
});
router.post('/organizations/:organizationId/verify', validate(verifyOrgSchema), capacityCtrl.verifyOrganization);

// 2. TENANT-SCOPED ORGANISATION ROUTES
const orgParamSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required()
});

router.get(
  '/organizations/:organizationId',
  validate(orgParamSchema),
  requireOrganizationMembership,
  capacityCtrl.getOrganization
);

router.put(
  '/organizations/:organizationId',
  validate(orgParamSchema),
  requireOrganizationMembership,
  capacityCtrl.updateOrganization
);

// Dashboard & Analytics
router.get(
  '/organizations/:organizationId/dashboard',
  validate(orgParamSchema),
  requireOrganizationMembership,
  capacityCtrl.getOrganizationDashboard
);

router.get(
  '/organizations/:organizationId/analytics',
  validate(orgParamSchema),
  requireOrganizationMembership,
  capacityCtrl.getOrganizationAnalytics
);

// Talent Discovery
const discoverTalentSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  query: Joi.object({
    skills: Joi.string().allow('', null).optional(),
    segment: Joi.string().valid('junior', 'school', 'career', 'professional').optional(),
    search: Joi.string().max(100).allow('', null).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }).optional()
});

router.get(
  '/organizations/:organizationId/talent',
  validate(discoverTalentSchema),
  requireOrganizationMembership,
  capacityCtrl.discoverTalent
);

// Opportunities Management
const createOppSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    title: Joi.string().min(3).max(255).required(),
    opportunityType: Joi.string().valid(
      'project_challenge', 'skill_programme', 'internship', 'workshop', 'competition', 'learning_opportunity'
    ).required(),
    description: Joi.string().min(10).required(),
    eligibilitySegments: Joi.array().items(
      Joi.string().valid('junior', 'school', 'career', 'professional')
    ).default(['junior', 'school', 'career', 'professional']),
    requiredSkills: Joi.array().items(Joi.string().max(100)).default([]),
    stipendOrReward: Joi.string().max(255).allow('', null).optional(),
    locationType: Joi.string().valid('remote', 'hybrid', 'on_site').default('remote'),
    locationDetails: Joi.string().max(255).allow('', null).optional(),
    applicationDeadline: Joi.date().iso().allow(null).optional(),
    maxParticipants: Joi.number().integer().min(1).max(10000).default(50),
    status: Joi.string().valid('draft', 'published', 'closed', 'archived').default('published')
  }).required()
});

router.post(
  '/organizations/:organizationId/opportunities',
  validate(createOppSchema),
  requireOrganizationMembership,
  capacityCtrl.createOpportunity
);

const updateOppSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required(),
    opportunityId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    title: Joi.string().min(3).max(255).optional(),
    opportunityType: Joi.string().valid(
      'project_challenge', 'skill_programme', 'internship', 'workshop', 'competition', 'learning_opportunity'
    ).optional(),
    description: Joi.string().min(10).optional(),
    eligibilitySegments: Joi.array().items(
      Joi.string().valid('junior', 'school', 'career', 'professional')
    ).optional(),
    requiredSkills: Joi.array().items(Joi.string().max(100)).optional(),
    stipendOrReward: Joi.string().max(255).allow('', null).optional(),
    locationType: Joi.string().valid('remote', 'hybrid', 'on_site').optional(),
    locationDetails: Joi.string().max(255).allow('', null).optional(),
    applicationDeadline: Joi.date().iso().allow(null).optional(),
    maxParticipants: Joi.number().integer().min(1).max(10000).optional(),
    status: Joi.string().valid('draft', 'published', 'closed', 'archived').optional()
  }).required()
});

router.put(
  '/organizations/:organizationId/opportunities/:opportunityId',
  validate(updateOppSchema),
  requireOrganizationMembership,
  capacityCtrl.updateOpportunity
);

// Review Applications in Org
const listOrgAppsSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  query: Joi.object({
    opportunityId: Joi.string().uuid().optional(),
    status: Joi.string().valid('submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected', 'withdrawn').optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }).optional()
});

router.get(
  '/organizations/:organizationId/applications',
  validate(listOrgAppsSchema),
  requireOrganizationMembership,
  capacityCtrl.getOrganizationApplications
);

const updateAppStatusSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required(),
    applicationId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    status: Joi.string().valid('submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected').required(),
    reviewerFeedback: Joi.string().max(1000).allow('', null).optional()
  }).required()
});

router.put(
  '/organizations/:organizationId/applications/:applicationId/status',
  validate(updateAppStatusSchema),
  requireOrganizationMembership,
  capacityCtrl.updateApplicationStatus
);

// Mentors in Org
const registerMentorSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    userId: Joi.string().uuid().optional(),
    title: Joi.string().min(2).max(255).required(),
    bio: Joi.string().max(2000).allow('', null).optional(),
    expertiseAreas: Joi.array().items(Joi.string().max(100)).default([]),
    maxMentees: Joi.number().integer().min(1).max(50).default(5)
  }).required()
});

router.post(
  '/organizations/:organizationId/mentors',
  validate(registerMentorSchema),
  requireOrganizationMembership,
  capacityCtrl.registerMentor
);

router.get(
  '/organizations/:organizationId/mentors',
  validate(orgParamSchema),
  requireOrganizationMembership,
  capacityCtrl.getOrganizationMentors
);

const scheduleSessionSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    requestId: Joi.string().uuid().allow(null).optional(),
    mentorId: Joi.string().uuid().required(),
    studentId: Joi.string().uuid().required(),
    scheduledAt: Joi.date().iso().required(),
    durationMinutes: Joi.number().integer().min(15).max(180).default(45),
    meetingLink: Joi.string().uri().allow('', null).optional(),
    agenda: Joi.string().min(5).max(500).required(),
    notes: Joi.string().max(2000).allow('', null).optional()
  }).required()
});

router.post(
  '/organizations/:organizationId/mentorship/schedule',
  validate(scheduleSessionSchema),
  requireOrganizationMembership,
  capacityCtrl.scheduleMentorshipSession
);

// 3. STUDENT ACTIONS (Applications & Mentorship)
const applyOppSchema = Joi.object({
  params: Joi.object({
    opportunityId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    coverNote: Joi.string().max(1000).allow('', null).optional(),
    portfolioLink: Joi.string().uri().max(500).allow('', null).optional()
  }).default({})
});

router.post('/opportunities/:opportunityId/apply', validate(applyOppSchema), capacityCtrl.applyToOpportunity);

router.get('/my-applications', capacityCtrl.getStudentApplications);

const withdrawAppSchema = Joi.object({
  params: Joi.object({
    applicationId: Joi.string().uuid().required()
  }).required()
});

router.post('/applications/:applicationId/withdraw', validate(withdrawAppSchema), capacityCtrl.withdrawApplication);

// Mentorship requests by students
const requestMentorSchema = Joi.object({
  params: Joi.object({
    mentorId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    topic: Joi.string().min(3).max(255).required(),
    message: Joi.string().min(10).max(2000).required()
  }).required()
});

router.post('/mentors/:mentorId/request', validate(requestMentorSchema), capacityCtrl.requestMentorship);

router.get('/my-mentorship/requests', capacityCtrl.getMyMentorshipRequests);

const updateRequestStatusSchema = Joi.object({
  params: Joi.object({
    requestId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    status: Joi.string().valid('accepted', 'declined', 'completed', 'cancelled').required(),
    responseNote: Joi.string().max(1000).allow('', null).optional()
  }).required()
});

router.put('/mentorship/requests/:requestId/status', validate(updateRequestStatusSchema), capacityCtrl.updateMentorshipRequestStatus);

router.get('/my-mentorship/sessions', capacityCtrl.getMyMentorshipSessions);

const completeSessionSchema = Joi.object({
  params: Joi.object({
    sessionId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    outcomeSummary: Joi.string().min(5).max(2000).required(),
    notes: Joi.string().max(2000).allow('', null).optional()
  }).required()
});

router.post('/mentorship/sessions/:sessionId/complete', validate(completeSessionSchema), capacityCtrl.completeMentorshipSession);

const feedbackSchema = Joi.object({
  params: Joi.object({
    sessionId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    notes: Joi.string().max(1000).allow('', null).optional()
  }).required()
});

router.post('/mentorship/sessions/:sessionId/feedback', validate(feedbackSchema), capacityCtrl.submitSessionFeedback);

// 4. STUDENT PRIVACY CONSENT
const consentSchema = Joi.object({
  body: Joi.object({
    isGranted: Joi.boolean().required(),
    parentEmail: Joi.string().email().allow('', null).optional()
  }).required()
});

router.get('/privacy/consent', capacityCtrl.getPrivacyConsent);
router.put('/privacy/consent', validate(consentSchema), capacityCtrl.updatePrivacyConsent);

module.exports = router;

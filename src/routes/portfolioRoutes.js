const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { requireOrganizationMembership } = require('../middlewares/rbac');
const portfolioCtrl = require('../controllers/portfolioController');

const router = express.Router();

// Public / shared portfolio endpoint (optional auth)
const studentIdParamSchema = Joi.object({
  params: Joi.object({
    studentId: Joi.string().uuid().required()
  }).required()
});

const projectIdParamSchema = Joi.object({
  params: Joi.object({
    projectId: Joi.string().uuid().required()
  }).required()
});

// View public project
router.get('/projects/:projectId', validate(projectIdParamSchema), portfolioCtrl.getProjectById);

// View public student portfolio
router.get('/:studentId', validate(studentIdParamSchema), portfolioCtrl.getStudentPortfolioById);

// All subsequent routes require valid authentication
router.use(authenticate);

// 1. STUDENT OWN PORTFOLIO
const updatePortfolioSchema = Joi.object({
  body: Joi.object({
    headline: Joi.string().max(255).allow('', null).optional(),
    bio: Joi.string().max(2000).allow('', null).optional(),
    aboutMe: Joi.string().max(5000).allow('', null).optional(),
    location: Joi.string().max(128).allow('', null).optional(),
    githubUrl: Joi.string().uri().max(255).allow('', null).optional(),
    linkedinUrl: Joi.string().uri().max(255).allow('', null).optional(),
    websiteUrl: Joi.string().uri().max(255).allow('', null).optional(),
    featuredProjectId: Joi.string().uuid().allow(null).optional(),
    portfolioVisibility: Joi.string().valid('public', 'organizations_only', 'private').optional()
  }).required()
});

router.get('/me/profile', portfolioCtrl.getMyPortfolio);
router.put('/me/profile', validate(updatePortfolioSchema), portfolioCtrl.updateMyPortfolio);

// 2. PROJECT SHOWCASE
const createProjectSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(3).max(255).required(),
    tagline: Joi.string().max(255).allow('', null).optional(),
    description: Joi.string().min(10).max(5000).required(),
    problemStatement: Joi.string().max(3000).allow('', null).optional(),
    technologies: Joi.array().items(Joi.string().max(50)).default([]),
    studentRole: Joi.string().max(128).default('Solo Creator'),
    outcomesAndImpact: Joi.string().max(3000).allow('', null).optional(),
    projectCategory: Joi.string().valid(
      'software', 'ai_ml', 'robotics', 'hardware', 'research', 'design', 'stem_experiment'
    ).default('software'),
    liveDemoUrl: Joi.string().uri().max(500).allow('', null).optional(),
    githubRepoUrl: Joi.string().uri().max(500).allow('', null).optional(),
    mediaUrls: Joi.array().items(Joi.string().uri({ allowRelative: true })).default([]),
    isFeatured: Joi.boolean().default(false)
  }).required()
});

const updateProjectSchema = Joi.object({
  params: Joi.object({
    projectId: Joi.string().uuid().required()
  }).required(),
  body: Joi.object({
    title: Joi.string().min(3).max(255).optional(),
    tagline: Joi.string().max(255).allow('', null).optional(),
    description: Joi.string().min(10).max(5000).optional(),
    problemStatement: Joi.string().max(3000).allow('', null).optional(),
    technologies: Joi.array().items(Joi.string().max(50)).optional(),
    studentRole: Joi.string().max(128).optional(),
    outcomesAndImpact: Joi.string().max(3000).allow('', null).optional(),
    projectCategory: Joi.string().valid(
      'software', 'ai_ml', 'robotics', 'hardware', 'research', 'design', 'stem_experiment'
    ).optional(),
    liveDemoUrl: Joi.string().uri().max(500).allow('', null).optional(),
    githubRepoUrl: Joi.string().uri().max(500).allow('', null).optional(),
    mediaUrls: Joi.array().items(Joi.string().uri({ allowRelative: true })).optional(),
    isFeatured: Joi.boolean().optional()
  }).required()
});

router.post('/projects', validate(createProjectSchema), portfolioCtrl.createProject);
router.put('/projects/:projectId', validate(updateProjectSchema), portfolioCtrl.updateProject);
router.delete('/projects/:projectId', validate(projectIdParamSchema), portfolioCtrl.deleteProject);

// 3. CERTIFICATIONS
const addCertSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(2).max(255).required(),
    issuingOrganization: Joi.string().min(2).max(255).required(),
    issueDate: Joi.date().iso().allow(null).optional(),
    credentialId: Joi.string().max(255).allow('', null).optional(),
    credentialUrl: Joi.string().uri().max(500).allow('', null).optional(),
    organizationId: Joi.string().uuid().allow(null).optional()
  }).required()
});

const certIdParamSchema = Joi.object({
  params: Joi.object({
    certId: Joi.string().uuid().required()
  }).required()
});

router.post('/certifications', validate(addCertSchema), portfolioCtrl.addCertification);
router.delete('/certifications/:certId', validate(certIdParamSchema), portfolioCtrl.deleteCertification);

// 4. ACHIEVEMENTS
router.get('/me/achievements', portfolioCtrl.getAchievements);

// 5. ORGANISATION INTEGRATION
const orgCandidateSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required(),
    studentId: Joi.string().uuid().required()
  }).required()
});

router.get(
  '/organizations/:organizationId/candidates/:studentId',
  validate(orgCandidateSchema),
  requireOrganizationMembership,
  portfolioCtrl.getOrgCandidatePortfolio
);

const verifyProjectSchema = Joi.object({
  params: Joi.object({
    organizationId: Joi.string().uuid().required(),
    projectId: Joi.string().uuid().required()
  }).required()
});

router.post(
  '/organizations/:organizationId/projects/:projectId/verify',
  validate(verifyProjectSchema),
  requireOrganizationMembership,
  portfolioCtrl.verifyProjectByOrg
);

module.exports = router;

const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const studentIntelligenceController = require('../controllers/studentIntelligenceController');
const roadmapRoutes = require('./roadmapRoutes');

const router = express.Router();

// All student routes require valid user authentication
router.use(authenticate);

// Dynamic Learning Roadmap Sub-Routes (Milestone 2)
router.use('/roadmap', roadmapRoutes);

const onboardingSchema = Joi.object({
  body: Joi.object({
    academicClass: Joi.string().required().messages({
      'any.required': 'Academic class is required (e.g. 5-12, or college year).'
    }),
    studentSegment: Joi.string().valid('junior', 'school', 'career', 'professional').optional(),
    streamOrFocus: Joi.string().max(128).optional(),
    institutionName: Joi.string().max(255).allow('', null).optional(),
    learningStyle: Joi.string().valid('visual_interactive', 'practical_projects', 'structured_reading', 'guided_mentorship').optional(),
    targetCareerPath: Joi.string().max(128).optional(),
    weeklyGoalHours: Joi.number().min(1).max(80).optional(),
    interests: Joi.array().items(
      Joi.alternatives().try(
        Joi.string().max(100),
        Joi.object({
          name: Joi.string().max(100).required(),
          category: Joi.string().max(64).optional()
        })
      )
    ).optional(),
    skills: Joi.array().items(
      Joi.alternatives().try(
        Joi.string().max(100),
        Joi.object({
          name: Joi.string().max(100).required(),
          level: Joi.string().valid('beginner', 'intermediate', 'advanced').optional(),
          category: Joi.string().max(64).optional()
        })
      )
    ).optional()
  }).required()
});

const completeActivitySchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required()
  }).required(),
  body: Joi.object({
    notes: Joi.string().max(1000).allow('', null).optional(),
    score: Joi.number().min(0).max(100).optional()
  }).optional()
});

/**
 * @openapi
 * /student/profile:
 *   get:
 *     summary: Get student intelligence profile
 *   put:
 *     summary: Update student intelligence profile
 */
router.get('/profile', studentIntelligenceController.getProfile);
router.put('/profile', studentIntelligenceController.updateProfile);

/**
 * @openapi
 * /student/onboarding:
 *   post:
 *     summary: Complete student onboarding workflow
 */
router.post('/onboarding', validate(onboardingSchema), studentIntelligenceController.saveOnboarding);

/**
 * @openapi
 * /student/dashboard:
 *   get:
 *     summary: Get complete student dashboard metrics and activities
 */
router.get('/dashboard', studentIntelligenceController.getDashboard);

/**
 * @openapi
 * /student/recommendations:
 *   get:
 *     summary: Get personalized recommendations with "why" reasoning
 */
router.get('/recommendations', studentIntelligenceController.getRecommendations);

/**
 * @openapi
 * /student/activities:
 *   get:
 *     summary: List segment-curated learning quests
 */
router.get('/activities', studentIntelligenceController.getActivities);

/**
 * @openapi
 * /student/activities/{id}/complete:
 *   post:
 *     summary: Mark an activity as complete and update progress
 */
router.post('/activities/:id/complete', validate(completeActivitySchema), studentIntelligenceController.completeActivity);

module.exports = router;

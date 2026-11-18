const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validate');
const learningRoadmapController = require('../controllers/learningRoadmapController');

const router = express.Router();

const generateRoadmapSchema = Joi.object({
  body: Joi.object({
    primaryGoal: Joi.string().max(255).optional(),
    targetCareerPath: Joi.string().max(128).optional(),
    academicClass: Joi.string().max(32).optional(),
    streamOrFocus: Joi.string().max(128).optional(),
    academicObjectives: Joi.array().items(Joi.string().max(255)).optional(),
    preferredDevelopmentAreas: Joi.array().items(Joi.string().max(100)).optional(),
    targetSkills: Joi.array().items(Joi.string().max(100)).optional(),
    useAi: Joi.boolean().optional()
  }).required()
});

const completeTaskSchema = Joi.object({
  params: Joi.object({
    taskId: Joi.string().required()
  }).required(),
  body: Joi.object({
    notes: Joi.string().max(1000).allow('', null).optional()
  }).optional()
});

const updateGoalsSchema = Joi.object({
  body: Joi.object({
    primaryGoal: Joi.string().max(255).optional(),
    targetCareerPath: Joi.string().max(128).optional(),
    academicObjectives: Joi.array().items(Joi.string().max(255)).optional(),
    preferredDevelopmentAreas: Joi.array().items(Joi.string().max(100)).optional(),
    targetSkills: Joi.array().items(Joi.string().max(100)).optional()
  }).required()
});

/**
 * @openapi
 * /student/roadmap/catalog:
 *   get:
 *     summary: Retrieve age-appropriate career & learning goal catalog
 */
router.get('/catalog', learningRoadmapController.getCatalog);

/**
 * @openapi
 * /student/roadmap/generate:
 *   post:
 *     summary: Generate a personalized 6-month learning roadmap
 */
router.post('/generate', validate(generateRoadmapSchema), learningRoadmapController.generateRoadmap);

/**
 * @openapi
 * /student/roadmap:
 *   get:
 *     summary: Get active roadmap with milestones, tasks, and skill gaps
 */
router.get('/', learningRoadmapController.getActiveRoadmap);

/**
 * @openapi
 * /student/roadmap/tasks/{taskId}/complete:
 *   post:
 *     summary: Complete a roadmap task and dynamically recalculate progress
 */
router.post('/tasks/:taskId/complete', validate(completeTaskSchema), learningRoadmapController.completeTask);

/**
 * @openapi
 * /student/roadmap/goals:
 *   put:
 *     summary: Update target goals on active roadmap
 */
router.put('/goals', validate(updateGoalsSchema), learningRoadmapController.updateGoals);

/**
 * @openapi
 * /student/roadmap/skill-gaps:
 *   get:
 *     summary: Get student skill gap breakdown
 */
router.get('/skill-gaps', learningRoadmapController.getSkillGaps);

module.exports = router;

const learningRoadmapModel = require('../models/learningRoadmapModel');
const studentIntelligenceModel = require('../models/studentIntelligenceModel');
const roadmapAiEngine = require('../services/roadmapAiEngine');
const logger = require('../config/logger');

/**
 * GET /api/v1/student/roadmap/catalog
 * Returns segment-specific goals, career tracks, and skills.
 */
async function getCatalog(req, res) {
  try {
    const userId = req.user.id;
    const profile = await studentIntelligenceModel.getProfileByUserId(userId);
    const segment = profile ? profile.student_segment : 'school';

    const currentCatalog = learningRoadmapModel.SEGMENT_CATALOGS[segment] || learningRoadmapModel.SEGMENT_CATALOGS.school;

    return res.json({
      success: true,
      currentSegment: segment,
      catalog: currentCatalog,
      allSegments: Object.keys(learningRoadmapModel.SEGMENT_CATALOGS).map(k => ({
        segment: k,
        displayName: learningRoadmapModel.SEGMENT_CATALOGS[k].displayName,
        tagline: learningRoadmapModel.SEGMENT_CATALOGS[k].tagline
      }))
    });
  } catch (err) {
    logger.error('Error fetching roadmap catalog', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to retrieve roadmap catalog.' });
  }
}

/**
 * POST /api/v1/student/roadmap/generate
 * Generates and activates a personalized 6-month learning roadmap.
 */
async function generateRoadmap(req, res) {
  try {
    const userId = req.user.id;
    let profile = await studentIntelligenceModel.getProfileByUserId(userId);

    // If profile does not exist, initialize a default profile based on provided academicClass or '10'
    if (!profile) {
      const defaultClass = req.body.academicClass || '10';
      const determinedSegment = studentIntelligenceModel.determineSegment(defaultClass);
      profile = await studentIntelligenceModel.upsertProfile(userId, {
        academicClass: defaultClass,
        studentSegment: determinedSegment,
        streamOrFocus: req.body.streamOrFocus || 'General Exploratory',
        targetCareerPath: req.body.targetCareerPath || 'Technology & Innovation',
        weeklyGoalHours: 5.0
      });
    }

    const segment = profile.student_segment || 'school';
    const existingSkills = profile.skills || [];
    const targetSkills = req.body.targetSkills || [];

    // 1. Perform Skill Gap Analysis
    const skillGaps = learningRoadmapModel.analyzeSkillGaps(segment, existingSkills, targetSkills);

    // 2. Synthesize 6-Month Roadmap (AI with deterministic fallback)
    const goalsPayload = {
      primaryGoal: req.body.primaryGoal,
      targetCareerPath: req.body.targetCareerPath || profile.target_career_path,
      academicObjectives: req.body.academicObjectives,
      preferredDevelopmentAreas: req.body.preferredDevelopmentAreas,
      targetSkills: targetSkills.length > 0 ? targetSkills : undefined
    };

    const roadmapData = await roadmapAiEngine.generateAdaptiveRoadmap(
      segment,
      profile,
      goalsPayload,
      skillGaps,
      { useAi: req.body.useAi !== false }
    );

    // 3. Transactionally save to database
    const savedRoadmap = await learningRoadmapModel.saveRoadmap(userId, roadmapData, skillGaps);

    return res.status(201).json({
      success: true,
      message: 'Personalized 6-Month Learning Roadmap generated and activated!',
      roadmap: savedRoadmap
    });
  } catch (err) {
    logger.error('Error generating learning roadmap', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to generate learning roadmap.' });
  }
}

/**
 * GET /api/v1/student/roadmap
 * Retrieves the currently active roadmap with live progress metrics.
 */
async function getActiveRoadmap(req, res) {
  try {
    const userId = req.user.id;
    const roadmap = await learningRoadmapModel.getActiveRoadmap(userId);

    if (!roadmap) {
      return res.json({
        success: true,
        hasRoadmap: false,
        message: 'No active roadmap found for this student. Use /roadmap/generate to create one.'
      });
    }

    return res.json({
      success: true,
      hasRoadmap: true,
      roadmap
    });
  } catch (err) {
    logger.error('Error fetching active roadmap', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to retrieve active roadmap.' });
  }
}

/**
 * POST /api/v1/student/roadmap/tasks/:taskId/complete
 * Completes a specific roadmap task, dynamically recalculates milestones,
 * updates skill gaps, and awards XP.
 */
async function completeTask(req, res) {
  try {
    const userId = req.user.id;
    const taskId = req.params.taskId;
    const notes = req.body && req.body.notes ? req.body.notes : '';

    const result = await learningRoadmapModel.completeTask(userId, taskId, notes);

    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    logger.error('Error completing roadmap task', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to complete task.' });
  }
}

/**
 * PUT /api/v1/student/roadmap/goals
 * Updates goals on the active roadmap and logs a revision.
 */
async function updateGoals(req, res) {
  try {
    const userId = req.user.id;
    const updated = await learningRoadmapModel.updateRoadmapGoals(userId, req.body);

    return res.json({
      success: true,
      message: 'Roadmap goals updated successfully.',
      roadmap: updated
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    logger.error('Error updating roadmap goals', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to update roadmap goals.' });
  }
}

/**
 * GET /api/v1/student/roadmap/skill-gaps
 * Retrieves student's skill gaps and development status.
 */
async function getSkillGaps(req, res) {
  try {
    const userId = req.user.id;
    const gaps = await learningRoadmapModel.getSkillGaps(userId);

    return res.json({
      success: true,
      skillGaps: gaps
    });
  } catch (err) {
    logger.error('Error fetching skill gaps', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Failed to retrieve skill gaps.' });
  }
}

module.exports = {
  getCatalog,
  generateRoadmap,
  getActiveRoadmap,
  completeTask,
  updateGoals,
  getSkillGaps
};

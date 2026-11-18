const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const studentIntelligenceModel = require('../models/studentIntelligenceModel');

/**
 * GET /api/v1/student/profile
 * Retrieve authenticated student's intelligence profile
 */
const getProfile = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  if (!profile) {
    return res.status(200).json({
      success: true,
      hasProfile: false,
      message: 'Student profile onboarding pending.'
    });
  }
  res.json({
    success: true,
    hasProfile: true,
    profile
  });
});

/**
 * POST /api/v1/student/onboarding
 * Submit full student onboarding workflow
 */
const saveOnboarding = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const {
    academicClass,
    studentSegment,
    streamOrFocus,
    institutionName,
    learningStyle,
    targetCareerPath,
    weeklyGoalHours,
    interests,
    skills
  } = req.body;

  if (!academicClass) {
    throw new ApiError(400, 'Academic class or educational level is required for student profiling.');
  }

  const profile = await studentIntelligenceModel.upsertProfile(userId, {
    academicClass,
    studentSegment,
    streamOrFocus,
    institutionName,
    learningStyle,
    targetCareerPath,
    weeklyGoalHours,
    interests: interests || [],
    skills: skills || [],
    onboardingCompleted: true
  });

  const fullProfile = await studentIntelligenceModel.getProfileByUserId(userId);

  res.status(201).json({
    success: true,
    message: 'Student intelligence onboarding completed successfully.',
    profile: fullProfile
  });
});

/**
 * PUT /api/v1/student/profile
 * Update student profile preferences, stream, or learning style
 */
const updateProfile = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const existing = await studentIntelligenceModel.getProfileByUserId(userId);

  const payload = {
    academicClass: req.body.academicClass || (existing ? existing.academic_class : '10'),
    studentSegment: req.body.studentSegment || (existing ? existing.student_segment : undefined),
    streamOrFocus: req.body.streamOrFocus || (existing ? existing.stream_or_focus : 'General'),
    institutionName: req.body.institutionName !== undefined ? req.body.institutionName : (existing ? existing.institution_name : null),
    learningStyle: req.body.learningStyle || (existing ? existing.learning_style : 'visual_interactive'),
    targetCareerPath: req.body.targetCareerPath || (existing ? existing.target_career_path : 'Technology & Innovation'),
    weeklyGoalHours: req.body.weeklyGoalHours !== undefined ? req.body.weeklyGoalHours : (existing ? existing.weekly_goal_hours : 5.0),
    interests: req.body.interests !== undefined ? req.body.interests : (existing ? existing.interests.map(i => i.interest_name) : []),
    skills: req.body.skills !== undefined ? req.body.skills : (existing ? existing.skills.map(s => s.skill_name) : [])
  };

  await studentIntelligenceModel.upsertProfile(userId, payload);
  const updated = await studentIntelligenceModel.getProfileByUserId(userId);

  res.json({
    success: true,
    message: 'Profile updated successfully.',
    profile: updated
  });
});

/**
 * GET /api/v1/student/dashboard
 * Fetch complete dynamic student dashboard with verified non-fabricated metrics
 */
const getDashboard = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const dashboard = await studentIntelligenceModel.getDashboardData(userId);
  res.json({
    success: true,
    dashboard
  });
});

/**
 * GET /api/v1/student/recommendations
 * Fetch personalized recommendations explaining *why* an activity/skill/career is relevant
 */
const getRecommendations = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const recommendations = await studentIntelligenceModel.getRecommendations(userId);
  res.json({
    success: true,
    count: recommendations.length,
    recommendations
  });
});

/**
 * GET /api/v1/student/activities
 * Fetch curated quests/activities for current student segment
 */
const getActivities = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const profile = await studentIntelligenceModel.getProfileByUserId(userId);
  const segment = profile ? profile.student_segment : (req.query.segment || 'school');

  const activities = await studentIntelligenceModel.getSegmentActivities(segment, userId);
  res.json({
    success: true,
    segment,
    count: activities.length,
    activities
  });
});

/**
 * POST /api/v1/student/activities/:id/complete
 * Submit completion of an activity and update dynamic progress
 */
const completeActivity = asyncHandler(async function(req, res) {
  const userId = req.user.id;
  const activityIdOrCode = req.params.id;
  const { notes, score } = req.body;

  let result;
  try {
    result = await studentIntelligenceModel.completeActivity(userId, activityIdOrCode, { notes, score });
  } catch (err) {
    if (err.statusCode === 404 || err.message === 'Activity not found') {
      throw new ApiError(404, 'Activity not found.');
    }
    throw err;
  }

  // Get refreshed metrics to return real, updated values immediately
  const dashboard = await studentIntelligenceModel.getDashboardData(userId);

  const message = result.alreadyCompleted
    ? `Activity "${result.activityTitle}" was already completed.`
    : `Completed "${result.activityTitle}" successfully!`;

  res.json({
    success: true,
    message,
    alreadyCompleted: result.alreadyCompleted,
    xpAwarded: result.xpAwarded,
    metrics: dashboard.metrics
  });
});

module.exports = {
  getProfile,
  saveOnboarding,
  updateProfile,
  getDashboard,
  getRecommendations,
  getActivities,
  completeActivity
};

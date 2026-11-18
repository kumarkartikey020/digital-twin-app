const Joi = require('joi');
const aiService = require('./aiService');
const learningRoadmapModel = require('../models/learningRoadmapModel');
const logger = require('../config/logger');

// Strict Joi schema for validating AI-generated roadmap payloads
const aiRoadmapSchema = Joi.object({
  title: Joi.string().max(255).required(),
  description: Joi.string().required(),
  aiRationale: Joi.string().required(),
  milestones: Joi.array().length(6).items(
    Joi.object({
      month_number: Joi.number().integer().min(1).max(6).required(),
      title: Joi.string().max(255).required(),
      objective: Joi.string().required(),
      expected_outcomes: Joi.string().required(),
      tasks: Joi.array().length(4).items(
        Joi.object({
          week_number: Joi.number().integer().min(1).max(24).required(),
          title: Joi.string().max(255).required(),
          description: Joi.string().required(),
          task_type: Joi.string().valid('daily_activity', 'skill_builder', 'assignment', 'project').required(),
          skills_targeted: Joi.array().items(Joi.string()).min(1).required(),
          completion_criteria: Joi.string().required(),
          estimated_minutes: Joi.number().integer().min(15).max(180).required(),
          xp_reward: Joi.number().integer().min(20).max(150).required()
        })
      ).required()
    })
  ).required()
});

/**
 * Builds the AI prompt with strict segment boundaries and age safeguards.
 */
function buildAiPrompt(segment, profile, goals, skillGaps) {
  const catalog = learningRoadmapModel.SEGMENT_CATALOGS[segment] || learningRoadmapModel.SEGMENT_CATALOGS.school;
  const primaryGoal = goals.primaryGoal || catalog.learningGoals[0];
  const targetCareer = goals.targetCareerPath || catalog.careerCuriosities[0];

  const gapSummary = (skillGaps || []).map(g => `- ${g.skill_name}: current=${g.current_proficiency}, target=${g.target_proficiency}, priority=${g.priority}`).join('\n');

  const systemPrompt = `You are the Principal Educational Architect and AI Learning Strategist for Digital Twin Verse (DTV).
Your mission is to generate a personalized, mathematically grounded, age-appropriate 6-month developmental roadmap for a student.

CRITICAL SAFETY & AGE-APPROPRIATENESS SAFEGUARDS:
1. Target Student Segment: "${segment.toUpperCase()}" (${catalog.displayName}).
2. FOR JUNIOR (Classes 5-8): Focus ONLY on creative block coding, natural science exploration, mathematical pattern puzzles, and curiosity. NEVER include college placements, resumes, job interviews, or corporate engineering.
3. FOR SCHOOL (Classes 9-10): Focus on stream discovery (PCM/PCB/Commerce/Arts), board exam preparation balance, and foundational Python. Do NOT include college internships or salary negotiations.
4. FOR CAREER (Classes 11-12): Focus on competitive entrance diagnostics (JEE/NEET/CUET), high-speed numerical sprints, college portfolio mapping, and deep work stamina.
5. FOR PROFESSIONAL (College): Focus on production REST APIs, distributed systems, open source PRs, and ATS placement interview rounds.
6. ZERO FABRICATION: Do NOT invent past student test scores, rank percentages, or fictitious grades.

OUTPUT FORMAT:
Respond with ONLY valid, raw JSON (no markdown formatting, no backticks, no prose outside JSON) with this exact schema:
{
  "title": "string",
  "description": "string",
  "aiRationale": "Detailed explanation of why this trajectory addresses the student's skill gaps and stage",
  "milestones": [
    {
      "month_number": 1,
      "title": "Month 1: Title",
      "objective": "Monthly objective",
      "expected_outcomes": "Measurable outcome",
      "tasks": [
        {
          "week_number": 1,
          "title": "Week 1: Task Title",
          "description": "Task description",
          "task_type": "daily_activity" | "skill_builder" | "assignment" | "project",
          "skills_targeted": ["Skill Name"],
          "completion_criteria": "How the student verifies completion",
          "estimated_minutes": 30,
          "xp_reward": 40
        }
        // Exactly 4 tasks per milestone (weeks 1 to 4)
      ]
    }
    // Exactly 6 milestones (months 1 to 6)
  ]
}`;

  const userPrompt = `Generate a 6-month roadmap for:
Student Level: Class ${profile.academic_class || profile.academicClass || '10'} (${segment})
Primary Goal: ${primaryGoal}
Target Path: ${targetCareer}
Identified Skill Gaps:
${gapSummary || 'Foundational competencies to be cultivated.'}

Generate all 6 months with exactly 4 actionable weekly tasks per month (total 24 tasks).`;

  return { systemPrompt, userPrompt };
}

/**
 * Generates an adaptive learning roadmap using AI if available,
 * falling back gracefully to the deterministic engine on any failure.
 */
async function generateAdaptiveRoadmap(segment, profile, goals, skillGaps, options = {}) {
  // If useAi is explicitly false or in test mode without AI key, use deterministic immediately
  const forceDeterministic = options.useAi === false;

  if (!forceDeterministic) {
    try {
      const { systemPrompt, userPrompt } = buildAiPrompt(segment, profile, goals, skillGaps);
      const aiResponse = await aiService.sendMessages({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 3500
      });

      if (aiResponse && !aiResponse.error && aiResponse.text) {
        let cleanText = aiResponse.text.trim();
        // Remove markdown code fences if model enclosed JSON
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
        }

        const parsed = JSON.parse(cleanText);
        const { error, value } = aiRoadmapSchema.validate(parsed, { abortEarly: false });

        if (!error && value) {
          logger.info('Successfully generated AI learning roadmap with valid schema', {
            segment,
            title: value.title
          });

          // Flatten tasks and attach milestone references
          const allTasks = [];
          const milestones = value.milestones.map((m, mIdx) => {
            (m.tasks || []).forEach((t, tIdx) => {
              allTasks.push({
                ...t,
                order_index: tIdx
              });
            });
            return {
              month_number: m.month_number,
              title: m.title,
              objective: m.objective,
              expected_outcomes: m.expected_outcomes,
              order_index: mIdx
            };
          });

          return {
            title: value.title,
            description: value.description,
            primary_goal: goals.primaryGoal || value.title,
            target_career_path: goals.targetCareerPath || 'Custom Trajectory',
            academic_objectives: goals.academicObjectives || [],
            preferred_development_areas: goals.preferredDevelopmentAreas || [],
            target_skills: goals.targetSkills || [],
            student_segment: segment,
            duration_months: 6,
            total_tasks: allTasks.length,
            completed_tasks: 0,
            overall_progress: 0.0,
            ai_generated: true,
            ai_rationale: value.aiRationale,
            milestones,
            tasks: allTasks
          };
        } else {
          logger.warn('AI generated roadmap failed schema validation, falling back to deterministic engine', {
            validationErrors: error ? error.details.map(d => d.message) : []
          });
        }
      }
    } catch (aiErr) {
      logger.warn('AI roadmap generation encountered error, gracefully applying deterministic fallback', {
        error: aiErr.message
      });
    }
  }

  // Deterministic Fallback Engine (Guaranteed zero downtime, strict schema adherence)
  const deterministicRoadmap = learningRoadmapModel.generateDeterministicRoadmap(segment, profile, goals);
  deterministicRoadmap.ai_generated = false;
  deterministicRoadmap.ai_rationale = `Synthesized via DTV Deterministic Empirical Engine based on ${segment.toUpperCase()} curriculum standards and ${skillGaps.length} identified development priorities.`;

  return deterministicRoadmap;
}

module.exports = {
  buildAiPrompt,
  generateAdaptiveRoadmap,
  aiRoadmapSchema
};

const capacityModel = require('../models/capacityConnectModel');
const studentIntelligenceModel = require('../models/studentIntelligenceModel');
const ApiError = require('../utils/apiError');

// 1. ORGANISATION MANAGEMENT
async function registerOrganization(req, res, next) {
  try {
    const {
      name,
      orgType,
      description,
      website,
      contactEmail,
      phone,
      address,
      industrySector,
      logoUrl
    } = req.body;

    const org = await capacityModel.registerOrganization({
      name,
      orgType,
      description,
      website,
      contactEmail,
      phone,
      address,
      industrySector,
      logoUrl,
      creatorUserId: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Organisation registered successfully. Verification is pending approval.',
      data: org
    });
  } catch (error) {
    next(error);
  }
}

async function getOrganization(req, res, next) {
  try {
    const { organizationId } = req.params;
    const org = await capacityModel.getOrganizationById(organizationId);
    if (!org) {
      throw new ApiError(404, 'Organisation not found.');
    }
    res.json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
}

async function updateOrganization(req, res, next) {
  try {
    const { organizationId } = req.params;
    const updated = await capacityModel.updateOrganization(organizationId, req.body);
    res.json({
      success: true,
      message: 'Organisation profile updated.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOrganization(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { verificationStatus, verificationNotes } = req.body;

    // Only platform super admin or admin can verify
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new ApiError(403, 'Platform administrator privileges required to verify organisations.');
    }

    const verified = await capacityModel.verifyOrganization(organizationId, {
      verificationStatus,
      verificationNotes,
      verifiedBy: req.user.id
    });

    if (!verified) {
      throw new ApiError(404, 'Organisation not found.');
    }

    res.json({
      success: true,
      message: `Organisation status updated to ${verificationStatus}.`,
      data: verified
    });
  } catch (error) {
    next(error);
  }
}

async function listOrganizations(req, res, next) {
  try {
    const { verificationStatus, orgType, limit, offset } = req.query;
    const orgs = await capacityModel.listOrganizations({
      verificationStatus: verificationStatus || 'verified',
      orgType,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });
    res.json({ success: true, data: orgs });
  } catch (error) {
    next(error);
  }
}

// 2. DASHBOARD & ANALYTICS
async function getOrganizationDashboard(req, res, next) {
  try {
    const { organizationId } = req.params;
    const metrics = await capacityModel.getOrganizationDashboardMetrics(organizationId);
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
}

async function getOrganizationAnalytics(req, res, next) {
  try {
    const { organizationId } = req.params;
    const analytics = await capacityModel.getOrganizationAnalyticsReport(organizationId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
}

// 3. TALENT DISCOVERY & PRIVACY
async function discoverTalent(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { skills, segment, search, limit, offset } = req.query;

    let skillsArray = null;
    if (skills) {
      skillsArray = Array.isArray(skills) 
        ? skills 
        : String(skills).split(',').map(s => s.trim()).filter(Boolean);
    }

    const students = await capacityModel.discoverStudents({
      organizationId,
      skills: skillsArray,
      segment,
      search,
      limit: parseInt(limit, 10) || 20,
      offset: parseInt(offset, 10) || 0
    });

    res.json({
      success: true,
      data: {
        total: students.length,
        students
      }
    });
  } catch (error) {
    next(error);
  }
}

// 4. OPPORTUNITIES & CHALLENGES
async function createOpportunity(req, res, next) {
  try {
    const { organizationId } = req.params;
    const {
      title,
      opportunityType,
      description,
      eligibilitySegments,
      requiredSkills,
      stipendOrReward,
      locationType,
      locationDetails,
      applicationDeadline,
      maxParticipants,
      status
    } = req.body;

    const opportunity = await capacityModel.createOpportunity({
      organizationId,
      createdBy: req.user.id,
      title,
      opportunityType,
      description,
      eligibilitySegments,
      requiredSkills,
      stipendOrReward,
      locationType,
      locationDetails,
      applicationDeadline,
      maxParticipants,
      status: status || 'published'
    });

    res.status(201).json({
      success: true,
      message: 'Opportunity created successfully.',
      data: opportunity
    });
  } catch (error) {
    next(error);
  }
}

async function updateOpportunity(req, res, next) {
  try {
    const { organizationId, opportunityId } = req.params;
    const updated = await capacityModel.updateOpportunity(opportunityId, organizationId, req.body);
    if (!updated) {
      throw new ApiError(404, 'Opportunity not found in this organisation.');
    }
    res.json({
      success: true,
      message: 'Opportunity updated successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

async function getOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;
    const opp = await capacityModel.getOpportunityById(opportunityId);
    if (!opp) {
      throw new ApiError(404, 'Opportunity not found.');
    }
    res.json({ success: true, data: opp });
  } catch (error) {
    next(error);
  }
}

async function listOpportunities(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { studentSegment, status, opportunityType, limit, offset } = req.query;

    const opportunities = await capacityModel.listOpportunities({
      organizationId,
      studentSegment,
      status: organizationId ? status : (status || 'published'),
      opportunityType,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json({ success: true, data: opportunities });
  } catch (error) {
    next(error);
  }
}

// 5. APPLICATION PIPELINE
async function applyToOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;
    const { coverNote, portfolioLink } = req.body;

    // Detect student segment from student profile if available
    let applicantSegment = 'school';
    try {
      const profile = await studentIntelligenceModel.getProfile(req.user.id);
      if (profile && profile.student_segment) {
        applicantSegment = profile.student_segment;
      }
    } catch (_) {
      // Fallback
    }

    const application = await capacityModel.applyToOpportunity({
      opportunityId,
      studentId: req.user.id,
      coverNote,
      portfolioLink,
      applicantSegment
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully.',
      data: application
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentApplications(req, res, next) {
  try {
    const applications = await capacityModel.getStudentApplications(req.user.id);
    res.json({ success: true, data: applications });
  } catch (error) {
    next(error);
  }
}

async function getOrganizationApplications(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { opportunityId, status, limit, offset } = req.query;

    const applications = await capacityModel.getOrganizationApplications(organizationId, {
      opportunityId,
      status,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json({ success: true, data: applications });
  } catch (error) {
    next(error);
  }
}

async function updateApplicationStatus(req, res, next) {
  try {
    const { organizationId, applicationId } = req.params;
    const { status, reviewerFeedback } = req.body;

    const updated = await capacityModel.updateApplicationStatus({
      applicationId,
      organizationId,
      status,
      reviewerFeedback,
      reviewedBy: req.user.id
    });

    res.json({
      success: true,
      message: `Application marked as ${status}.`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

async function withdrawApplication(req, res, next) {
  try {
    const { applicationId } = req.params;
    const withdrawn = await capacityModel.withdrawApplication(applicationId, req.user.id);
    res.json({
      success: true,
      message: 'Application withdrawn successfully.',
      data: withdrawn
    });
  } catch (error) {
    next(error);
  }
}

// 6. MENTORSHIP & SESSIONS
async function registerMentor(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { userId, title, bio, expertiseAreas, maxMentees } = req.body;

    const mentor = await capacityModel.registerMentor({
      organizationId,
      userId: userId || req.user.id,
      title,
      bio,
      expertiseAreas,
      maxMentees
    });

    res.status(201).json({
      success: true,
      message: 'Mentor registered successfully.',
      data: mentor
    });
  } catch (error) {
    next(error);
  }
}

async function getOrganizationMentors(req, res, next) {
  try {
    const { organizationId } = req.params;
    const mentors = await capacityModel.getOrganizationMentors(organizationId);
    res.json({ success: true, data: mentors });
  } catch (error) {
    next(error);
  }
}

async function listAvailableMentors(req, res, next) {
  try {
    const { expertiseArea, limit, offset } = req.query;
    const mentors = await capacityModel.listAvailableMentors({
      expertiseArea,
      limit: parseInt(limit, 10) || 20,
      offset: parseInt(offset, 10) || 0
    });
    res.json({ success: true, data: mentors });
  } catch (error) {
    next(error);
  }
}

async function requestMentorship(req, res, next) {
  try {
    const { mentorId } = req.params;
    const { topic, message } = req.body;

    const request = await capacityModel.requestMentorship({
      mentorId,
      studentId: req.user.id,
      topic,
      message
    });

    res.status(201).json({
      success: true,
      message: 'Mentorship request sent successfully.',
      data: request
    });
  } catch (error) {
    next(error);
  }
}

async function getMyMentorshipRequests(req, res, next) {
  try {
    const requests = await capacityModel.getMentorshipRequests({
      studentId: req.user.id
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
}

async function updateMentorshipRequestStatus(req, res, next) {
  try {
    const { requestId } = req.params;
    const { status, responseNote } = req.body;

    const updated = await capacityModel.updateMentorshipRequestStatus({
      requestId,
      status,
      responseNote
    });

    res.json({
      success: true,
      message: `Mentorship request status updated to ${status}.`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

async function scheduleMentorshipSession(req, res, next) {
  try {
    const { organizationId } = req.params;
    const {
      requestId,
      mentorId,
      studentId,
      scheduledAt,
      durationMinutes,
      meetingLink,
      agenda,
      notes
    } = req.body;

    const session = await capacityModel.scheduleMentorshipSession({
      requestId,
      mentorId,
      studentId,
      organizationId,
      scheduledAt,
      durationMinutes,
      meetingLink,
      agenda,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Mentorship session scheduled successfully.',
      data: session
    });
  } catch (error) {
    next(error);
  }
}

async function getMyMentorshipSessions(req, res, next) {
  try {
    const sessions = await capacityModel.getMentorshipSessions({
      studentId: req.user.id
    });
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
}

async function completeMentorshipSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { outcomeSummary, notes } = req.body;

    const completed = await capacityModel.completeMentorshipSession({
      sessionId,
      outcomeSummary,
      notes
    });

    res.json({
      success: true,
      message: 'Mentorship session completed.',
      data: completed
    });
  } catch (error) {
    next(error);
  }
}

async function submitSessionFeedback(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { rating, notes } = req.body;

    const updated = await capacityModel.submitSessionFeedback({
      sessionId,
      studentId: req.user.id,
      rating,
      notes
    });

    res.json({
      success: true,
      message: 'Feedback submitted successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

// 7. PRIVACY CONSENT
async function getPrivacyConsent(req, res, next) {
  try {
    const consent = await capacityModel.getStudentConsent(req.user.id, 'contact_sharing');
    res.json({
      success: true,
      data: {
        consentType: 'contact_sharing',
        isGranted: !!consent?.is_granted,
        parentEmail: consent?.parent_email || null,
        grantedAt: consent?.granted_at || null
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updatePrivacyConsent(req, res, next) {
  try {
    const { isGranted, parentEmail } = req.body;
    const updated = await capacityModel.updateStudentConsent(req.user.id, {
      consentType: 'contact_sharing',
      isGranted: !!isGranted,
      parentEmail
    });
    res.json({
      success: true,
      message: isGranted 
        ? 'Contact sharing consent granted.' 
        : 'Contact sharing consent revoked. Contact details are masked.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerOrganization,
  getOrganization,
  updateOrganization,
  verifyOrganization,
  listOrganizations,
  getOrganizationDashboard,
  getOrganizationAnalytics,
  discoverTalent,
  createOpportunity,
  updateOpportunity,
  getOpportunity,
  listOpportunities,
  applyToOpportunity,
  getStudentApplications,
  getOrganizationApplications,
  updateApplicationStatus,
  withdrawApplication,
  registerMentor,
  getOrganizationMentors,
  listAvailableMentors,
  requestMentorship,
  getMyMentorshipRequests,
  updateMentorshipRequestStatus,
  scheduleMentorshipSession,
  getMyMentorshipSessions,
  completeMentorshipSession,
  submitSessionFeedback,
  getPrivacyConsent,
  updatePrivacyConsent
};

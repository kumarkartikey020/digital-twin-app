const db = require('../db');
const ApiError = require('../utils/apiError');

/**
 * Mask sensitive PII for minors (Junior and School segments)
 * Unless explicit verified parental / student consent has been granted.
 */
function maskMinorData(user, profile, hasConsent = false) {
  const isMinor = ['junior', 'school'].includes(profile?.student_segment || '');
  
  if (!isMinor || hasConsent) {
    return {
      isMinor,
      privacyProtected: false,
      fullName: user.name || 'Anonymous Student',
      email: user.email,
      phone: user.phone || null
    };
  }

  // Mask Name: First name + Initial (e.g. "Aarav S.")
  let maskedName = 'Student Learner';
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    maskedName = parts.length > 1 
      ? `${parts[0]} ${parts[parts.length - 1][0]}.` 
      : parts[0];
  }

  // Mask Email: e.g. "aarav.j***@***.com"
  let maskedEmail = '[Protected Minor Email]';
  if (user.email && user.email.includes('@')) {
    const [local, domain] = user.email.split('@');
    const visiblePrefix = local.slice(0, Math.min(3, local.length));
    maskedEmail = `${visiblePrefix}***@***.${domain.split('.').pop() || 'com'}`;
  }

  return {
    isMinor: true,
    privacyProtected: true,
    fullName: maskedName,
    email: maskedEmail,
    phone: '[Protected Minor Contact]'
  };
}

// 1. ORGANISATION MANAGEMENT
async function registerOrganization({
  name,
  orgType = 'company',
  description = null,
  website = null,
  contactEmail = null,
  phone = null,
  address = null,
  industrySector = null,
  logoUrl = null,
  creatorUserId
}) {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const orgResult = await db.query(
    `INSERT INTO organizations (
      name, slug, org_type, description, website, contact_email, phone, address,
      industry_sector, logo_url, verification_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
    RETURNING *`,
    [
      name.trim(),
      slug,
      orgType,
      description,
      website,
      contactEmail,
      phone,
      address,
      industrySector,
      logoUrl
    ]
  );

  const org = orgResult.rows[0];

  // Associate creator as ORGANIZATION_ADMIN
  if (creatorUserId) {
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, 'ORGANIZATION_ADMIN', 'Active')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'ORGANIZATION_ADMIN', status = 'Active'`,
      [org.id, creatorUserId]
    );
  }

  return org;
}

async function getOrganizationById(organizationId) {
  const result = await db.query(
    `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId]
  );
  return result.rows[0] || null;
}

async function updateOrganization(organizationId, updateData) {
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
  } = updateData;

  const updates = [];
  const values = [];
  let paramIdx = 1;

  if (name !== undefined && name.trim()) {
    updates.push(`name = $${paramIdx++}`);
    values.push(name.trim());
  }
  if (orgType !== undefined) {
    updates.push(`org_type = $${paramIdx++}`);
    values.push(orgType);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(description);
  }
  if (website !== undefined) {
    updates.push(`website = $${paramIdx++}`);
    values.push(website);
  }
  if (contactEmail !== undefined) {
    updates.push(`contact_email = $${paramIdx++}`);
    values.push(contactEmail);
  }
  if (phone !== undefined) {
    updates.push(`phone = $${paramIdx++}`);
    values.push(phone);
  }
  if (address !== undefined) {
    updates.push(`address = $${paramIdx++}`);
    values.push(address);
  }
  if (industrySector !== undefined) {
    updates.push(`industry_sector = $${paramIdx++}`);
    values.push(industrySector);
  }
  if (logoUrl !== undefined) {
    updates.push(`logo_url = $${paramIdx++}`);
    values.push(logoUrl);
  }

  if (updates.length === 0) {
    return getOrganizationById(organizationId);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(organizationId);

  const query = `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`;
  const result = await db.query(query, values);
  return result.rows[0];
}

async function verifyOrganization(organizationId, { verificationStatus, verificationNotes, verifiedBy }) {
  const result = await db.query(
    `UPDATE organizations 
     SET verification_status = $1,
         verification_notes = $2,
         verified_by = $3,
         verified_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND deleted_at IS NULL
     RETURNING *`,
    [verificationStatus, verificationNotes || null, verifiedBy, organizationId]
  );
  return result.rows[0] || null;
}

async function listOrganizations({ verificationStatus, orgType, limit = 50, offset = 0 } = {}) {
  const conditions = ['deleted_at IS NULL'];
  const values = [];
  let paramIdx = 1;

  if (verificationStatus) {
    conditions.push(`verification_status = $${paramIdx++}`);
    values.push(verificationStatus);
  }
  if (orgType) {
    conditions.push(`org_type = $${paramIdx++}`);
    values.push(orgType);
  }

  values.push(limit);
  const limitIdx = paramIdx++;
  values.push(offset);
  const offsetIdx = paramIdx++;

  const query = `
    SELECT id, name, slug, org_type, description, website, contact_email,
           industry_sector, logo_url, verification_status, verified_at, created_at
    FROM organizations
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await db.query(query, values);
  return result.rows;
}

// 2. ORGANISATION DASHBOARD & METRICS
async function getOrganizationDashboardMetrics(organizationId) {
  // 1. Opportunities counts
  const oppResult = await db.query(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'published') as active_opportunities,
       COUNT(*) FILTER (WHERE opportunity_type = 'project_challenge' AND status = 'published') as published_challenges,
       COUNT(*) as total_opportunities
     FROM capacity_opportunities 
     WHERE organization_id = $1`,
    [organizationId]
  );
  const oppStats = oppResult.rows[0] || {};

  // 2. Applications stats & breakdown
  const appResult = await db.query(
    `SELECT 
       COUNT(*) as total_applications,
       COUNT(*) FILTER (WHERE status = 'submitted') as submitted_count,
       COUNT(*) FILTER (WHERE status = 'reviewing') as reviewing_count,
       COUNT(*) FILTER (WHERE status = 'shortlisted') as shortlisted_count,
       COUNT(*) FILTER (WHERE status = 'accepted') as accepted_count,
       COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
       COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn_count,
       COUNT(DISTINCT student_id) as total_candidates
     FROM capacity_applications
     WHERE organization_id = $1`,
    [organizationId]
  );
  const appStats = appResult.rows[0] || {};

  // 3. Mentorship stats
  const mentorResult = await db.query(
    `SELECT 
       COUNT(DISTINCT id) FILTER (WHERE is_active = true) as active_mentors
     FROM capacity_mentors
     WHERE organization_id = $1`,
    [organizationId]
  );
  const activeMentors = parseInt(mentorResult.rows[0]?.active_mentors || '0', 10);

  const sessionResult = await db.query(
    `SELECT 
       COUNT(*) as total_sessions,
       COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
       COUNT(*) FILTER (WHERE status = 'scheduled') as upcoming_sessions,
       AVG(student_feedback_rating) as avg_rating
     FROM capacity_mentorship_sessions
     WHERE organization_id = $1`,
    [organizationId]
  );
  const sessionStats = sessionResult.rows[0] || {};

  // 4. Candidate skill distribution (from applicants)
  const skillsResult = await db.query(
    `SELECT sps.skill_name, COUNT(DISTINCT ca.student_id) as student_count
     FROM capacity_applications ca
     JOIN student_intelligence_profiles sip ON ca.student_id = sip.user_id
     JOIN student_profile_skills sps ON sip.id = sps.profile_id
     WHERE ca.organization_id = $1
     GROUP BY sps.skill_name
     ORDER BY student_count DESC
     LIMIT 10`,
    [organizationId]
  );

  // 5. Recent applications
  const recentAppsResult = await db.query(
    `SELECT 
       ca.id, ca.opportunity_id, ca.student_id, ca.status, ca.applicant_segment,
       ca.submitted_at, co.title as opportunity_title, co.opportunity_type,
       u.name as student_name, u.email as student_email
     FROM capacity_applications ca
     JOIN capacity_opportunities co ON ca.opportunity_id = co.id
     JOIN users u ON ca.student_id = u.id
     WHERE ca.organization_id = $1
     ORDER BY ca.submitted_at DESC
     LIMIT 8`,
    [organizationId]
  );

  const totalApps = parseInt(appStats.total_applications || '0', 10);
  const acceptedApps = parseInt(appStats.accepted_count || '0', 10);
  const conversionRate = totalApps > 0 ? Number(((acceptedApps / totalApps) * 100).toFixed(1)) : 0;

  return {
    organizationId,
    activeOpportunities: parseInt(oppStats.active_opportunities || '0', 10),
    publishedChallenges: parseInt(oppStats.published_challenges || '0', 10),
    totalOpportunities: parseInt(oppStats.total_opportunities || '0', 10),
    totalApplications: totalApps,
    totalCandidates: parseInt(appStats.total_candidates || '0', 10),
    applicationsBreakdown: {
      submitted: parseInt(appStats.submitted_count || '0', 10),
      reviewing: parseInt(appStats.reviewing_count || '0', 10),
      shortlisted: parseInt(appStats.shortlisted_count || '0', 10),
      accepted: acceptedApps,
      rejected: parseInt(appStats.rejected_count || '0', 10),
      withdrawn: parseInt(appStats.withdrawn_count || '0', 10)
    },
    conversionRatePercentage: conversionRate,
    mentorship: {
      activeMentors,
      totalSessions: parseInt(sessionStats.total_sessions || '0', 10),
      completedSessions: parseInt(sessionStats.completed_sessions || '0', 10),
      upcomingSessions: parseInt(sessionStats.upcoming_sessions || '0', 10),
      averageRating: sessionStats.avg_rating ? Number(parseFloat(sessionStats.avg_rating).toFixed(1)) : 5.0
    },
    skillDistribution: skillsResult.rows.map(r => ({
      skill: r.skill_name,
      count: parseInt(r.student_count, 10)
    })),
    recentApplications: recentAppsResult.rows
  };
}

// 3. STUDENT DISCOVERY & TALENT EXPLORATION (With Minor Privacy Protections)
async function discoverStudents({
  organizationId,
  skills,
  segment,
  search,
  limit = 20,
  offset = 0
}) {
  const conditions = ['sip.onboarding_completed = true'];
  const values = [];
  let paramIdx = 1;

  if (segment) {
    conditions.push(`sip.student_segment = $${paramIdx++}`);
    values.push(segment);
  }

  if (search) {
    conditions.push(`(u.name ILIKE $${paramIdx} OR sip.target_career_path ILIKE $${paramIdx} OR sip.stream_or_focus ILIKE $${paramIdx})`);
    values.push(`%${search.trim()}%`);
    paramIdx++;
  }

  values.push(limit);
  const limitIdx = paramIdx++;
  values.push(offset);
  const offsetIdx = paramIdx++;

  const query = `
    SELECT 
      sip.id as profile_id,
      sip.user_id,
      sip.student_segment,
      sip.academic_class,
      sip.stream_or_focus,
      sip.target_career_path,
      sip.learning_style,
      sip.institution_name,
      sip.xp_points,
      u.name,
      u.email,
      u.phone,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'skillName', sps.skill_name,
            'proficiencyLevel', sps.proficiency_level,
            'verified', sps.verified
          )
        ) FILTER (WHERE sps.id IS NOT NULL),
        '[]'::json
      ) as skills,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'interestName', spi.interest_name,
            'category', spi.category
          )
        ) FILTER (WHERE spi.id IS NOT NULL),
        '[]'::json
      ) as interests,
      COALESCE(
        (SELECT is_granted FROM capacity_student_consents csc 
         WHERE csc.student_id = sip.user_id AND csc.consent_type = 'contact_sharing' LIMIT 1),
        false
      ) as contact_consent
    FROM student_intelligence_profiles sip
    JOIN users u ON sip.user_id = u.id
    LEFT JOIN student_profile_skills sps ON sip.id = sps.profile_id
    LEFT JOIN student_profile_interests spi ON sip.id = spi.profile_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY sip.id, sip.user_id, u.id
    ORDER BY sip.xp_points DESC, sip.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await db.query(query, values);

  // Apply skill filtering in-memory if skills parameter provided
  let rows = result.rows;
  if (skills && Array.isArray(skills) && skills.length > 0) {
    const requiredLower = skills.map(s => String(s).toLowerCase().trim());
    rows = rows.filter(student => {
      const studentSkillNames = (student.skills || []).map(s => String(s.skillName || '').toLowerCase());
      return requiredLower.some(req => studentSkillNames.includes(req));
    });
  }

  // Apply Minor Privacy Masking
  return rows.map(row => {
    const privacy = maskMinorData(
      { name: row.name, email: row.email, phone: row.phone },
      { student_segment: row.student_segment },
      row.contact_consent
    );

    return {
      userId: row.user_id,
      profileId: row.profile_id,
      studentSegment: row.student_segment,
      academicClass: row.academic_class,
      streamOrFocus: row.stream_or_focus,
      targetCareerPath: row.target_career_path,
      institutionName: row.institution_name,
      xpPoints: row.xp_points,
      learningStyle: row.learning_style,
      skills: row.skills || [],
      interests: row.interests || [],
      // Privacy protected fields
      isMinor: privacy.isMinor,
      privacyProtected: privacy.privacyProtected,
      displayName: privacy.fullName,
      email: privacy.email,
      phone: privacy.phone
    };
  });
}

// 4. OPPORTUNITY & CHALLENGE MANAGEMENT
async function createOpportunity({
  organizationId,
  createdBy,
  title,
  opportunityType,
  description,
  eligibilitySegments = ['junior', 'school', 'career', 'professional'],
  requiredSkills = [],
  stipendOrReward = null,
  locationType = 'remote',
  locationDetails = null,
  applicationDeadline = null,
  maxParticipants = 50,
  status = 'draft'
}) {
  const result = await db.query(
    `INSERT INTO capacity_opportunities (
      organization_id, created_by, title, opportunity_type, description,
      eligibility_segments, required_skills, stipend_or_reward,
      location_type, location_details, application_deadline,
      max_participants, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      organizationId,
      createdBy,
      title.trim(),
      opportunityType,
      description.trim(),
      JSON.stringify(eligibilitySegments),
      JSON.stringify(requiredSkills),
      stipendOrReward,
      locationType,
      locationDetails,
      applicationDeadline ? new Date(applicationDeadline) : null,
      maxParticipants,
      status
    ]
  );
  return result.rows[0];
}

async function updateOpportunity(opportunityId, organizationId, updateData) {
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
  } = updateData;

  const updates = [];
  const values = [];
  let paramIdx = 1;

  if (title !== undefined) {
    updates.push(`title = $${paramIdx++}`);
    values.push(title.trim());
  }
  if (opportunityType !== undefined) {
    updates.push(`opportunity_type = $${paramIdx++}`);
    values.push(opportunityType);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(description.trim());
  }
  if (eligibilitySegments !== undefined) {
    updates.push(`eligibility_segments = $${paramIdx++}`);
    values.push(JSON.stringify(eligibilitySegments));
  }
  if (requiredSkills !== undefined) {
    updates.push(`required_skills = $${paramIdx++}`);
    values.push(JSON.stringify(requiredSkills));
  }
  if (stipendOrReward !== undefined) {
    updates.push(`stipend_or_reward = $${paramIdx++}`);
    values.push(stipendOrReward);
  }
  if (locationType !== undefined) {
    updates.push(`location_type = $${paramIdx++}`);
    values.push(locationType);
  }
  if (locationDetails !== undefined) {
    updates.push(`location_details = $${paramIdx++}`);
    values.push(locationDetails);
  }
  if (applicationDeadline !== undefined) {
    updates.push(`application_deadline = $${paramIdx++}`);
    values.push(applicationDeadline ? new Date(applicationDeadline) : null);
  }
  if (maxParticipants !== undefined) {
    updates.push(`max_participants = $${paramIdx++}`);
    values.push(maxParticipants);
  }
  if (status !== undefined) {
    updates.push(`status = $${paramIdx++}`);
    values.push(status);
  }

  if (updates.length === 0) {
    return getOpportunityById(opportunityId);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(opportunityId);
  const oppIdx = paramIdx++;
  values.push(organizationId);
  const orgIdx = paramIdx++;

  const query = `
    UPDATE capacity_opportunities 
    SET ${updates.join(', ')} 
    WHERE id = $${oppIdx} AND organization_id = $${orgIdx}
    RETURNING *
  `;
  const result = await db.query(query, values);
  return result.rows[0] || null;
}

async function getOpportunityById(opportunityId) {
  const result = await db.query(
    `SELECT 
       co.*, 
       o.name as organization_name,
       o.slug as organization_slug,
       o.org_type,
       o.logo_url as organization_logo,
       o.verification_status,
       (SELECT COUNT(*) FROM capacity_applications ca WHERE ca.opportunity_id = co.id) as applications_count
     FROM capacity_opportunities co
     JOIN organizations o ON co.organization_id = o.id
     WHERE co.id = $1`,
    [opportunityId]
  );
  return result.rows[0] || null;
}

async function listOpportunities({
  organizationId,
  studentSegment,
  status,
  opportunityType,
  limit = 50,
  offset = 0
} = {}) {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (organizationId) {
    conditions.push(`co.organization_id = $${paramIdx++}`);
    values.push(organizationId);
  }

  if (status) {
    conditions.push(`co.status = $${paramIdx++}`);
    values.push(status);
  }

  if (opportunityType) {
    conditions.push(`co.opportunity_type = $${paramIdx++}`);
    values.push(opportunityType);
  }

  if (studentSegment) {
    conditions.push(`co.eligibility_segments @> $${paramIdx++}::jsonb`);
    values.push(JSON.stringify([studentSegment]));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  values.push(limit);
  const limitIdx = paramIdx++;
  values.push(offset);
  const offsetIdx = paramIdx++;

  const query = `
    SELECT 
      co.*,
      o.name as organization_name,
      o.slug as organization_slug,
      o.org_type,
      o.logo_url as organization_logo,
      o.verification_status,
      (SELECT COUNT(*) FROM capacity_applications ca WHERE ca.opportunity_id = co.id) as applications_count
    FROM capacity_opportunities co
    JOIN organizations o ON co.organization_id = o.id
    ${whereClause}
    ORDER BY co.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await db.query(query, values);
  return result.rows;
}

// 5. STUDENT APPLICATION SYSTEM
async function applyToOpportunity({
  opportunityId,
  studentId,
  coverNote = null,
  portfolioLink = null,
  applicantSegment = null
}) {
  const opp = await getOpportunityById(opportunityId);
  if (!opp) {
    throw new ApiError(404, 'Opportunity not found.');
  }

  if (opp.status !== 'published') {
    throw new ApiError(400, 'This opportunity is not currently accepting applications.');
  }

  if (opp.application_deadline && new Date(opp.application_deadline) < new Date()) {
    throw new ApiError(400, 'The application deadline for this opportunity has passed.');
  }

  // Segment eligibility check
  if (applicantSegment) {
    const eligibleSegments = opp.eligibility_segments || [];
    if (eligibleSegments.length > 0 && !eligibleSegments.includes(applicantSegment)) {
      throw new ApiError(400, `This opportunity is restricted to ${eligibleSegments.join(', ')} students.`);
    }
  }

  // Check duplicate application
  const existingResult = await db.query(
    `SELECT id, status FROM capacity_applications WHERE opportunity_id = $1 AND student_id = $2`,
    [opportunityId, studentId]
  );
  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0];
    if (existing.status === 'withdrawn') {
      // Re-apply if previously withdrawn
      const reactivated = await db.query(
        `UPDATE capacity_applications 
         SET status = 'submitted', 
             cover_note = $1, 
             portfolio_link = $2, 
             applicant_segment = $3,
             submitted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [coverNote, portfolioLink, applicantSegment, existing.id]
      );
      return reactivated.rows[0];
    }
    throw new ApiError(409, 'You have already submitted an application for this opportunity.');
  }

  const result = await db.query(
    `INSERT INTO capacity_applications (
      opportunity_id, student_id, organization_id, status, cover_note,
      portfolio_link, applicant_segment
    ) VALUES ($1, $2, $3, 'submitted', $4, $5, $6)
    RETURNING *`,
    [
      opportunityId,
      studentId,
      opp.organization_id,
      coverNote,
      portfolioLink,
      applicantSegment
    ]
  );

  return result.rows[0];
}

async function getStudentApplications(studentId) {
  const result = await db.query(
    `SELECT 
       ca.*,
       co.title as opportunity_title,
       co.opportunity_type,
       co.stipend_or_reward,
       co.location_type,
       co.location_details,
       co.application_deadline,
       o.id as organization_id,
       o.name as organization_name,
       o.org_type,
       o.logo_url as organization_logo,
       o.verification_status
     FROM capacity_applications ca
     JOIN capacity_opportunities co ON ca.opportunity_id = co.id
     JOIN organizations o ON ca.organization_id = o.id
     WHERE ca.student_id = $1
     ORDER BY ca.submitted_at DESC`,
    [studentId]
  );
  return result.rows;
}

async function getOrganizationApplications(organizationId, { opportunityId, status, limit = 50, offset = 0 } = {}) {
  const conditions = ['ca.organization_id = $1'];
  const values = [organizationId];
  let paramIdx = 2;

  if (opportunityId) {
    conditions.push(`ca.opportunity_id = $${paramIdx++}`);
    values.push(opportunityId);
  }

  if (status) {
    conditions.push(`ca.status = $${paramIdx++}`);
    values.push(status);
  }

  values.push(limit);
  const limitIdx = paramIdx++;
  values.push(offset);
  const offsetIdx = paramIdx++;

  const query = `
    SELECT 
      ca.*,
      co.title as opportunity_title,
      co.opportunity_type,
      u.name as student_name,
      u.email as student_email,
      u.phone as student_phone,
      sip.student_segment,
      sip.academic_class,
      sip.target_career_path,
      sip.xp_points,
      COALESCE(
        (SELECT is_granted FROM capacity_student_consents csc 
         WHERE csc.student_id = ca.student_id AND csc.consent_type = 'contact_sharing' LIMIT 1),
        false
      ) as contact_consent
    FROM capacity_applications ca
    JOIN capacity_opportunities co ON ca.opportunity_id = co.id
    JOIN users u ON ca.student_id = u.id
    LEFT JOIN student_intelligence_profiles sip ON ca.student_id = sip.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ca.submitted_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await db.query(query, values);

  // Apply minor protection masking
  return result.rows.map(row => {
    const privacy = maskMinorData(
      { name: row.student_name, email: row.student_email, phone: row.student_phone },
      { student_segment: row.student_segment || row.applicant_segment },
      row.contact_consent
    );

    return {
      ...row,
      isMinor: privacy.isMinor,
      privacyProtected: privacy.privacyProtected,
      student_name: privacy.fullName,
      student_email: privacy.email,
      student_phone: privacy.phone
    };
  });
}

async function updateApplicationStatus({
  applicationId,
  organizationId,
  status,
  reviewerFeedback = null,
  reviewedBy
}) {
  const validStatuses = ['submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid application status: ${status}.`);
  }

  // Retrieve existing
  const currentResult = await db.query(
    `SELECT * FROM capacity_applications WHERE id = $1 AND organization_id = $2`,
    [applicationId, organizationId]
  );
  if (currentResult.rows.length === 0) {
    throw new ApiError(404, 'Application not found in this organization.');
  }

  const existing = currentResult.rows[0];
  if (existing.status === 'withdrawn') {
    throw new ApiError(400, 'Cannot update a withdrawn application.');
  }

  const result = await db.query(
    `UPDATE capacity_applications 
     SET status = $1,
         reviewer_feedback = $2,
         reviewed_by = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND organization_id = $5
     RETURNING *`,
    [status, reviewerFeedback, reviewedBy, applicationId, organizationId]
  );

  return result.rows[0];
}

async function withdrawApplication(applicationId, studentId) {
  const currentResult = await db.query(
    `SELECT * FROM capacity_applications WHERE id = $1 AND student_id = $2`,
    [applicationId, studentId]
  );
  if (currentResult.rows.length === 0) {
    throw new ApiError(404, 'Application not found.');
  }

  const app = currentResult.rows[0];
  if (['accepted', 'rejected'].includes(app.status)) {
    throw new ApiError(400, `Cannot withdraw an application that has already been ${app.status}.`);
  }

  if (app.status === 'withdrawn') {
    return app;
  }

  const result = await db.query(
    `UPDATE capacity_applications 
     SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 AND student_id = $2 
     RETURNING *`,
    [applicationId, studentId]
  );
  return result.rows[0];
}

// 6. MENTORSHIP & GUIDANCE SYSTEM
async function registerMentor({
  organizationId,
  userId,
  title,
  bio = null,
  expertiseAreas = [],
  maxMentees = 5
}) {
  const result = await db.query(
    `INSERT INTO capacity_mentors (
      organization_id, user_id, title, bio, expertise_areas, max_mentees, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, true)
    ON CONFLICT (organization_id, user_id) 
    DO UPDATE SET 
      title = EXCLUDED.title,
      bio = EXCLUDED.bio,
      expertise_areas = EXCLUDED.expertise_areas,
      max_mentees = EXCLUDED.max_mentees,
      is_active = true,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [
      organizationId,
      userId,
      title.trim(),
      bio,
      JSON.stringify(expertiseAreas),
      maxMentees
    ]
  );
  return result.rows[0];
}

async function getOrganizationMentors(organizationId) {
  const result = await db.query(
    `SELECT cm.*, u.name as mentor_name, u.email as mentor_email, u.avatar_url
     FROM capacity_mentors cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.organization_id = $1 AND cm.is_active = true
     ORDER BY cm.created_at DESC`,
    [organizationId]
  );
  return result.rows;
}

async function listAvailableMentors({ expertiseArea = null, limit = 20, offset = 0 } = {}) {
  const conditions = ['cm.is_active = true', 'o.verification_status = $1', 'o.deleted_at IS NULL'];
  const values = ['verified'];
  let paramIdx = 2;

  if (expertiseArea) {
    conditions.push(`cm.expertise_areas @> $${paramIdx++}::jsonb`);
    values.push(JSON.stringify([expertiseArea]));
  }

  values.push(limit);
  const limitIdx = paramIdx++;
  values.push(offset);
  const offsetIdx = paramIdx++;

  const query = `
    SELECT 
      cm.*,
      u.name as mentor_name,
      u.avatar_url,
      o.name as organization_name,
      o.slug as organization_slug,
      o.org_type,
      (SELECT COUNT(*) FROM capacity_mentorship_sessions cms 
       WHERE cms.mentor_id = cm.id AND cms.status = 'completed') as completed_sessions_count
    FROM capacity_mentors cm
    JOIN users u ON cm.user_id = u.id
    JOIN organizations o ON cm.organization_id = o.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cm.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await db.query(query, values);
  return result.rows;
}

async function requestMentorship({ mentorId, studentId, topic, message }) {
  // Verify mentor exists and get organization_id
  const mentorResult = await db.query(
    `SELECT cm.*, o.id as organization_id 
     FROM capacity_mentors cm 
     JOIN organizations o ON cm.organization_id = o.id 
     WHERE cm.id = $1 AND cm.is_active = true`,
    [mentorId]
  );
  if (mentorResult.rows.length === 0) {
    throw new ApiError(404, 'Active mentor not found.');
  }

  const mentor = mentorResult.rows[0];

  const result = await db.query(
    `INSERT INTO capacity_mentorship_requests (
      mentor_id, student_id, organization_id, topic, message, status
    ) VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING *`,
    [mentorId, studentId, mentor.organization_id, topic.trim(), message.trim()]
  );

  return result.rows[0];
}

async function getMentorshipRequests({ mentorId, studentId, organizationId, status } = {}) {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (mentorId) {
    conditions.push(`cmr.mentor_id = $${paramIdx++}`);
    values.push(mentorId);
  }
  if (studentId) {
    conditions.push(`cmr.student_id = $${paramIdx++}`);
    values.push(studentId);
  }
  if (organizationId) {
    conditions.push(`cmr.organization_id = $${paramIdx++}`);
    values.push(organizationId);
  }
  if (status) {
    conditions.push(`cmr.status = $${paramIdx++}`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      cmr.*,
      cm.title as mentor_title,
      u_mentor.name as mentor_name,
      u_student.name as student_name,
      u_student.email as student_email,
      o.name as organization_name
    FROM capacity_mentorship_requests cmr
    JOIN capacity_mentors cm ON cmr.mentor_id = cm.id
    JOIN users u_mentor ON cm.user_id = u_mentor.id
    JOIN users u_student ON cmr.student_id = u_student.id
    JOIN organizations o ON cmr.organization_id = o.id
    ${whereClause}
    ORDER BY cmr.created_at DESC
  `;

  const result = await db.query(query, values);
  return result.rows;
}

async function updateMentorshipRequestStatus({ requestId, status, responseNote = null }) {
  const valid = ['accepted', 'declined', 'completed', 'cancelled'];
  if (!valid.includes(status)) {
    throw new ApiError(400, `Invalid request status: ${status}`);
  }

  const result = await db.query(
    `UPDATE capacity_mentorship_requests 
     SET status = $1, response_note = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [status, responseNote, requestId]
  );
  return result.rows[0] || null;
}

async function scheduleMentorshipSession({
  requestId = null,
  mentorId,
  studentId,
  organizationId,
  scheduledAt,
  durationMinutes = 45,
  meetingLink = null,
  agenda,
  notes = null
}) {
  const result = await db.query(
    `INSERT INTO capacity_mentorship_sessions (
      request_id, mentor_id, student_id, organization_id,
      scheduled_at, duration_minutes, meeting_link, agenda, notes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
    RETURNING *`,
    [
      requestId,
      mentorId,
      studentId,
      organizationId,
      new Date(scheduledAt),
      durationMinutes,
      meetingLink,
      agenda.trim(),
      notes
    ]
  );

  if (requestId) {
    await db.query(
      `UPDATE capacity_mentorship_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [requestId]
    );
  }

  return result.rows[0];
}

async function getMentorshipSessions({ organizationId, mentorId, studentId, status } = {}) {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (organizationId) {
    conditions.push(`cms.organization_id = $${paramIdx++}`);
    values.push(organizationId);
  }
  if (mentorId) {
    conditions.push(`cms.mentor_id = $${paramIdx++}`);
    values.push(mentorId);
  }
  if (studentId) {
    conditions.push(`cms.student_id = $${paramIdx++}`);
    values.push(studentId);
  }
  if (status) {
    conditions.push(`cms.status = $${paramIdx++}`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      cms.*,
      cm.title as mentor_title,
      u_mentor.name as mentor_name,
      u_student.name as student_name,
      u_student.email as student_email,
      o.name as organization_name
    FROM capacity_mentorship_sessions cms
    JOIN capacity_mentors cm ON cms.mentor_id = cm.id
    JOIN users u_mentor ON cm.user_id = u_mentor.id
    JOIN users u_student ON cms.student_id = u_student.id
    JOIN organizations o ON cms.organization_id = o.id
    ${whereClause}
    ORDER BY cms.scheduled_at ASC
  `;

  const result = await db.query(query, values);
  return result.rows;
}

async function completeMentorshipSession({ sessionId, outcomeSummary, notes }) {
  const result = await db.query(
    `UPDATE capacity_mentorship_sessions
     SET status = 'completed',
         outcome_summary = $1,
         notes = COALESCE($2, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [outcomeSummary, notes, sessionId]
  );
  return result.rows[0] || null;
}

async function submitSessionFeedback({ sessionId, studentId, rating, notes = null }) {
  const result = await db.query(
    `UPDATE capacity_mentorship_sessions
     SET student_feedback_rating = $1,
         student_feedback_notes = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND student_id = $4
     RETURNING *`,
    [rating, notes, sessionId, studentId]
  );
  return result.rows[0] || null;
}

// 7. ANALYTICS & REPORTING
async function getOrganizationAnalyticsReport(organizationId) {
  const metrics = await getOrganizationDashboardMetrics(organizationId);

  // Opportunity conversion funnel
  const oppTypesResult = await db.query(
    `SELECT opportunity_type, COUNT(*) as count
     FROM capacity_opportunities
     WHERE organization_id = $1
     GROUP BY opportunity_type`,
    [organizationId]
  );

  // Segment participation breakdown
  const segmentsResult = await db.query(
    `SELECT COALESCE(applicant_segment, 'unspecified') as segment, COUNT(*) as count
     FROM capacity_applications
     WHERE organization_id = $1
     GROUP BY applicant_segment`,
    [organizationId]
  );

  // Total mentoring hours delivered
  const hoursResult = await db.query(
    `SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
     FROM capacity_mentorship_sessions
     WHERE organization_id = $1 AND status = 'completed'`,
    [organizationId]
  );
  const totalMentoringHours = Number((parseInt(hoursResult.rows[0]?.total_minutes || '0', 10) / 60).toFixed(1));

  return {
    organizationId,
    metrics,
    opportunitiesByType: oppTypesResult.rows.map(r => ({
      type: r.opportunity_type,
      count: parseInt(r.count, 10)
    })),
    applicationsBySegment: segmentsResult.rows.map(r => ({
      segment: r.segment,
      count: parseInt(r.count, 10)
    })),
    mentorshipImpact: {
      totalHours: totalMentoringHours,
      averageRating: metrics.mentorship.averageRating,
      completedSessions: metrics.mentorship.completedSessions
    }
  };
}

// 8. STUDENT CONSENTS (Minor Protection)
async function getStudentConsent(studentId, consentType = 'contact_sharing') {
  const result = await db.query(
    `SELECT * FROM capacity_student_consents WHERE student_id = $1 AND consent_type = $2`,
    [studentId, consentType]
  );
  return result.rows[0] || null;
}

async function updateStudentConsent(studentId, { consentType = 'contact_sharing', isGranted, parentEmail = null }) {
  const result = await db.query(
    `INSERT INTO capacity_student_consents (
      student_id, consent_type, is_granted, parent_email, granted_at
    ) VALUES ($1, $2, $3, $4, CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (student_id, consent_type)
    DO UPDATE SET 
      is_granted = EXCLUDED.is_granted,
      parent_email = COALESCE(EXCLUDED.parent_email, capacity_student_consents.parent_email),
      granted_at = CASE WHEN EXCLUDED.is_granted = true THEN CURRENT_TIMESTAMP ELSE NULL END
    RETURNING *`,
    [studentId, consentType, isGranted, parentEmail]
  );
  return result.rows[0];
}

module.exports = {
  maskMinorData,
  registerOrganization,
  getOrganizationById,
  updateOrganization,
  verifyOrganization,
  listOrganizations,
  getOrganizationDashboardMetrics,
  discoverStudents,
  createOpportunity,
  updateOpportunity,
  getOpportunityById,
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
  getMentorshipRequests,
  updateMentorshipRequestStatus,
  scheduleMentorshipSession,
  getMentorshipSessions,
  completeMentorshipSession,
  submitSessionFeedback,
  getOrganizationAnalyticsReport,
  getStudentConsent,
  updateStudentConsent
};

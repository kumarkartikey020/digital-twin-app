const portfolioModel = require('../models/portfolioModel');
const capacityModel = require('../models/capacityConnectModel');
const ApiError = require('../utils/apiError');

// 1. STUDENT PORTFOLIO VIEW & UPDATE
async function getMyPortfolio(req, res, next) {
  try {
    const portfolio = await portfolioModel.getStudentPortfolio(req.user.id, {
      viewerUserId: req.user.id
    });
    res.json({ success: true, data: portfolio });
  } catch (error) {
    next(error);
  }
}

async function updateMyPortfolio(req, res, next) {
  try {
    const updated = await portfolioModel.updatePortfolioMeta(req.user.id, req.body);
    res.json({
      success: true,
      message: 'Portfolio updated successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentPortfolioById(req, res, next) {
  try {
    const { studentId } = req.params;
    const isOwner = req.user && String(req.user.id) === String(studentId);
    
    // Check if requester is viewing in the context of an organisation
    const isOrgViewer = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');

    const portfolio = await portfolioModel.getStudentPortfolio(studentId, {
      viewerUserId: req.user?.id || null,
      isOrgViewer
    });

    res.json({ success: true, data: portfolio });
  } catch (error) {
    next(error);
  }
}

// 2. PROJECT SHOWCASE CRUD
async function createProject(req, res, next) {
  try {
    const project = await portfolioModel.createProject(req.user.id, req.body);
    res.status(201).json({
      success: true,
      message: 'Project published successfully to your showcase.',
      data: project
    });
  } catch (error) {
    next(error);
  }
}

async function updateProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await portfolioModel.updateProject(projectId, req.user.id, req.body);
    res.json({
      success: true,
      message: 'Project updated successfully.',
      data: project
    });
  } catch (error) {
    next(error);
  }
}

async function deleteProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await portfolioModel.deleteProject(projectId, req.user.id);
    res.json({
      success: true,
      message: 'Project removed from showcase.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function getProjectById(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await portfolioModel.getProjectById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found.');
    }
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
}

// 3. CERTIFICATIONS CRUD
async function addCertification(req, res, next) {
  try {
    const cert = await portfolioModel.addCertification(req.user.id, req.body);
    res.status(201).json({
      success: true,
      message: 'Certification added to portfolio.',
      data: cert
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCertification(req, res, next) {
  try {
    const { certId } = req.params;
    const result = await portfolioModel.deleteCertification(certId, req.user.id);
    res.json({
      success: true,
      message: 'Certification removed from portfolio.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

// 4. ACHIEVEMENTS SYSTEM
async function getAchievements(req, res, next) {
  try {
    const achievements = await portfolioModel.evaluateAndAwardAchievements(req.user.id);
    res.json({
      success: true,
      data: {
        total: achievements.length,
        achievements,
        catalog: portfolioModel.ACHIEVEMENTS_CATALOG
      }
    });
  } catch (error) {
    next(error);
  }
}

// 5. ORGANISATION INTEGRATION
async function getOrgCandidatePortfolio(req, res, next) {
  try {
    const { organizationId, studentId } = req.params;

    // Check organization verification status
    const org = await capacityModel.getOrganizationById(organizationId);
    if (!org) {
      throw new ApiError(404, 'Organisation not found.');
    }

    if (org.verification_status !== 'verified') {
      throw new ApiError(403, 'Organisation must be verified to access candidate portfolios.');
    }

    const portfolio = await portfolioModel.getStudentPortfolio(studentId, {
      viewerUserId: req.user.id,
      isOrgViewer: true
    });

    res.json({
      success: true,
      message: 'Candidate portfolio retrieved successfully.',
      data: portfolio
    });
  } catch (error) {
    next(error);
  }
}

async function verifyProjectByOrg(req, res, next) {
  try {
    const { organizationId, projectId } = req.params;

    // Check organization verification status
    const org = await capacityModel.getOrganizationById(organizationId);
    if (!org || org.verification_status !== 'verified') {
      throw new ApiError(403, 'Only verified organisations can endorse project showcases.');
    }

    const verifiedProject = await portfolioModel.verifyProjectByOrg(projectId, organizationId);
    res.json({
      success: true,
      message: 'Project showcase verified and endorsed by organisation.',
      data: verifiedProject
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyPortfolio,
  updateMyPortfolio,
  getStudentPortfolioById,
  createProject,
  updateProject,
  deleteProject,
  getProjectById,
  addCertification,
  deleteCertification,
  getAchievements,
  getOrgCandidatePortfolio,
  verifyProjectByOrg
};

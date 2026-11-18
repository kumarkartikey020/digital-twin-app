const express = require('express');
const Joi = require('joi');
const authController = require('../controllers/authController');
const validate = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimiter');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

const signupSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required(),
    name: Joi.string().max(120).allow('', null)
  }).required()
});

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required()
  }).required()
});

const parentLoginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required(),
    studentCode: Joi.string().required()
  }).required()
});

const googleSchema = Joi.object({
  body: Joi.object({
    idToken: Joi.string().required()
  }).required()
});

const refreshSchema = Joi.object({
  body: Joi.object({
    refreshToken: Joi.string().optional()
  }).optional()
});

const verifyOTPSchema = Joi.object({
  body: Joi.object({
    otpCode: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().messages({
      'string.length': 'Verification code must be exactly 6 digits.',
      'string.pattern.base': 'Verification code must contain digits only.'
    })
  }).required()
});

const forgotPasswordSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required()
  }).required()
});

const resetPasswordSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    otpCode: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().messages({
      'string.length': 'Verification code must be exactly 6 digits.',
      'string.pattern.base': 'Verification code must contain digits only.'
    }),
    newPassword: Joi.string().min(8).max(72).required()
  }).required()
});

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created
 */
router.post('/signup', authLimiter, validate(signupSchema), authController.signup);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authenticated
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @openapi
 * /auth/parent-login:
 *   post:
 *     summary: Login for parents with auto-registration
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, studentCode]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               studentCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authenticated
 */
router.post('/parent-login', authLimiter, validate(parentLoginSchema), authController.parentLogin);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     summary: Login with Google ID token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authenticated
 */
router.post('/google', authLimiter, validate(googleSchema), authController.loginWithGoogle);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Token refreshed
 */
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout current session
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', authLimiter, authController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 */
router.get('/me', authenticate, authController.me);

router.post('/verify-otp', authenticate, authLimiter, validate(verifyOTPSchema), authController.verifyOTP);
router.post('/resend-otp', authenticate, authLimiter, authController.resendOTP);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.get('/smtp-debug', authenticate, authorize('admin'), authController.smtpDebug);

module.exports = router;

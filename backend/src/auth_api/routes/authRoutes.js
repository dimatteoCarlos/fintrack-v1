import express from 'express';
import {
  signUpUser,
  signInUser,
  signOutUser,
  validateSession,
} from '../controllers/authController.js';
import { authRefreshToken } from '../controllers/authRefreshToken.js';
import { verifyToken, verifyOriginForCookieAuth } from '../middlewares/authMiddleware.js';
import { authLimiter, signUpLimiter } from '../middlewares/rateLimiter.js';
import { validateRequestSync } from '../middlewares/validateRequest.js';
import { signUpSchema, signInSchema } from '../../validation/zod/userSchemas.js';

const router = express.Router();

// The limiter runs first so a junk request never pays for the validation.
router.post('/sign-up', signUpLimiter, validateRequestSync(signUpSchema), signUpUser);

router.post('/sign-in', authLimiter, validateRequestSync(signInSchema), signInUser);

// refresh-token and sign-out read the refresh cookie, so they carry the CSRF origin guard.
router.post('/refresh-token', verifyOriginForCookieAuth, authRefreshToken);

router.post('/sign-out', verifyOriginForCookieAuth, signOutUser);

router.get('/validate-session', verifyToken, validateSession);

export default router;


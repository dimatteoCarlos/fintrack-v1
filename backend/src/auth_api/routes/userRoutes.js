import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js';

import {
  passwordChangeLimiter,
  profileUpdateLimiter,
} from '../middlewares/rateLimiter.js';

import {
  getUserById,
  changePassword,
  updateProfile,
} from '../controllers/userController.js';

import { validateRequestSync } from '../middlewares/validateRequest.js';

import {
  changePasswordSchema,
  updateProfileSchema,
} from '../../validation/zod/userSchemas.js';

const router = express.Router();

// All routes require authentication.
router.patch(
  '/update-profile',
  verifyToken,
  profileUpdateLimiter,
  validateRequestSync(updateProfileSchema),
  updateProfile,
);

// getUserById reads req.user.userId (the caller), never req.params: there is no
// route for fetching an arbitrary user.
router.get('/profile', verifyToken, getUserById);

router.patch(
  '/change-password',
  verifyToken,
  passwordChangeLimiter,
  validateRequestSync(changePasswordSchema),
  changePassword,
);

export default router;

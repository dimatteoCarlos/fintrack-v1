// Export routes, mounted under /api/export behind verifyToken (app.js) and exportRateLimiter,
// which applies even while the global limiter is disabled.

import express from 'express';
import { getMovementsExport, getStatementExport } from '../controllers/exportController.js';
import { exportRateLimiter } from '../middlewares/exportRateLimiter.js';

const router = express.Router();

router.get('/movements', exportRateLimiter, getMovementsExport);
router.get('/statement', exportRateLimiter, getStatementExport);

export default router;

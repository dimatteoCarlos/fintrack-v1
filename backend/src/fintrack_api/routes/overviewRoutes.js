// Overview routes. Mounted under /api/fintrack/overview, already behind
// verifyToken in app.js, so no guard is restated here.

import express from 'express';
import {
 getOverview,
 getOverviewActivity,
 getOverviewDomain,
} from '../controllers/overviewController.js';

const router = express.Router();

router.get('/', getOverview);

// Order matters: /activity also matches /:domain and the first declaration wins, so
// declared below it this would answer 400 naming "activity" as an invalid domain.
router.get('/activity', getOverviewActivity);

// The domain is a path segment and not a query parameter because it selects the
// calculator, not a filter over one result set.
router.get('/:domain', getOverviewDomain);

export default router;

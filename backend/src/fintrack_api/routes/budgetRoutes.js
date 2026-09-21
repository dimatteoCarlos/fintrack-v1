// Budget routes. Mounted under /api/fintrack, already behind verifyToken in
// app.js; every handler resolves identity from the token via
// requireUserId, and no route accepts a user ID from the client.

import express from 'express';
import {
 getBudgetAccountsStatus,
 setCurrentBudget,
 getBudgetAccountSeries,
 exportCSV,
} from '../controllers/budgetController.js';

const router = express.Router();

// POST /api/fintrack/budget/accounts/status  { accountIds: [] }
router.post('/accounts/status', getBudgetAccountsStatus);

// PUT /api/fintrack/budget/accounts/:accountId/current
// { amount, month, appliesUntil } — appliesUntil is a month or 'openEnded'.
router.put('/accounts/:accountId/current', setCurrentBudget);

// GET /api/fintrack/budget/accounts/:accountId/series?from=&to=
// Both bounds are optional and default to the last twelve months.
router.get('/accounts/:accountId/series', getBudgetAccountSeries);

// GET /api/fintrack/budget/export?accountId=&from=&to=
// All three are optional: accountId omitted covers every budget account owned,
// and an omitted range is the current month.
router.get('/export', exportCSV);

export default router;

// Debt routes. Mounted under /api/fintrack, already behind verifyToken in
// app.js; the handler resolves identity from the token via
// requireUserId, and no route accepts a user ID from the client.

import express from 'express';
import { exportDebtAnalysis } from '../controllers/debtController.js';

const router = express.Router();

// GET /api/fintrack/debt/export?month=YYYY-MM&format=csv|xlsx
// One row per counterparty at month close, direction named beside the balance; the workbook adds the
// two legs by month. Figures stay on GET /overview/debt: this route changes the format only.
router.get('/export', exportDebtAnalysis);

export default router;

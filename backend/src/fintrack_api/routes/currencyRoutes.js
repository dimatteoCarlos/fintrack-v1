// Currency conversion and rates routes.
import express from 'express';
import {
  currencyConvert,
  getAllRates,
} from '../controllers/currencyController.js';

const router = express.Router();

router.post('/convert', currencyConvert);

// GET /api/fintrack/currency/rates?base=ACCOUNTING_CURRENCY_CODE (protected)
router.get('/rates', getAllRates);

export default router;
import express from 'express';
import { getTransactionById, transferBetweenAccounts } from '../controllers/transactionController.js';

const router = express.Router();

// Transfer between accounts, used for tracker movements.
router.use('/transfer-between-accounts', transferBetweenAccounts);

// GET /api/fintrack/transaction/:transactionId, returns the transaction with FX metadata.
router.get('/:transactionId', getTransactionById);


export default router;
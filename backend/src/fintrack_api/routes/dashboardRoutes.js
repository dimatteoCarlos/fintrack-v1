import express from 'express';
import {
  dashboardMovementTransactions,
  dashboardTotalBalanceAccountByType,
  dashboardTotalBalanceAccounts,
  dashboardMovementTransactionsByType,
  dashboardMovementTransactionsSearch,
  dashboardAccountSummaryList,
} from '../controllers/dashboardController.js';
import {} from '../controllers/transactionController.js';
import { dashboardMonthlyTotalAmountByType } from '../controllers/dashboardMonthlyTotalAmountByType.js';

const router = express.Router();

// Total balance of all accounts except the compensation account (slack).
router.get('/balance/',
dashboardTotalBalanceAccounts);

// Totals of balance, budget, target, debtors and more.
router.get('/balance/type/',
dashboardTotalBalanceAccountByType);

// Summary of categories, pockets and debtors.
router.get('/balance/summary/',
 dashboardAccountSummaryList);

// Monthly total and average of expenses per category and of income.
router.get(
  '/balance/monthly_total_amount_by_type/',
  dashboardMonthlyTotalAmountByType
);
// Tracker movement transactions by movement type and its preset account.
router.get('/movements/movement/',
 dashboardMovementTransactions);

// Tracker movement transactions by period, movement type, account type or transaction type.
router.get('/movements/account_type/',
dashboardMovementTransactionsByType);

// Tracker movement transactions by period, with search over movement type, account type, transaction type and others.
router.get('/movements/search/',
  dashboardMovementTransactionsSearch);

export default router;



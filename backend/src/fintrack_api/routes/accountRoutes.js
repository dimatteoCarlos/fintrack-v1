// Account types per tracker movement: expense = bank + category_budget;
// income = bank + income_source_accounts; investment = investment_accounts;
// pocket_saving = pocket_saving_accounts; debtor = debtor_accounts.
import express from 'express';
import {
  createBasicAccount,
  createDebtorAccount,
} from '../controllers/accountCreationController.js';

import {
  getAccounts,
  getAllAccountsByType,
  getAccountById,
  getAccountsByCategory,
  getClosedAccounts,
} from '../controllers/getAccountController.js';

import { createCategoryBudgetAccount } from '../controllers/accountCategoryCreationcontroller.js';

import { getTransactionsForAccountById } from '../controllers/getTransactionsForAccountById.js';

import { exportClosedAccounts } from '../controllers/closedAccountExportController.js';

import { patchAccountById } from '../controllers/accountEditController.js';

import { verifyUser } from '../../auth_api/middlewares/authMiddleware.js';
import {
  executeAccountDeletion,
  generateImpactReport,
  getCloseAccountPreview,
  getDeletionAssessment,
} from '../controllers/accountDeleteController.js';
const router = express.Router();
router.post('/new_account/bank', createBasicAccount);

router.post('/new_account/income_source', createBasicAccount);

router.post('/new_account/investment', createBasicAccount);

router.post('/new_account/debtor', createDebtorAccount);

// No route creates a retired-type pocket account: a pocket is a planning object with its own
// table and endpoints. Read paths, catalog rows and the extension table stay for historical ids.

router.post('/new_account/category_budget', createCategoryBudgetAccount);

router.get('/allAccounts', getAccounts);

router.get('/type', getAllAccountsByType);

// Before '/:accountId', which is a catch-all: registered after it, 'closed'
// would be read as an account id and answer from the by-id route instead.
router.get('/closed', getClosedAccounts);

// The same registry as a downloadable file: every row the filter matches, where
// the list above serves one page of at most 100. Declared before '/:accountId'
// for the same catch-all reason.
router.get('/closed/export', exportClosedAccounts);

router.get('/:accountId', getAccountById);
router.get('/transactions/:accountId', getTransactionsForAccountById);

// Every category_budget account under one category name.
router.get('/category/:categoryName', getAccountsByCategory);

// Account details for the edit form: GET /api/fintrack/account/details/:accountId
router.get(
  '/details/:accountId',
  getAccountById, // same handler as '/:accountId'
);

// Partial update: PATCH /api/fintrack/account/edit/:accountId
router.patch('/edit/:accountId', patchAccountById);

// Every deletion type available and its cost, readable before a type is chosen.
// GET /api/fintrack/account/delete/assessment/:targetAccountId
// Three path segments, so '/:accountId' above cannot swallow it.
router.get(
  '/delete/assessment/:targetAccountId',
  verifyUser,
  getDeletionAssessment,
);

// Impact report before deletion:
// GET /api/fintrack/account/delete/report_of_affected_accounts/:targetAccountId
router.get(
  '/delete/report_of_affected_accounts/:targetAccountId',
  verifyUser,
  generateImpactReport,
);

// Close-screen preview: the residual and the accounts eligible to receive it under TRANSFER.
// GET /api/fintrack/account/delete/close_preview/:targetAccountId
// The residual comes from the ledger, not the balance column, so it matches the DELETE's expectedResidual.
router.get(
  '/delete/close_preview/:targetAccountId',
  verifyUser,
  getCloseAccountPreview,
);

// Executes SOFT, HARD, CLOSE or RTA deletion atomically: DELETE .../delete/:targetAccountId
// Body (RTA): deletionType, impactReport, targetAccountName. Body (CLOSE): deletionType and a
// non-empty closeReason (migration 035 check); the service raises 400 before taking the lock.
router.delete(
  '/delete/:targetAccountId',
  verifyUser,
  executeAccountDeletion,
);

export default router;

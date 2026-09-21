import pc from 'picocolors';
import { createError } from '../../utils/errorHandling.js';
import { pool } from '../../db/config/configDB.js';

import {
  getAnnulmentImpactReport,
  getPocketAllocationImpact,
  getUnattributedAnnulmentTotal,
  foldNetAdjustmentTotal,
} from '../services/delete_account/getAnnulmentImpactReport.js';

import { getRelatedAccounts } from '../services/delete_account/getRelatedAccounts.js';

import { deleteAccountService } from '../services/delete_account/deleteAccountService.js';

import { getClosePreview } from '../services/delete_account/getClosePreview.js';

import { assessAccountDeletion } from '../services/delete_account/assessAccountDeletion.js';

// Deletion types accepted by the API.
export const DELETION_TYPE_RTA = 'RTA';
export const DELETION_TYPE_HARD = 'HARD';
export const DELETION_TYPE_SOFT = 'SOFT';
export const DELETION_TYPE_CLOSE = 'CLOSE';

// SOFT is disabled: it hid the account from the lists while overview still counted
// its balance, and nothing could restore it. The service refuses it; the branch is kept.
export const SOFT_DELETION_ENABLED = false;

// RTA and HARD are refused too: both erase history that must stay. CLOSE is the only
// method the API accepts.
export const RTA_DELETION_ENABLED = false;
export const HARD_DELETION_ENABLED = false;

// CLOSE has no settlement policy (no DISCARD, no TRANSFER): a nonzero balance blocks
// it unless the request asks to reverse the balance (reverseBalance).

export const ADMIN_ACTION = 'ADMIN_ACTION';
export const USER_ACTION = 'USER_ACTION';
// Endpoint: GET /api/fintrack/account/delete/report_of_affected_accounts/:targetAccountId
export const generateImpactReport = async (req, res, next) => {
  const { userId } = req.user;
  if (!userId) {
    const message = 'User ID is required';
    console.warn(pc.blueBright(message));
    return res.status(400).json({ status: 400, message });
  }

  const targetAccountId = parseInt(req.params.targetAccountId, 10);

  if (!targetAccountId || isNaN(targetAccountId)) {
    return next(
      createError(
        400,
        'Target Account ID is required and must be a valid number.',
      ),
    );
  }

  try {
    console.log(
      pc.magenta(
        `Generating Retrospective Total Annulment impact report for User ${userId.slice(0, 5) + '...'} and Account ${targetAccountId}`,
      ),
    );

    // pocketImpact and unattributed stay out of impactReport: processRTAAnnulment relies on its shape.
    // relatedAccounts (close screen) travels with this report because both are built from
    // TARGET_ACCOUNT_TRANSACTIONS_CTE, so two endpoints cannot name different counterparties.
    const [impactReport, pocketImpact, unattributed, relatedAccounts] =
      await Promise.all([
        getAnnulmentImpactReport(pool, userId, targetAccountId),
        getPocketAllocationImpact(pool, userId, targetAccountId),
        getUnattributedAnnulmentTotal(pool, userId, targetAccountId),
        getRelatedAccounts(pool, userId, targetAccountId),
      ]);

    // Summed on the server, never in the browser: a client sum misses the unattributed
    // amount. The fold lives beside the report because the assessment endpoint shares it,
    // so two screens cannot quote different totals for one account.
    const totalNetAdjustmentAmount = foldNetAdjustmentTotal(impactReport);

    return res.status(200).json({
      status: 200,
      message: 'RTA Impact Report generated successfully.',
      data: {
        impactReport: impactReport,
        totalNetAdjustmentAmount,
        pocketImpact,
        // Feeds the close screen's related-accounts panel; same rows as impactReport.
        relatedAccounts,
        // Shown beside the report, never added to it. Nonzero means activity no live
        // account can be credited with; the screen must say so instead of letting the
        // lines silently fail to add up.
        unattributedAmount: unattributed.amount,
        unattributedTransactionCount: unattributed.transactionCount,
        targetAccountId,
        affectedAccountsCount: impactReport.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
// Endpoint: GET /api/fintrack/account/delete/close_preview/:targetAccountId
/**
 * What the close screen shows before the owner confirms, in one read. Read-only; the residual is derived
 * from the ledger as the settlement derives it, not from the stored account_balance column, which can drift.
 */
export const getCloseAccountPreview = async (req, res, next) => {
  const { userId } = req.user;

  if (!userId) {
    const message = 'User ID is required';
    console.warn(pc.blueBright(message));
    return res.status(400).json({ status: 400, message });
  }

  const targetAccountId = parseInt(req.params.targetAccountId, 10);

  if (!targetAccountId || isNaN(targetAccountId)) {
    return next(
      createError(
        400,
        'Target Account ID is required and must be a valid number.',
      ),
    );
  }

  try {
    console.log(
      pc.magenta(`Building the CLOSE preview for account ${targetAccountId}`),
    );

    const preview = await getClosePreview(pool, userId, targetAccountId);

    return res.status(200).json({
      status: 200,
      message: 'Close preview retrieved successfully.',
      data: {
        targetAccountId,
        ...preview,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Endpoint: GET /api/fintrack/account/delete/assessment/:targetAccountId
/**
 * Every deletion type this account can take and what each costs, in one read, before the preview endpoints
 * pick a type: the types are not equal choices (hard delete refuses a nonzero residual and names RTA).
 * Unlocked on purpose: a lock would be released before the owner confirms, so it guarantees nothing.
 */
export const getDeletionAssessment = async (req, res, next) => {
  const { userId } = req.user;

  if (!userId) {
    const message = 'User ID is required';
    console.warn(pc.blueBright(message));
    return res.status(400).json({ status: 400, message });
  }

  const targetAccountId = parseInt(req.params.targetAccountId, 10);

  if (!targetAccountId || isNaN(targetAccountId)) {
    return next(
      createError(
        400,
        'Target Account ID is required and must be a valid number.',
      ),
    );
  }

  try {
    console.log(
      pc.magenta(`Assessing deletion options for account ${targetAccountId}`),
    );

    const assessment = await assessAccountDeletion(
      pool,
      userId,
      targetAccountId,
    );

    return res.status(200).json({
      status: 200,
      message: 'Deletion assessment generated successfully.',
      data: {
        targetAccountId,
        ...assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Endpoint: DELETE /api/fintrack/accounts/:targetAccountId
export const executeAccountDeletion = async (req, res, next) => {
  const user = req.user;
  const { userId } = user;
  const userRole = req.user.role;
  // Parsed to a number: the derived-balance map is keyed by account_id as pg returns
  // it, so a string id misses every entry and becomes NaN.
  const targetAccountId = parseInt(req.params.targetAccountId, 10);

  // Get deletionType from query (for simple deletes) or body (for RTA confirmation)
  const deletionType = req.query.type || req.body.deletionType;

  if (!targetAccountId || Number.isNaN(targetAccountId) || !deletionType) {
    return next(
      createError(400, 'Target Account ID and Deletion Type are required.'),
    );
  }

  // impactReport is not read from the request: the service recomputes it inside the
  // transaction, so a stale or tampered client copy cannot drive the adjustment.
  // targetAccountName is client-supplied but only builds the annulment rows' display text.
  let targetAccountName = 'Unknown Account';

  if (deletionType === DELETION_TYPE_RTA) {
    targetAccountName = req.body.targetAccountName;
  }

  // CLOSE's reason field, read only for CLOSE (other types get undefined). The service
  // refuses a CLOSE whose reason is blank.
  const closeReason =
    deletionType === DELETION_TYPE_CLOSE ? req.body.closeReason : undefined;

  // Not coerced: Boolean("false") is true, and a JSON body can carry that string, so a declined reversal
  // would run. Only boolean true or the string "true" opt in; read only for CLOSE (others get undefined).
  const reverseBalance =
    deletionType === DELETION_TYPE_CLOSE
      ? req.body.reverseBalance === true || req.body.reverseBalance === 'true'
      : undefined;

  try {
    console.log(
      pc.magenta(
        `Attempting ${deletionType} deletion for Account ID: ${targetAccountId}`,
      ),
    );

    // The service owns the transaction (BEGIN/COMMIT/ROLLBACK) and data integrity.
    console.log({
      userId,
      targetAccountId,
      userRole,
      deletionType,
      targetAccountName,
    });

    const serviceResult = await deleteAccountService(
      userId,
      targetAccountId,
      userRole,
      deletionType,
      targetAccountName,
      closeReason,
      reverseBalance,
    );

    // The service returns the formatted response object (status, message, data).
    return res.status(serviceResult.status).json(serviceResult);
  } catch (error) {
    next(error);
  }
};

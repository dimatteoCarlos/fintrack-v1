// Executes the account deletion types: RTA annulment, hard, soft and CLOSE.

import pc from 'picocolors';
import { pool } from '../../../db/config/configDB.js';
import { createError, handlePostgresError } from '../../../utils/errorHandling.js';

import {
  ADMIN_ACTION,
  DELETION_TYPE_HARD,
  DELETION_TYPE_SOFT,
  DELETION_TYPE_RTA,
  DELETION_TYPE_CLOSE,
  SOFT_DELETION_ENABLED,
  RTA_DELETION_ENABLED,
  HARD_DELETION_ENABLED,
  USER_ACTION,
} from '../../controllers/accountDeleteController.js';

import { checkAndInsertAccount } from '../../../utils/fintrackUtils/accountManagement/checkAndInsertAccount.js';

import { setAccountBalanceFromLedger } from '../../../utils/fintrackUtils/accountManagement/setAccountBalanceFromLedger.js';

import { recordAnnulmentTransaction } from '../../../utils/fintrackUtils/accountDeletionUtils/recordAnnulmentTransaction.js';
import { lockAndDeriveBalances } from '../../../utils/fintrackUtils/accountManagement/lockAndDeriveBalances.js';
import { eraseAccountTail } from '../../../utils/fintrackUtils/accountDeletionUtils/eraseAccountTail.js';
// The creation-side whitelist, reused as the deletion-side guard: an account
// type a user may not create is one they may not destroy either.
import { USER_CREATABLE_ACCOUNT_TYPES } from '../../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import { assessDeletionImpact } from './getAnnulmentImpactReport.js';
import { getCurrencyCode } from '../../../utils/currencyLookup.js';
import { recordBalanceReversal } from '../../../utils/fintrackUtils/accountDeletionUtils/recordBalanceReversal.js';

// CLOSE reuses the pocket-release and budget-allocation modules instead of
// reimplementing either.
import { releasePocketCommitments } from '../../../utils/fintrackUtils/accountDeletionUtils/releasePocketCommitments.js';
import {
 resolveCurrentMonth,
 writeAllocation,
} from '../budget_services/db/budgetAllocationRepository.js';
import { getUserTimeZone } from '../../../utils/fintrackUtils/date-utils/getUserTimeZone.js';

// Reserved name of the compensation counterpart account. The only one of the many
// 'slack' comparisons that gates a destructive action; belongs in accountUtils.js
// beside NOT_BOUNDARY_ACCOUNT.
const BOUNDARY_ACCOUNT_NAME = 'slack';

// Account types CLOSE refuses at a non-zero balance. Listed explicitly, not derived
// from the catalog, so a type added there cannot silently acquire this precondition.
const CLOSE_ZERO_BALANCE_TYPES = Object.freeze([
  'bank',
  'cash',
  'investment',
  'debtor',
]);

const messages = {
  notFound: {
    status: 404,
    messagefn: (id) => `Account with ID ${id} not found`,
  },

  deletionTypeInvalid: {
    status: 400,
    messagefn: () => 'Invalid or unauthorized deletion type.',
  },

  softDeleted: {
    status: 400,
    messagefn: () =>
      `Account is already marked for deletion or could not be found`,
  },

  failedToDeleted: {
    status: 500,
    messagefn: (id, actionType) =>
      `Failed to execute  ${actionType} fo account ${id}`,
  },

  adminAction: {
    status: 200,
    messagefn: (id, deletionTypeMethod, action) =>
      `Admin ${action}: Executing ${deletionTypeMethod} on account ${id}`,
  },

  userAction: {
    status: 200,
    messagefn: (id, action) =>
      `User ${action} User: Executing ${action}  on account ${id}`,
  },

  success: {
    status: 202,
    messagefn: (id, actionType) =>
      `Account ${id} successfully processed for ${actionType}.`,
  },

  rtaSuccess: {
    status: 202,
    messagefn: (name, id, accountQty) =>
      `RTA Annulment and Hard Delete successfully executed for account ${name} (${id}). Total affected accounts adjusted: ${accountQty}.`,
  },

  rtaUserPermissionDenied: {
    status: 403,
    messagefn: () =>
      `Permission denied. RTA deletion requires administrative privileges.`,
  },
};
// Catalog ids the annulment rows need, cached for 10 minutes.
let cacheIds = null,
  cacheTimestamp = null;
const CACHE_TimeToLive = 10 * 60 * 1000; //10 min

const getCommonIds = async (clientDb) => {
  if (
    cacheIds &&
    cacheTimestamp &&
    Date.now() - cacheTimestamp < CACHE_TimeToLive
  ) {
    console.log('📦 Using cached common IDs');
    return cacheIds;
  }
  console.log('🔄 Fetching common IDs from database...');

  const queries = [
    clientDb.query(
      "SELECT movement_type_id FROM movement_types WHERE movement_type_name = 'pnl'",
    ),

    clientDb.query(
      "SELECT transaction_type_id FROM transaction_types WHERE transaction_type_name = 'deposit'",
    ),

    clientDb.query(
      "SELECT transaction_type_id FROM transaction_types WHERE transaction_type_name = 'withdraw'",
    ),
  ];

  let pnlRes, depositRes, withdrawRes;

  // Only the query is guarded: a dropped connection can fall back to a recent cache,
  // a missing catalog row cannot, so that check sits below, outside this handler.
  try {
    [pnlRes, depositRes, withdrawRes] = await Promise.all(queries);
  } catch (error) {
    console.error('❌ Failed to fetch common IDs:', error);

    if (
      cacheIds &&
      cacheIds.pnlMovementTypeId &&
      cacheIds.depositTypeId &&
      cacheIds.withdrawTypeId
    ) {
      console.warn('⚠️ Using stale cache due to fetch error');
      return cacheIds;
    }

    throw createError(
      500,
      'Could not read the transaction/movement type catalog, and no cached ids are available.',
    );
  }

  // Outside the try so a missing catalog row fails loudly instead of being swallowed
  // by the catch and answered with invented ids.
  if (
    pnlRes.rows.length === 0 ||
    depositRes.rows.length === 0 ||
    withdrawRes.rows.length === 0
  ) {
    throw createError(
      500,
      'Required transaction/movement types (pnl, deposit, withdraw) not found in DB.',
    );
  }

  cacheIds = {
    pnlMovementTypeId: pnlRes.rows[0].movement_type_id,

    depositTypeId: depositRes.rows[0].transaction_type_id,

    withdrawTypeId: withdrawRes.rows[0].transaction_type_id,
  };

  cacheTimestamp = Date.now();
  console.log('✅ Common IDs cached successfully');

  return cacheIds;
};

// RTA annulment on the caller's transaction: reverses the target's effect on the
// affected accounts, then erases the target.
const processRTAAnnulment = async (
  dbClient,
  userId,
  targetAccountId,
  targetAccountName,
  transactionDate,
  accountName,
) => {
  const slackAccountInfo = await checkAndInsertAccount(dbClient, userId);

  const slackAccount = slackAccountInfo.account;

  // Locks the target and computes the impact report inside that lock, so the report is
  // never a stale or client-supplied copy read before this transaction began.
  const impactReport = await assessDeletionImpact(
    dbClient,
    userId,
    targetAccountId,
  );

  console.log(
    pc.yellow(
      `Executing RTA adjustments for ${impactReport.length} affected accounts...`,
    ),
  );

  // Lock and derive every touched account before computing from it: the stored balance column
  // can drift from the ledger. The report's own balance figure stays as the owner confirmed it.
  const ledgerBalances = await lockAndDeriveBalances(dbClient, userId, [
    ...impactReport.map((row) => row.affectedAccountId),
    slackAccount.account_id,
    // The target is already locked by the assessment above; re-locking is a no-op.
    targetAccountId,
  ]);

  const ledgerBalanceOf = (accountId) =>
    parseFloat(ledgerBalances.get(accountId));

  let finalSlackBalance = ledgerBalanceOf(slackAccount.account_id);

  // A non-empty report may move no money: an unused account funded at creation has one row
  // against slackAccount itself, so both legs net to zero and the erasure removes the residual.
  // Hard delete refuses the same account with a 409; only the gate differs.
  if (impactReport.length > 0) {
    const { pnlMovementTypeId, depositTypeId, withdrawTypeId } =
      await getCommonIds(dbClient);

    // Compute every new balance before writing anything.
    const balanceCalculations = impactReport.map((row) => ({
      ...row,
      // From the locked ledger, not the report figure: they differ only if something
      // moved in between, and the ledger is the one that is right.
      newAffectedBalance:
        ledgerBalanceOf(row.affectedAccountId) +
        row.affectedAccountNetAdjustmentAmount,
    }));

    console.log('balanceCalculations', balanceCalculations);

    let totalAffectedAccountAdjustement = 0;

    for (const row of impactReport) {
      totalAffectedAccountAdjustement += row.affectedAccountNetAdjustmentAmount;
    }

    finalSlackBalance =
      ledgerBalanceOf(slackAccount.account_id) - totalAffectedAccountAdjustement;

    console.log('finalSlackBalance:', finalSlackBalance);

    for (const calculation of balanceCalculations) {
      const {
        affectedAccountId,
        affectedAccountName,
        affectedAccountCurrentBalance,
        affectedAccountNetAdjustmentAmount,

        affectedAccountCurrencyId,
        affectedAccountCurrencyCode,
        newAffectedBalance,
      } = calculation;

      const annulmentData = {
        userId,
        affectedAccountId,
        affectedAccountName,

        affectedAccountCurrentBalance,
        adjustmentAmount: affectedAccountNetAdjustmentAmount,
        newAffectedBalance,

        slackAccountId: slackAccount.account_id,
        // Logged only; derived so the log cannot contradict the arithmetic beside it.
        slackAccountCurrentBalance: ledgerBalanceOf(slackAccount.account_id),
        newSlackBalance: finalSlackBalance,

        currencyId: affectedAccountCurrencyId,
        currencyCode: affectedAccountCurrencyCode,

        targetAccountName, // client-supplied
        pnlMovementTypeId,
        depositTypeId,
        withdrawTypeId,
        transactionDate: transactionDate,
      };

      await recordAnnulmentTransaction(dbClient, annulmentData);

      // Written after the rows that justify it, taken from the ledger. It should equal
      // newAffectedBalance; if the two ever differ, the ledger figure is the right one.
      await setAccountBalanceFromLedger(dbClient, affectedAccountId, userId);
    }

    // Re-derive the compensation account once, after every counterpart row is
    // written; its rows carry the negated adjustments, so the ledger yields
    // finalSlackBalance.
    const slackRow = await setAccountBalanceFromLedger(
      dbClient,
      slackAccount.account_id,
      userId,
    );

    // Report what the column holds, not the predicted figure.
    finalSlackBalance = parseFloat(slackRow.account_balance);
  } else {
    // Not the hard-delete path despite the log line: that refuses a nonzero residual, RTA has no gate.
    // Any gate added here must compare the account columns, not the transaction type name: a zero-amount
    // bank, income_source or investment account carries a self-referential opening row typed 'deposit'.
    console.log(
      pc.yellow(
        'RTA: No net financial impact to correct. Proceeding to hard delete.',
      ),
    );
  }
  // Detach and scrub every surviving reference to the target, then drop its own rows and
  // the account. Required since migration 018: a bare DELETE fails under RESTRICT once
  // any transaction still references the account.
  await eraseAccountTail(dbClient, userId, targetAccountId, accountName);
  console.log(
    pc.red(`Target Account ${targetAccountId} and transactions ERASED.`),
  );

  return {
    adjustedAccounts: impactReport.length,
    finalSlackBalance,
  };
};

// Soft and hard delete on the caller's transaction client.
const processStandardDelete = async (
  dbClient,
  userId,
  targetAccountId,
  deletionType,
  isAdmin,
  accountCheck,
) => {
  let actionType;

  // Admin-only restriction is suspended: any owner may run any deletion type on their
  // own account. To restore it, require isAdmin for HARD here and for RTA and HARD in
  // deleteAccountService.
  if (deletionType === DELETION_TYPE_HARD) {
    actionType = ADMIN_ACTION;
    console.log(
      pc.red(`Admin HARD DELETE for account ${targetAccountId} by user ${userId}`),
    );

    // A closed account is not erasable: CLOSE keeps the row on purpose and money-holding types close
    // at zero, so the balance check alone would let HARD erase that history. Checked before the lock.
    // Without migration 034 closed_at is undefined, so every hard delete is refused; keep this strict.
    if (accountCheck.rows[0].closed_at !== null) {
      throw createError(
        400,
        `Account ${targetAccountId} was closed and settled. A closed account cannot be hard deleted; its balance has already been moved and its row is kept deliberately.`,
      );
    }

    // Settlement guard: erasing a nonzero-balance account would leave the global ledger
    // unbalanced, so it is refused. The lock keeps the balance unchanged between this
    // check and the erasure below.
    const targetBalances = await lockAndDeriveBalances(dbClient, userId, [
      targetAccountId,
    ]);
    const targetBalance = residualOf(targetBalances, targetAccountId);

    // The message names CLOSE before RTA: moving the residual out is what an owner done
    // with the account wants, while RTA writes annulment pairs that rewrite other
    // accounts' history.
    if (targetBalance !== 0) {
      throw createError(
        409,
        `Account ${targetAccountId} holds ${targetBalance} and cannot be hard-deleted until that is settled. Close it to move the residual out - transferred to an account you choose, or discarded - or use RTA instead if the account's effects on other accounts should be reversed.`,
      );
    }

    await eraseAccountTail(
      dbClient,
      userId,
      targetAccountId,
      accountCheck.rows[0].account_name,
    );
    return { actionType, deletionType, rowCount: 1 };
  } else if (deletionType === DELETION_TYPE_SOFT) {
    // Closed and soft-deleted get separate refusals: both set deleted_at, so one message
    // would misdescribe one of them. closed_at is checked first because a closed account
    // carries both columns during the dual-write window.
    if (accountCheck.rows[0].closed_at !== null) {
      throw createError(
        400,
        `Account ${targetAccountId} was closed and settled. A closed account cannot be soft deleted; its balance has already been moved and its row is kept deliberately.`,
      );
    }

    if (accountCheck.rows[0].deleted_at !== null) {
      throw createError(400, 'Account already soft deleted');
    }
    actionType = USER_ACTION;

    // No deletion leaves a pocket backed. Runs before the UPDATE, since once deleted_at is written the
    // eligibility guard would refuse the release. Shared with CLOSE; a failure rolls both steps back.
    await releasePocketCommitments(dbClient, userId, targetAccountId);

    console.log(
      pc.yellow(`User SOFT DELETE for account ${targetAccountId} by user ${userId}`),
    );
  } else {
    throw createError(400, 'Invalid or unauthorized deletion type.');
  }

  // Only the soft-delete branch reaches here. closed_at is guarded again because accountCheck was read
  // earlier: a close committing in between must not be stamped as a soft delete; rowCount 0 then throws.
  const queryText =
    'UPDATE user_accounts ua SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (ua.account_id = $1 AND ua.user_id = $2) AND ua.deleted_at IS NULL AND ua.closed_at IS NULL';
  const result = await dbClient.query(queryText, [targetAccountId, userId]);

  if (result.rowCount === 0) {
    throw createError(
      500,
      `Failed to ${deletionType} account ${targetAccountId}`,
    );
  }

  return {
    actionType,
    deletionType,
    rowCount: result.rowCount,
  };
};

// Mirrors chk_close_reason_length (migration 036); keep both in sync, or the service
// refuses what the database accepts or surfaces a constraint name, not a field name.
export const CLOSE_REASON_MAX_LENGTH = 255;

// Derived balance as a finite number. The map is keyed by numeric account_id: a string id would miss and
// parseFloat would yield NaN, which passes every '!== 0' test here, so Number() and both checks throw.
const residualOf = (balances, accountId) => {
  const balance = balances.get(Number(accountId));

  if (balance === undefined) {
    throw createError(
      500,
      `No derived balance came back for account ${accountId}. The balance map holds ${balances.size} entry(ies) and none of them is this account.`,
    );
  }

  const residual = parseFloat(balance);

  if (!Number.isFinite(residual)) {
    throw createError(
      500,
      `The derived balance of account ${accountId} is not a number: ${balance}.`,
    );
  }

  return residual;
};

/**
 * CLOSE: refuses a still-funded bank, cash, investment or debtor account, else stamps it closed and keeps
 * its identity in account_registry. Writes no transaction unless reverseBalance zeroes it against the
 * compensation account. Takes the caller's client so a verification can run it in a rolled-back transaction.
 *
 * @param {object} accountCheck - the target's user_accounts row with account_type_name joined in; the type
 *   decides whether the zero-balance refusal applies, so it is never re-queried here.
 */
export const processCloseAccount = async (
  dbClient,
  userId,
  targetAccountId,
  accountCheck,
  transactionDate,
  // Free-text closing reason; mandatory, enforced by the schema (see the check below).
  closeReason,
  // Reverse the balance first; amount, destination, date and direction follow from the balance itself.
  reverseBalance = false,
) => {
  // Closed and soft-deleted are distinguishable since migration 034. closed_at is
  // checked first: a closed account carries both columns during the dual-write window.
  if (accountCheck.rows[0].closed_at !== null) {
    throw createError(400, `Account ${targetAccountId} is already closed.`);
  }

  if (accountCheck.rows[0].deleted_at !== null) {
    throw createError(
      400,
      `Account ${targetAccountId} was deleted and cannot be closed. Closing settles a residual, and a deleted account is no longer in circulation to hold one.`,
    );
  }

  // Mirrors chk_close_reason_accompanies_closure (migration 035) so the caller gets a 400 naming the
  // field, not a 500 with a constraint name, before the row lock. trim() is no looser than the regex.
  const reason = String(closeReason ?? '').trim();

  if (reason === '') {
    throw createError(
      400,
      'closeReason is required to close an account. The account row is ' +
        'deleted by this operation and the registry entry is what survives ' +
        'it, so the reason is the only record of why the account stopped ' +
        'existing.',
    );
  }

  // Length ceiling, mirrored from migration 036's chk_close_reason_length for the same
  // reasons. Counted in characters, as the constraint does, on the trimmed reason that
  // is stored.
  if (reason.length > CLOSE_REASON_MAX_LENGTH) {
    throw createError(
      400,
      `closeReason is limited to ${CLOSE_REASON_MAX_LENGTH} characters and ` +
        `carried ${reason.length}. The registry entry is the only record of ` +
        'why the account stopped existing, so the reason is a line of text ' +
        'rather than a document.',
    );
  }

  // Lock the target and derive its balance so the refusal reads what the close acts on. A requested
  // reversal adds the compensation account (found by account_type 'boundary') to the lock set, since
  // two concurrent closes both post a leg on it and unlocked derivations of its balance would interleave.
  let counterpartAccount = null;

  if (reverseBalance) {
    const { account } = await checkAndInsertAccount(dbClient, userId);
    counterpartAccount = account;
  }

  const lockSet = counterpartAccount
    ? [targetAccountId, counterpartAccount.account_id]
    : [targetAccountId];

  const balances = await lockAndDeriveBalances(dbClient, userId, lockSet);
  let residual = residualOf(balances, targetAccountId);

  const targetTypeName = String(
    accountCheck.rows[0].account_type_name ?? '',
  ).toLowerCase();

  // The reversal runs before the refusal in this transaction, so "reversed but not closed" is
  // unreachable. Not gated on type: CLOSE_ZERO_BALANCE_TYPES only decides which types the screen
  // offers it for. The residual is set to zero, then checked against the ledger below.
  if (reverseBalance && residual !== 0) {
    const currencyCode = await getCurrencyCode(
      dbClient,
      accountCheck.rows[0].currency_id,
    );

    await recordBalanceReversal(dbClient, {
      userId,
      targetAccountId,
      targetAccountName: accountCheck.rows[0].account_name,
      counterpartAccountId: counterpartAccount.account_id,
      counterpartAccountName: counterpartAccount.account_name,
      balance: residual,
      currencyId: accountCheck.rows[0].currency_id,
      currencyCode,
      transactionDate,
    });

    // Both stored balances follow the ledger, the compensation account's too: it is
    // excluded from net worth and aggregate balances, not from itself.
    await setAccountBalanceFromLedger(dbClient, targetAccountId, userId);
    await setAccountBalanceFromLedger(
      dbClient,
      counterpartAccount.account_id,
      userId,
    );

    // Re-derived, not trusted: if the reversal did not zero the account the close must
    // not proceed, and nothing the owner sent explains it, hence a 500.
    const postReversalBalances = await lockAndDeriveBalances(
      dbClient,
      userId,
      [targetAccountId],
    );
    residual = residualOf(postReversalBalances, targetAccountId);

    if (residual !== 0) {
      throw createError(
        500,
        `Balance reversal failed to zero account ${targetAccountId} ` +
          `(balance ${residual}). Nothing was closed.`,
      );
    }

    console.log(
      pc.green(
        `CLOSE: account ${targetAccountId} reversed to zero against ${counterpartAccount.account_id}.`,
      ),
    );
  }

  // Zero-balance precondition for money-holding types (CLOSE_ZERO_BALANCE_TYPES): a balance would leave
  // net worth with no movement to explain it. income_source is exempt (its source leg goes negative with
  // every income); pocket_saving and category_budget hold no money for the rule to protect.
  if (CLOSE_ZERO_BALANCE_TYPES.includes(targetTypeName) && residual !== 0) {
    // 409, not 400: the request is well formed and the state refuses it. The message
    // names the remedy because the close screen turns it into a button.
    throw createError(
      409,
      `Account ${targetAccountId} holds ${residual} and an account of type ` +
        `'${targetTypeName}' has to reach zero before it can be closed. Move ` +
        'the balance to another of your accounts first, then close it. ' +
        'Closing moves no money and settles nothing.',
    );
  }

  // Release the account's pocket commitments before it is marked closed. A commitment only reserves part
  // of a balance, so an account at zero can still back a pocket; the zero-balance refusal does not cover
  // this. Shared with SOFT delete.
  const releasedPockets = await releasePocketCommitments(
    dbClient,
    userId,
    targetAccountId,
  );

  // Stop the budget series at this month (category_budget only). writeAllocation with a null 'to' deletes
  // every decision after 'from' and writes a zero there: past months are kept, nothing carries forward.
  // The FX metadata is an identity (rate 1) in the account's own currency, so the row matches earlier units.
  let budgetTerminatedAt = null;

  if (targetTypeName === 'category_budget') {
    const timeZone = await getUserTimeZone(dbClient, userId);
    // resolveCurrentMonth returns { month }, not the string, so it is destructured.
    const { month: currentMonth } = await resolveCurrentMonth(dbClient, timeZone);

    await writeAllocation(dbClient, targetAccountId, 0, currentMonth, null, {
      originalAmount: 0,
      originalCurrencyId: accountCheck.rows[0].currency_id,
      rate: 1,
      source: 'identity',
      fetchedAt: new Date(),
      targetCurrencyId: accountCheck.rows[0].currency_id,
    });

    budgetTerminatedAt = currentMonth;
  }

  // account_registry is written before user_accounts is marked, while the live row is still readable.
  // The category_budget extension row supplies three registry columns (category_name, subcategory,
  // category_nature_type_id) that exist nowhere else and cannot be rebuilt by parsing account_name.
  let extensionRow = null;

  if (targetTypeName === 'category_budget') {
    const extensionRead = await dbClient.query(
      `SELECT category_name, subcategory, category_nature_type_id, currency_id
         FROM category_budget_accounts
        WHERE account_id = $1`,
      [targetAccountId],
    );

    extensionRow = extensionRead.rows[0] ?? null;
  }

  // Resolved as ACCOUNTS_QUERY does, COALESCE(cba.currency_id, ua.currency_id); other types use their own.
  const resolvedCurrencyId =
    extensionRow?.currency_id ?? accountCheck.rows[0].currency_id;

  // Upsert, not UPDATE: migration 035's trigger and backfill normally create the row, but an UPDATE would
  // lose the closure where neither reached the account. Columns come from the account row, not the request.
  const registryStamp = await dbClient.query(
    `INSERT INTO account_registry (
       account_id,
       user_id,
       account_name,
       account_type_id,
       currency_id,
       account_starting_amount,
       account_start_date,
       account_created_at,
       category_name,
       subcategory,
       category_nature_type_id,
       closed_at,
       closed_by,
       close_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             CURRENT_TIMESTAMP, $2, $12)
     ON CONFLICT (account_id) DO UPDATE
       SET account_name = EXCLUDED.account_name,
           account_type_id = EXCLUDED.account_type_id,
           currency_id = EXCLUDED.currency_id,
           account_starting_amount = EXCLUDED.account_starting_amount,
           account_start_date = EXCLUDED.account_start_date,
           account_created_at = EXCLUDED.account_created_at,
           category_name = EXCLUDED.category_name,
           subcategory = EXCLUDED.subcategory,
           category_nature_type_id = EXCLUDED.category_nature_type_id,
           closed_at = EXCLUDED.closed_at,
           closed_by = EXCLUDED.closed_by,
           close_reason = EXCLUDED.close_reason
     RETURNING account_id, closed_at`,
    [
      targetAccountId,
      userId,
      accountCheck.rows[0].account_name,
      accountCheck.rows[0].account_type_id,
      resolvedCurrencyId,
      accountCheck.rows[0].account_starting_amount,
      accountCheck.rows[0].account_start_date,
      accountCheck.rows[0].created_at,
      extensionRow?.category_name ?? null,
      extensionRow?.subcategory ?? null,
      extensionRow?.category_nature_type_id ?? null,
      reason,
    ],
  );

  if (registryStamp.rowCount === 0) {
    throw createError(
      500,
      `Failed to record the closure of account ${targetAccountId}`,
    );
  }

  // The extension row is kept: deleting it would make INNER joins drop the account, and debtor and pocket
  // columns exist nowhere else. extensionRowsDeleted stays in the payload as 0: the frontend requires it.
  const extensionRowsDeleted = 0;

  // Stamp the row closed instead of deleting it, so a missing check is visible rather than an absence.
  // deleted_at is still written: readers filter on it alone, until each tests closed_at itself. The guard
  // stays deleted_at IS NULL, or this path could close a soft-deleted account (deleted_at, no closed_at).
  const markResult = await dbClient.query(
    `UPDATE user_accounts
        SET closed_at = CURRENT_TIMESTAMP,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING account_id`,
    [targetAccountId, userId],
  );

  if (markResult.rowCount === 0) {
    throw createError(500, `Failed to close account ${targetAccountId}`);
  }

  return {
    actionType: USER_ACTION,
    deletionType: DELETION_TYPE_CLOSE,
    // Balance at closing: 0 on the zero-required types, otherwise whatever the account held.
    closingBalance: residual,
    // Reported so the close screen can name the pockets that were released.
    releasedPockets,
    budgetTerminatedAt,
    // Read back from account_registry, which holds the reason and closer that user_accounts lacks.
    closeReason: reason,
    registryClosedAt: registryStamp.rows[0].closed_at,
    // Always 0: the extension row is kept.
    extensionRowsDeleted,
    rowCount: markResult.rowCount,
  };
};

// Entry point: deletes an account by deletionType (SOFT, HARD, RTA or CLOSE). RTA annuls
// the account's effect on other accounts in one atomic transaction before erasing it.
export const deleteAccountService = async (
  userId,
  targetAccountId,
  userRole,
  deletionType,
  targetAccountName = 'Unknown', // RTA only; cosmetic text for the annulment rows
  closeReason, // CLOSE only; mandatory (migration 035 CHECK)
  reverseBalance = false, // CLOSE only: reverse the balance against the compensation account first
) => {
  console.log('Executing:', 'RTA ANNULMENT EXECUTION FROM :');
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  console.log('deleteAccountService', userId);

  // The type name is joined in for the system-account guard below; INNER is safe since
  // migration 033 made account_type_id NOT NULL.
  const accountCheck = await pool.query(
    `SELECT ua.*, act.account_type_name
       FROM user_accounts ua
       JOIN account_types act ON ua.account_type_id = act.account_type_id
      WHERE ua.account_id = $1 AND ua.user_id = $2`,
    [targetAccountId, userId],
  );

  if (accountCheck.rows.length === 0) {
    throw createError(
      messages.notFound.status,
      messages.notFound.messagefn(targetAccountId),
    );
  }

 // System-created accounts (including the compensation account) cannot be deleted by any method. Reuses
 // the creation whitelist and sits before the branch to cover all four types; both arms test the row,
 // never a resolved account, since the resolver can fork and would protect only one sibling.
 const targetAccountTypeName = String(
  accountCheck.rows[0].account_type_name ?? '',
 ).toLowerCase();

 // The name arm is needed: the boundary type exists only after migration 031; before it the account is typed
 // 'bank' (whitelisted). A user account with the reserved name is an accepted false positive.
 const storedAccountName = accountCheck.rows[0].account_name;
 const isBoundaryByName =
  String(storedAccountName ?? '')
   .trim()
   .toLowerCase() === BOUNDARY_ACCOUNT_NAME;

 if (
  !USER_CREATABLE_ACCOUNT_TYPES.includes(targetAccountTypeName) ||
  isBoundaryByName
 ) {
  throw createError(
   403,
   isBoundaryByName
    ? `Account ${targetAccountId} is named '${storedAccountName}', the name the system reserves for the compensation counterpart it posts closures and reversals against. It cannot be closed, deleted or reversed. Rename it first if it is your own account.`
    : `Account ${targetAccountId} is a '${targetAccountTypeName}' account created and maintained by the system. It cannot be closed, deleted or reversed.`,
  );
 }

 // SOFT is disabled in this version: refused before any transaction opens, so no pocket
 // is released and deleted_at is never written. Its branch in processStandardDelete stays.
 if (deletionType === DELETION_TYPE_SOFT && !SOFT_DELETION_ENABLED) {
  throw createError(
   403,
   `Soft deletion is disabled in this version. Account ${targetAccountId} was not changed; close it instead.`,
  );
 }

 // RTA and HARD are disabled too: both erase the account's history, which CLOSE keeps.
 // Their implementations stay intact.
 if (
  (deletionType === DELETION_TYPE_RTA && !RTA_DELETION_ENABLED) ||
  (deletionType === DELETION_TYPE_HARD && !HARD_DELETION_ENABLED)
 ) {
  throw createError(
   403,
   `${deletionType} deletion is disabled in this version. Account ${targetAccountId} was not changed; close it instead.`,
  );
 }
  if (deletionType === DELETION_TYPE_RTA) {
    // Admin-only restriction suspended: RTA is open to the account's owner (isAdmin and
    // messages.rtaUserPermissionDenied remain for restoring it).

    // A closed account is not reversible: RTA ends in the same eraseAccountTail and would destroy the
    // history CLOSE preserves. Without migration 034 closed_at is undefined, so every RTA is refused.
    if (accountCheck.rows[0].closed_at !== null) {
      throw createError(
        400,
        `Account ${targetAccountId} was closed and settled. A closed account cannot be reverted with RTA; its residual has already been moved and reversing it now would take that amount back from the account that received it.`,
      );
    }

    let dbClient;
    try {
      const transactionDate = new Date();
      dbClient = await pool.connect();
      await dbClient.query('BEGIN');
      console.log(
        pc.red('RTA Transaction BEGIN for Target ID:'),
        targetAccountId,
      );

      const rtaData = await processRTAAnnulment(
        dbClient,
        userId,
        +targetAccountId,
        targetAccountName,
        transactionDate,
        // Name to scrub from surviving descriptions: the stored name, not the
        // client-supplied targetAccountName used for the new annulment rows' text.
        accountCheck.rows[0].account_name,
      );

      const rtaResult = {
        adjustedAccounts: rtaData.adjustedAccounts,
        finalSlackBalance: rtaData.finalSlackBalance,
        actionType: 'RTA_ANNULMENT',
      };

      await dbClient.query('COMMIT');
      console.log(pc.green('RTA Transaction COMMIT successful.'));

      console.log(
        'RTA_SUCCESS_RESPONSE msg:',
        messages.rtaSuccess.messagefn(
          targetAccountName,
          targetAccountId,
          rtaResult.adjustedAccounts,
        ),
      );

      return {
        status: messages.rtaSuccess.status,

        message: messages.rtaSuccess.messagefn(
          targetAccountName,
          targetAccountId,
          rtaResult.adjustedAccounts,
        ),

        data: {
          deletedAccountId: targetAccountId,
          action: rtaResult.actionType,
          accountsCorrected: rtaResult.adjustedAccounts,
          deletionType: DELETION_TYPE_RTA,
          finalSlackBalance: rtaResult.finalSlackBalance,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (dbClient) {
        try {
          await dbClient.query('ROLLBACK');
          console.error(
            pc.red('RTA Transaction ROLLBACK due to error:'),
            error.message,
          );
        } catch (rollbackError) {
          console.error(pc.red('CRITICAL: Rollback failed:'), rollbackError);
        }
      }

      console.error(pc.red('RTA Annulment failed:'), error);

      // 4xx business errors pass through; others are mapped from the Postgres error.
      if (error.status && error.status >= 400 && error.status < 500) {
        throw error;
      }
      const { code, message } = handlePostgresError(error);
      throw createError(code, message);
    } finally {
      if (dbClient && dbClient.release) {
        dbClient.release();
        console.log(pc.yellow('Database client released back to pool.'));
      }
    }
  } else {
    let dbClient;
    try {
      dbClient = await pool.connect();
      await dbClient.query('BEGIN');

      // Admin-only restriction suspended: hard delete is open to the account's owner. The
      // balance check in processStandardDelete is not a privilege check and stays in force.

      if (
        deletionType !== DELETION_TYPE_SOFT &&
        deletionType !== DELETION_TYPE_HARD &&
        deletionType !== DELETION_TYPE_CLOSE
      ) {
        throw createError(
          messages.deletionTypeInvalid.status,
          messages.deletionTypeInvalid.messagefn(),
        );
      }

      const deleteResult =
        deletionType === DELETION_TYPE_CLOSE
          ? await processCloseAccount(
              dbClient,
              userId,
              targetAccountId,
              accountCheck,
              new Date(),
              closeReason,
              reverseBalance,
            )
          : await processStandardDelete(
              dbClient,
              userId,
              targetAccountId,
              deletionType,
              isAdmin,
              accountCheck,
            );
      await dbClient.query('COMMIT');

      let successMessage;
      if (deletionType === DELETION_TYPE_HARD) {
        successMessage = messages.adminAction.messagefn(
          targetAccountId,
          'HARD_DELETE',
          'executed',
        );
      } else if (deletionType === DELETION_TYPE_CLOSE) {
        // Names the registry entry rather than a residual: CLOSE settles nothing.
        successMessage =
          `Account ${targetAccountId} closed and removed. Its history stays ` +
          'in the registry under the same account id.';
      } else {
        successMessage = messages.userAction.messagefn(
          targetAccountId,
          'SOFT_DELETE',
        );
      }

      return {
        status: messages.success.status,
        message: successMessage,
        data: {
          deletedAccountId: targetAccountId,
          action: deleteResult.actionType,
          deletionType: deleteResult.deletionType,
          timestamp: new Date().toISOString(),
          ...(deletionType === DELETION_TYPE_CLOSE && {
            closingBalance: deleteResult.closingBalance,
            closeReason: deleteResult.closeReason,
            registryClosedAt: deleteResult.registryClosedAt,
            releasedPockets: deleteResult.releasedPockets,
            budgetTerminatedAt: deleteResult.budgetTerminatedAt,
          }),
        },
      };
    } catch (error) {
      if (dbClient) {
        await dbClient.query('ROLLBACK');
      }

      console.error(pc.red('Standard delete failed:'), error);

      // Known failures map to the configured messages.
      if (error.message?.includes('already soft deleted')) {
        throw createError(
          messages.softDeleted.status,
          messages.softDeleted.messagefn(),
        );
      }
      if (error.message?.includes('Failed to')) {
        throw createError(
          messages.failedToDeleted.status,
          messages.failedToDeleted.messagefn(targetAccountId, deletionType),
        );
      }

      if (error.code) {
        const { code, message } = handlePostgresError(error);
        throw createError(code, message);
      }
      throw error;
    } finally {
      if (dbClient) {
        dbClient.release();
      }
    }
  }
};

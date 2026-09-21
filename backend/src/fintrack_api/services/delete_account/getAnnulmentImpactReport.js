// Reports what annulling a target account would reverse on each affected account.

import pc from 'picocolors';
import { derivedAccountBalanceSql } from '../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { lockAndDeriveBalances } from '../../../utils/fintrackUtils/accountManagement/lockAndDeriveBalances.js';

// Derived balance (opening amount plus movements); the stored column can drift from it.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'FLOAT');

// target account: the account being deleted
// affected account: an account that interacted with the target account

// The target's signed entries against a counterparty that is not itself. Shared by the
// report and the unattributed total so both always describe the same set of rows.
export const TARGET_ACCOUNT_TRANSACTIONS_CTE = `
 WITH TargetAccountTransactions AS
 (
  SELECT
   CASE
    WHEN (tr.destination_account_id = $2)
     THEN tr.source_account_id
     ELSE tr.destination_account_id
   END AS affected_account_id,
   tr.amount,
   -- The two columns below are carried for getRelatedAccounts.js (interaction count,
   -- latest interaction, the movements behind the count); the report and the
   -- unattributed total name and group their columns explicitly, so they never see them.
   -- movement_type_id is NOT NULL with a foreign key into movement_types, so an inner
   -- join on it downstream cannot drop a row.
   tr.movement_type_id,
   tr.transaction_actual_date

  FROM transactions tr

  WHERE
   tr.user_id =$1
   AND tr.account_id = $2 -- the target's own leg of each double-entry pair
   -- IS DISTINCT FROM, not !=: a prior deletion's DETACH step (eraseAccountTail.js)
   -- can leave one side NULL. != against a NULL is NULL, which a WHERE clause
   -- drops - silently discarding a real, non-self row instead of keeping it.
   AND tr.destination_account_id IS DISTINCT FROM tr.source_account_id
   AND tr.status='complete'
 )
`;

/*
 * Net impact of the target's transactions on each affected account (RTA, Retroactive Total
 * Annulment), reviewed before deletion. By double entry, the sum of the target's signed
 * amounts against an account is exactly that account's PnL adjustment.
 */
export const getAnnulmentImpactReport = async (
  dbClient,
  userId,
  targetAccountId,
) => {
  console.log(pc.blue('getAnnulmentImpactReport'));
  console.log(
    pc.blue(`Generating RTA impact report for Target ID: ${targetAccountId}`),
  );
  const reportQuery = `
${TARGET_ACCOUNT_TRANSACTIONS_CTE}
 SELECT
  tat.affected_account_id,
-- SUM of the Target's signed amounts is the required PnL adjustment for the Affected Account
  SUM(tat.amount) AS   net_adjustment_amount,
  ua.account_name AS affected_account_name,
-- Derived, not the stored column: shown beside the adjustment when the owner decides
-- whether to delete, so both figures must come from the same ledger.
  ${DERIVED_BALANCE} AS affected_account_current_balance,
  ua.currency_id,
  ct.currency_code,
  acctype.account_type_name AS affected_account_type_name

 FROM TargetAccountTransactions tat

  -- INNER, deliberately: a NULL affected_account_id is the residue of an earlier
  -- deletion's DETACH step (eraseAccountTail.js), which already reversed that amount.
  -- Re-attributing it would settle it twice and the report's total would stop matching
  -- the compensation balance the execution path re-derives. The dropped rows are
  -- reported by getUnattributedAnnulmentTotal so they do not vanish silently.
 JOIN
  user_accounts ua ON ua.account_id = tat.affected_account_id

 JOIN
  currencies ct ON ua.currency_id = ct.currency_id

  -- INNER: account_type_id is NOT NULL behind an ON DELETE RESTRICT foreign key, so an
  -- account with no type cannot exist and no adjustment row can be dropped here.
 JOIN
  account_types acctype ON ua.account_type_id = acctype.account_type_id

-- account_id and account_starting_amount are grouped because the derived balance
-- above reads them; the join pins ua.account_id to the grouped affected_account_id,
-- so every ua column is one value per group anyway.
 GROUP BY
  tat.affected_account_id,
  ua.account_id, ua.account_starting_amount,
  ua.account_name, ua.currency_id, ct.currency_code,
  acctype.account_type_name
 `;
  const rawReportResults = await dbClient.query(reportQuery, [
    userId,
    targetAccountId,
  ]);

  const reportResult = rawReportResults.rows;

  if (reportResult.length === 0) {
    console.log(
      pc.yellow(
        `No existing transactions or financial impact found for the Target Account ${targetAccountId}.`,
      ),
    );
    return [];
  }

  const impactReport = reportResult.map((row) => ({
    affectedAccountId: row.affected_account_id,

    affectedAccountName: row.affected_account_name,

    affectedAccountType: row.affected_account_type_name,

    affectedAccountCurrentBalance: parseFloat(
      row.affected_account_current_balance,
    ),

    affectedAccountNetAdjustmentAmount: parseFloat(row.net_adjustment_amount),

    affectedAccountCurrencyId: row.currency_id,
    affectedAccountCurrencyCode: row.currency_code,
  }));

  console.log(
    pc.green(
      `Report generated successfully. Total ${impactReport.length} accounts affected.`,
    ),
  );

  return impactReport;
};

/*
 * Target activity whose counterparty an earlier deletion already detached, shown so the report
 * lines add up. Returned apart from the report: execution writes a settlement pair per entry,
 * and an entry with no account id has nothing to write to. Display only, never acted on.
 *
 * @returns {Promise<{amount: number, transactionCount: number}>} zero and zero when every
 *   counterparty is still live.
 */
export const getUnattributedAnnulmentTotal = async (
  dbClient,
  userId,
  targetAccountId,
) => {
  const unattributedQuery = `
${TARGET_ACCOUNT_TRANSACTIONS_CTE}
 SELECT
  COALESCE(SUM(tat.amount), 0) AS unattributed_amount,
  COUNT(*)::int AS transaction_count

 FROM TargetAccountTransactions tat

 WHERE tat.affected_account_id IS NULL
 `;

  const { rows } = await dbClient.query(unattributedQuery, [
    userId,
    targetAccountId,
  ]);

  const total = {
    amount: parseFloat(rows[0].unattributed_amount),
    transactionCount: rows[0].transaction_count,
  };

  if (total.transactionCount > 0) {
    console.log(
      pc.yellow(
        `Target ${targetAccountId}: ${total.transactionCount} rows totalling ${total.amount} have no live counterparty and are excluded from the impact report.`,
      ),
    );
  }

  return total;
};

/**
 * Total the annulment will move: report rows summed and rounded to cents (display only). Kept
 * beside the report so every consumer quotes one total; the unattributed amount is excluded
 * because execution never acts on it.
 *
 * @returns {number} zero for an empty report.
 */
export const foldNetAdjustmentTotal = (impactReport) =>
 Math.round(
  impactReport.reduce(
   (running, row) => running + row.affectedAccountNetAdjustmentAmount,
   0,
  ) * 100,
 ) / 100;

/*
 * Locks the target account, then computes what erasing it would need to reverse; under the lock no
 * concurrent transaction can add a row naming the target. Shared by all deletion types, but HARD
 * does not call it yet (whether a no-reversal type needs the lock and a preview is undecided).
 */
export const assessDeletionImpact = async (
  dbClient,
  userId,
  targetAccountId,
) => {
  await lockAndDeriveBalances(dbClient, userId, [targetAccountId]);
  return getAnnulmentImpactReport(dbClient, userId, targetAccountId);
};

/*
 * Every pocket that loses backing if targetAccountId is deleted, named and totalled so
 * the owner sees it before confirming. Read-only preview: the actual DELETE FROM
 * pocket_allocations runs later, inside the deletion transaction, in eraseAccountTail.js.
 */
export const getPocketAllocationImpact = async (
  dbClient,
  userId,
  targetAccountId,
) => {
  const pocketImpactQuery = `
    SELECT
      p.pocket_id,
      p.name AS pocket_name,
      SUM(pa.amount) AS amount_allocated,
      cur.currency_code
    FROM pocket_allocations pa
    JOIN pockets p ON p.pocket_id = pa.pocket_id
    JOIN currencies cur ON cur.currency_id = p.currency_id
    WHERE pa.source_account_id = $1
      AND pa.user_id = $2
    GROUP BY p.pocket_id, p.name, cur.currency_code
    HAVING SUM(pa.amount) != 0
  `;

  const { rows } = await dbClient.query(pocketImpactQuery, [
    targetAccountId,
    userId,
  ]);

  return rows.map((row) => ({
    pocketId: row.pocket_id,
    pocketName: row.pocket_name,
    amountAllocated: parseFloat(row.amount_allocated),
    currencyCode: row.currency_code,
  }));
};

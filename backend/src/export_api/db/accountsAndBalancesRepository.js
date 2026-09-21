// One row per account held during a reference month, with its ledger-derived balance
// (derivedAccountBalanceSql, never account_balance) at that month's close. "Held that month",
// not "open today": a past statement keeps an account closed since (accountReportingWindow.js).

import { derivedAccountBalanceSql } from '../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { accountReportingWindowSql } from '../../utils/fintrackUtils/accountDataRetrieval/accountReportingWindow.js';
import { toAmount } from '../../fintrack_api/services/budget_services/core/money.js';

const DERIVED_BALANCE = derivedAccountBalanceSql('ua');

const ACCOUNTS_AND_BALANCES_QUERY = `
  WITH bounds AS (
    SELECT (($2::date + INTERVAL '1 month') AT TIME ZONE $3) AS next_month_start
  )
  SELECT
    ua.account_id,
    ua.account_name,
    act.account_type_name,
    ct.currency_code,
    CAST(
      ${DERIVED_BALANCE}
      - COALESCE((
          SELECT SUM(t.amount)
          FROM transactions t
          WHERE t.account_id = ua.account_id
            AND t.transaction_actual_date >= (SELECT next_month_start FROM bounds)
        ), 0)
    AS FLOAT) AS balance
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  JOIN currencies ct ON ct.currency_id = ua.currency_id
  WHERE ua.user_id = $1
    AND act.account_type_name IN ('bank', 'cash', 'investment', 'debtor')
    -- Not a bare deleted_at IS NULL: CLOSE stamps it beside closed_at, so that test
    -- would drop every closed account from every month. The window excludes soft-deleted
    -- rows and keeps a closed account in the months up to its closure.
    AND ${accountReportingWindowSql('ua', '$2::date', '$3')}
  ORDER BY act.account_type_name ASC, ua.account_name ASC
`;

/**
 * Accounts held during `referenceMonth` with their balance at its close: opened after or closed
 * before is absent; closed during is present at its final balance. Excludes the boundary
 * (compensation) account, like every other statement figure.
 *
 * @param {string} referenceMonth - 'YYYY-MM-01'
 */
export async function getAccountsAndBalances(pool, userId, referenceMonth, timeZone) {
 const { rows } = await pool.query(ACCOUNTS_AND_BALANCES_QUERY, [
  userId,
  referenceMonth,
  timeZone,
 ]);

 return rows.map((row) => ({
  accountId: row.account_id,
  accountName: row.account_name,
  accountType: row.account_type_name,
  currency: row.currency_code,
  balance: toAmount(row.balance ?? 0),
 }));
}

// Transactions and period summary (initial and final balance) for one account's detail screen.
import pc from 'picocolors';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
  dayInZone,
  isCalendarDate,
  resolveZonedWindow,
  todayInZone,
} from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { extractNoteFromDescription } from '../../utils/fintrackUtils/transactionManagement/extractNoteFromDescription.js';
import {
  accountLedgerCte,
  withDerivedBalance,
} from '../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { LIVE_ACCOUNT } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';

// LIVE_ACCOUNT guards ACCOUNT_INFO_QUERY only: its 403 stops closed or deleted accounts before the
// statement queries run (those are reached through /account/closed).

// A month, as YYYY-MM or YYYY-MM-DD. The day is accepted and discarded.
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

// The two period labels for a month. The Date is built and read entirely in UTC
// and never meets an instant, so it cannot shift a day the way a local getter
// over a UTC-parsed date does.
const monthBounds = (month) => {
  const [year, index] = month.split('-').map(Number);
  return {
    periodStartDate: month,
    periodEndDate: new Date(Date.UTC(year, index, 0)).toISOString().split('T')[0],
  };
};

// Clamps a period to the account's life (before its opening, after today), so balances are not
// shown under a period running past them. Both sides are YYYY-MM-DD, so string comparison is valid.
const clampToAccountLife = (bounds, accountStartDay, today) => ({
  periodStartDate:
    bounds.periodStartDate < accountStartDay
      ? accountStartDay
      : bounds.periodStartDate,
  periodEndDate: bounds.periodEndDate > today ? today : bounds.periodEndDate,
});

export const getTransactionsForAccountById = async (req, res, next) => {
  const backendColor = 'greenBright';
  const errorColor = 'red';
  const controllerName = 'getTransactionsForAccountById';
  console.log(pc[backendColor](controllerName));

  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };

  const queryFn = async (text, values) => {
    try {
      const result = await pool.query(text, values);
      return result.rows;
    } catch (error) {
      console.error(
        'Database query error occurred',
        process.env.NODE_ENV === 'development' ? console.log(error.stack) : '',
      );
      throw error;
    }
  };

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { accountId } = req.params;
    if (!accountId) {
      const message = `Account ID is required.`;
      console.warn(pc[backendColor](message));
      return RESPONSE(res, 400, message);
    }
    const ACCOUNT_INFO_QUERY = {
      text: `
    SELECT 
      ua.account_starting_amount, ua.account_start_date, cr.currency_code, ua.currency_id 
    FROM user_accounts ua
    JOIN
     currencies cr ON ua.currency_id = cr.currency_id
    WHERE
     ua.account_id = $1 AND ua.user_id = $2
     ${LIVE_ACCOUNT}
     LIMIT 1`,
      values: [accountId, userId],
    };

    const accountInfoNeededResult = await queryFn(
      ACCOUNT_INFO_QUERY.text,
      ACCOUNT_INFO_QUERY.values,
    );

    if (accountInfoNeededResult.length === 0) {
      const message =
        'The specified account does not belong to the user or does not exist.';
      console.warn(pc[backendColor](message));

      return RESPONSE(res, 403, message);
    }
    // month resolves on the owner's calendar so rows agree with the budget figures above them
    // (budget screen only). start/end is the legacy path: a browser-clock window from Pocket,
    // Debtor and Account detail.
    const { start, end, month } = req.query;

    // Refused rather than silently preferring one: a request naming both windows
    // has not decided which it means.
    if (month && (start || end)) {
      return RESPONSE(
        res,
        400,
        'Send either month or start/end, not both.',
      );
    }

    let window;

    if (month) {
      if (!MONTH_PATTERN.test(month)) {
        return RESPONSE(res, 400, 'Invalid month format. Use YYYY-MM.');
      }
      window = {
        mode: 'month',
        month: `${month.slice(0, 7)}-01`,
        timeZone: await getUserTimeZone(pool, userId),
      };
    } else {
      // Refused rather than coerced: casting an ISO instant to a date resolves it
      // in the session's zone, not the owner's.
      if ((start && !isCalendarDate(start)) || (end && !isCalendarDate(end))) {
        return RESPONSE(res, 400, 'Invalid date format. Use YYYY-MM-DD.');
      }

      // Resolved in the owner's zone, like the month branch, not the server's.
      window = {
        mode: 'range',
        ...resolveZonedWindow({
          start,
          end,
          timeZone: await getUserTimeZone(pool, userId),
        }),
      };
    }

    // The period the screen states, resolved before the queries so a window the account cannot
    // report on is refused early. Both paths are clamped to the account's life.
    const accountStartDay = dayInZone(
      accountInfoNeededResult[0].account_start_date,
      window.timeZone,
    );

    let period;

    if (window.mode === 'month') {
      period = clampToAccountLife(
        monthBounds(window.month),
        accountStartDay,
        todayInZone(window.timeZone),
      );

      // Bounds crossed: the month lies wholly before the account opened or after
      // today, so no statement exists; a 200 with zeroes printed a January period
      // over balances dated in August.
      if (period.periodStartDate > period.periodEndDate) {
        return RESPONSE(
          res,
          422,
          `This account has no statement for ${window.month.slice(0, 7)}. It was opened on ${accountStartDay}.`,
        );
      }
    } else {
      // The clamp bounds what is reported, not what is queried: no row is dated
      // outside its account's life, so narrowing the WHERE would exclude nothing.
      period = clampToAccountLife(
        {
          periodStartDate: window.startDate,
          periodEndDate: window.endDate,
        },
        accountStartDay,
        todayInZone(window.timeZone),
      );

      // Same crossed-bounds case as the month branch.
      if (period.periodStartDate > period.periodEndDate) {
        return RESPONSE(
          res,
          422,
          `This account has no statement for ${window.startDate} to ${window.endDate}. It was opened on ${accountStartDay}.`,
        );
      }
    }
    // Legacy start/end query. Invariant: every account has at least its
    // account-opening transaction.
    const TRANSACTIONS_BY_ACCOUNT_QUERY = {
      text: `
      WITH ${accountLedgerCte('$1')}
      SELECT
        tr.*, mt.movement_type_name, cr.currency_code, ua.account_name, CAST(ua.account_starting_amount AS FLOAT), ua.account_start_date,
        -- Derived from the ledger; JavaScript renames it onto the key of the stored balance
        -- column that tr.* ships, so the stale figure never reaches the response.
        al.balance AS derived_balance_after_tr,
        -- The day the owner lived, not the day UTC saw. COALESCE mirrors the
        -- WHERE below, which also admits a row by created_at alone.
        (COALESCE(tr.transaction_actual_date, tr.created_at)
          AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date::text AS transaction_local_date,
        -- The hour on the same calendar as transaction_local_date, so a list showing a
        -- time never reads the raw instant on the reader's clock and disagrees with its date.
        to_char(
          COALESCE(tr.transaction_actual_date, tr.created_at)
            AT TIME ZONE COALESCE(u.timezone, 'UTC'),
          'HH24:MI'
        ) AS transaction_local_time
      FROM
        transactions tr
      JOIN
        account_ledger al ON al.transaction_id = tr.transaction_id
      JOIN
        movement_types mt ON tr.movement_type_id = mt.movement_type_id
      JOIN
        currencies cr  ON tr.currency_id = cr.currency_id
      JOIN
        user_accounts ua ON tr.account_id = ua.account_id
      JOIN
        transaction_types trt ON tr.transaction_type_id= trt.transaction_type_id
      -- Joined rather than read with getUserTimeZone: the zone is one column of a row
      -- this statement already reaches.
      LEFT JOIN
        users u ON u.user_id = ua.user_id
      WHERE
        tr.account_id = $1 AND ua.user_id = $2
        AND (
          (tr.transaction_actual_date >= ($3::timestamp AT TIME ZONE $5)
            AND tr.transaction_actual_date <
              (($4::date + INTERVAL '1 day') AT TIME ZONE $5))
          OR
          (tr.created_at >= ($3::timestamp AT TIME ZONE $5)
            AND tr.created_at < (($4::date + INTERVAL '1 day') AT TIME ZONE $5))
        )

      ORDER BY
       tr.transaction_actual_date DESC , tr.created_at DESC
       `,
      values: [accountId, userId, window.startDate, window.endDate, window.timeZone],
    };

    // One month on the owner's calendar. No `OR tr.created_at` (the budget ignores it); ::timestamp on
    // the lower bound is load-bearing (a bare date picks the TIMESTAMPTZ overload). The running
    // total sums movement types 1 and 6, the budget's set, on category_budget only.
    const TRANSACTIONS_BY_MONTH_QUERY = {
      text: `
      WITH ${accountLedgerCte('$1')}
      SELECT
        tr.*, mt.movement_type_name, cr.currency_code, ua.account_name, CAST(ua.account_starting_amount AS FLOAT), ua.account_start_date,
        -- Derived over the account's whole life, not over this month: a window
        -- function sees only the rows its own query returns, so anchoring the
        -- series here would restart the balance at each month.
        al.balance AS derived_balance_after_tr,
        (tr.transaction_actual_date AT TIME ZONE $4)::date::text AS transaction_local_date,
        -- The hour on the same calendar as transaction_local_date; the transaction detail
        -- serves the same pair.
        to_char(
          tr.transaction_actual_date AT TIME ZONE $4,
          'HH24:MI'
        ) AS transaction_local_time,
        CASE WHEN act.account_type_name = 'category_budget' THEN
          CAST(SUM(CASE WHEN tr.movement_type_id IN (1, 6) THEN tr.amount ELSE 0 END)
            OVER (ORDER BY tr.transaction_actual_date ASC, tr.transaction_id ASC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS FLOAT)
        END AS month_cumulative_spent
      FROM
        transactions tr
      JOIN
        account_ledger al ON al.transaction_id = tr.transaction_id
      JOIN
        movement_types mt ON tr.movement_type_id = mt.movement_type_id
      JOIN
        currencies cr  ON tr.currency_id = cr.currency_id
      JOIN
        user_accounts ua ON tr.account_id = ua.account_id
      JOIN
        transaction_types trt ON tr.transaction_type_id= trt.transaction_type_id
      -- LEFT so a row with no matching account type still lists, without the running total.
      LEFT JOIN
        account_types act ON act.account_type_id = ua.account_type_id
      WHERE
        tr.account_id = $1 AND ua.user_id = $2
        AND tr.transaction_actual_date >= ($3::timestamp AT TIME ZONE $4)
        AND tr.transaction_actual_date <  (($3::date + INTERVAL '1 month') AT TIME ZONE $4)
      ORDER BY
       tr.transaction_actual_date DESC , tr.created_at DESC
       `,
      values: [accountId, userId, window.month, window.timeZone],
    };

    const QUERY =
      window.mode === 'month'
        ? TRANSACTIONS_BY_MONTH_QUERY
        : TRANSACTIONS_BY_ACCOUNT_QUERY;

    // The derived figure takes over the stored column's key, so the wire contract
    // is unchanged.
    const transactions = withDerivedBalance(
      await queryFn(QUERY.text, QUERY.values),
    );

    const formatDate = (date) => date.toISOString().split('T')[0];

    // The last balance known before the boundary day (the month's first day or the
    // clamped range start), with its date: a period with no movements still has
    // the balance the last earlier transaction left.
    const getBalanceCarriedIntoPeriod = async (boundaryDay) => {
      // The no-movement case is a COALESCE in SQL, not a JavaScript branch: a UTC
      // slice of the account's opening timestamp dated the balance a day after
      // the period it opens.
      const PRIOR_BALANCE_QUERY = {
        text: `
      WITH ${accountLedgerCte('$1')},
      prior AS (
        SELECT
          al.balance,
          (tr.transaction_actual_date AT TIME ZONE $3)::date::text AS local_date
        FROM
          transactions tr
        JOIN
          account_ledger al ON al.transaction_id = tr.transaction_id
        WHERE
          tr.account_id = $1
          AND tr.transaction_actual_date < ($2::timestamp AT TIME ZONE $3)
        ORDER BY
          tr.transaction_actual_date DESC, tr.transaction_id DESC
        LIMIT 1
      )
      SELECT
        COALESCE(
          (SELECT balance FROM prior),
          CAST(ua.account_starting_amount AS FLOAT)
        ) AS balance,
        COALESCE(
          (SELECT local_date FROM prior),
          (ua.account_start_date AT TIME ZONE $3)::date::text
        ) AS local_date
      FROM
        user_accounts ua
      WHERE
        ua.account_id = $1`,
        values: [accountId, boundaryDay, window.timeZone],
      };

      const [prior] = await queryFn(
        PRIOR_BALANCE_QUERY.text,
        PRIOR_BALANCE_QUERY.values,
      );

      return {
        amount: prior.balance,
        currency: accountInfoNeededResult[0].currency_code,
        date: prior.local_date,
      };
    };

    if (transactions.length === 0) {
      // Initial and final are the same figure and date: nothing moved, and
      // re-dating the closing one to the period's edge would put a balance on a
      // day no movement touched.
      const carried = await getBalanceCarriedIntoPeriod(period.periodStartDate);

      const data = {
        totalTransactions: 0,
        summary: {
          initialBalance: carried,
          finalBalance: carried,
          ...period,
        },
        transactions: [],
      };
      return RESPONSE(
        res,
        200,
        'No transactions found for the selected period',
        data,
      );
    }

    // "Initial" is the balance carried into the period, read before the boundary, so initial plus
    // the listed movements adds up to final. Both ends take the account's currency, not the row's
    // (a movement carries the currency it was typed in).
    const getInitialBalance = () =>
      getBalanceCarriedIntoPeriod(period.periodStartDate);

    const getFinalBalance = () => ({
      amount: parseFloat(transactions[0].account_balance_after_tr),
      currency: accountInfoNeededResult[0].currency_code,
      date:
        transactions[0].transaction_local_date ??
        formatDate(
          new Date(
            transactions[0].transaction_actual_date ||
              transactions[0].created_at,
          ),
        ),
    });

    const data = {
      totalTransactions: transactions.length,
      summary: {
        initialBalance: await getInitialBalance(),
        finalBalance: getFinalBalance(),
        ...period,
      },
      // note is split out of the description by the side that composes it;
      // description travels unchanged for the detail modal.
      transactions: transactions.map((transaction) => ({
        ...transaction,
        note: extractNoteFromDescription(transaction.description),
      })),
    };

    return RESPONSE(
      res,
      200,
      `${transactions.length} transaction(s) found`,
      data,
    );
  } catch (error) {
    const generalmessage = `Error while getting transactions for account id ${req.params.accountId}`;
    console.error(pc.red(generalmessage), error);

    if (error instanceof Error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(error.stack);
      }
    } else {
      console.error(
        pc.red('Error during getting transactions by account ID'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

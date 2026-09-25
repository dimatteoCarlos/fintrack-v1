// Dashboard totals, account summaries and movement-transaction reads.
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { extractNoteFromDescription } from '../../utils/fintrackUtils/transactionManagement/extractNoteFromDescription.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { resolveZonedWindow } from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { derivedAccountBalanceSql } from '../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import {
 LIVE_ACCOUNT,
 NOT_BOUNDARY_ACCOUNT,
} from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import {
 accountReadSource,
 ACCOUNT_EXTENSION_JOIN,
} from '../../utils/fintrackUtils/accountDataRetrieval/closedAccountReads.js';

// Totals are derived from the ledger like the lists beneath them; summing the
// stored column would put a headline above a list that contradicts it.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua');

// Join target for movement queries: user_accounts, or with INCLUDE_CLOSED_ACCOUNTS a subquery over
// account_registry so closed accounts' movements stay visible. Built with '$1' (userId is first bind).
const ACCOUNT_READ_SOURCE = accountReadSource('$1');

const RESPONSE = (res, status, message, data = null) => {
  const backendColor =
    status >= 400 ? 'red' : status >= 300 ? 'yellow' : 'green';
  console.log(pc[backendColor](`[${status}] ${message}`));
  res.status(status).json({ status, message, data });
};

const ERR_RESP = (status, message, controllerName = null) => {
  const backendColor =
    status >= 400 ? 'red' : status >= 300 ? 'yellow' : 'green';
  console.log(pc[backendColor](`[${status}] ${message}. ${controllerName}`));
  const error = new Error(message);
  error.status = 400;
  throw error;
};
// GET /api/fintrack/dashboard/balance: total balance per account type, for all types.
export const dashboardTotalBalanceAccounts = async (req, res, next) => {
  let backendColor = 'green';
  const errorColor = 'red';
  const controllerName = 'dashboardTotalBalanceAccounts';
  console.log(pc[backendColor](controllerName));

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const successMsg = `Total balance accounts were successfully calculated`;

    const TOTAL_BALANCE_QUERY = {
      text: `SELECT act.account_type_name, CAST(SUM(${DERIVED_BALANCE}) AS FLOAT) as total_balance, ct.currency_code FROM user_accounts ua
      JOIN account_types act ON ua.account_type_id = act.account_type_id
      JOIN currencies ct ON ua.currency_id = ct.currency_id
      WHERE user_id = $1 AND ua.account_name!=$2
      ${LIVE_ACCOUNT}
      GROUP BY act.account_type_name, ct.currency_code
      ORDER BY account_type_name ASC
  `,
      values: [userId, 'slack'],
    };

    const accountTotalBalanceResult = await pool.query(TOTAL_BALANCE_QUERY);

    if (accountTotalBalanceResult.rows.length === 0) {
      const message = `No available accounts for this user`;
      console.warn(pc[errorColor](message));
      // Without the return, the 200 below raised ERR_HTTP_HEADERS_SENT.
      return RESPONSE(res, 404, message);
    }

    const accountTotalBalance = accountTotalBalanceResult.rows;
    const data = {
      rows: accountTotalBalanceResult.rows.length,
      accountTotalBalance,
    };
    return RESPONSE(res, 200, successMsg, data);
  } catch (error) {
    console.error(pc.red('Error while getting account balance'), error);

    if (error instanceof Error) {
      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
      RESPONSE(res, 500, 'Error desconocido al procesar la solicitud');
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};
// GET /api/fintrack/dashboard/balance/type (used by TrackerLayout and OverviewLayout).
export const dashboardTotalBalanceAccountByType = async (req, res, next) => {
  const backendColor = 'cyan';
  const errorColor = 'red';
  const controllerName = 'dashboardTotalBalanceAccountByType';
  console.log(pc[backendColor](controllerName));

  try {
    const { type } = req.query;
    const userId = requireUserId(req, res);
    if (!userId) return;
    const accountType = type;

    if (!accountType) {
      const message = 'Account TYPE is required';
      console.log('MESSAGE', message);
      return RESPONSE(res, 400, message);
    }

    if (
      ![
        'bank',
        'investment',
        'income_source',
        'category_budget',
        'debtor',
        'pocket_saving',
      ].includes(accountType)
    ) {
      const message = `${accountType} is not a valid type account. Try again`;
      console.log('MESSAGE', message);
      ERR_RESP(400, message, controllerName);
    }

    const successMsg = `Total balance account of account type ${accountType} successfully calculated`;
    // TOTAL_BALANCE_QUERY is used for bank, investment and income_source type account
    const TOTAL_BALANCE_QUERY = {
      text: `
   SELECT 
    CAST(SUM(${DERIVED_BALANCE}) AS FLOAT ) AS total_balance,
    CAST(COUNT(*) AS INTEGER) AS accounts, ct.currency_code
      FROM user_accounts ua
      JOIN account_types act
       ON ua.account_type_id = act.account_type_id
      JOIN currencies ct
       ON ua.currency_id = ct.currency_id
      WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
      ${LIVE_ACCOUNT}
      GROUP BY ct.currency_code
`,
      values: [userId, accountType, 'slack'],
    };
    const TOTAL_BALANCE_AND_GOAL_BY_TYPE = {
      category_budget: {
        text: `
      SELECT
       CAST(SUM(${DERIVED_BALANCE}) AS FLOAT ) AS total_balance,  CAST(SUM(st.budget) AS FLOAT ) AS total_budget,
      (CAST(SUM(st.budget) AS FLOAT ) - CAST(SUM(${DERIVED_BALANCE}) AS FLOAT)) AS total_remaining,CAST(COUNT(*) AS INTEGER) AS accounts,
      ct.currency_code FROM user_accounts ua
        JOIN account_types act ON ua.account_type_id = act.account_type_id
        JOIN currencies ct ON ua.currency_id = ct.currency_id
        JOIN category_budget_accounts st ON ua.account_id = st.account_id
      WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
      ${LIVE_ACCOUNT}
      GROUP BY ct.currency_code
`,
        values: [userId, accountType, 'slack'],
      },
      pocket_saving: {
        text: `SELECT 
  CAST(SUM(${DERIVED_BALANCE}) AS FLOAT ) AS total_balance,
  CAST(SUM(st.target) AS FLOAT ) AS total_target,
  (CAST(SUM(st.target) AS FLOAT ) - CAST(SUM(${DERIVED_BALANCE}) AS FLOAT)) AS total_remaining, 
  CAST(COUNT(*) AS INTEGER) AS accounts, ct.currency_code
  FROM user_accounts ua
   JOIN account_types act ON ua.account_type_id = act.account_type_id
   JOIN pocket_saving_accounts st ON ua.account_id = st.account_id
   JOIN currencies ct ON ua.currency_id = ct.currency_id
   WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
   ${LIVE_ACCOUNT}
   GROUP BY  ct.currency_code
    `,
        values: [userId, accountType, 'slack'],
      },

      debtor: {
        // ORDER BY because the caller reads rows[0] of a grouped result. A second currency would be
        // dropped, not converted, but every debtor account is inserted in the accounting currency.
        text: `
      SELECT CAST(SUM(${DERIVED_BALANCE}) AS FLOAT ) AS total_debt_balance, CAST(SUM(CASE WHEN ${DERIVED_BALANCE} > 0 THEN ${DERIVED_BALANCE} ELSE 0 END) AS FLOAT ) AS debt_receivable,  CAST(SUM(CASE WHEN ${DERIVED_BALANCE} < 0 THEN ${DERIVED_BALANCE} ELSE 0 END) AS FLOAT ) AS debt_payable, 

        CAST(COUNT(CASE WHEN ${DERIVED_BALANCE}>0 THEN 1 ELSE NULL END) AS FLOAT) AS debtors, 
        CAST(COUNT(*) FILTER (WHERE ${DERIVED_BALANCE}<0) AS FLOAT) AS lenders, 
        CAST(COUNT(*) FILTER (WHERE ${DERIVED_BALANCE}=0) AS FLOAT) AS debtors_without_Debt, ct.currency_code

      FROM user_accounts ua
        JOIN account_types act ON ua.account_type_id = act.account_type_id
        JOIN debtor_accounts st ON ua.account_id = st.account_id
        JOIN currencies ct ON ua.currency_id = ct.currency_id

        WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
        ${LIVE_ACCOUNT}
        GROUP BY  ct.currency_code
        ORDER BY ct.currency_code
`,
        values: [userId, accountType, 'slack'],
      },
    };
    if (
      accountType == 'bank' ||
      accountType == 'investment' ||
      accountType === 'income_source'
    ) {
      const query = TOTAL_BALANCE_QUERY;
      const accountTotalBalanceResult = await pool.query(query);
      if (accountTotalBalanceResult.rows.length === 0) {
        const message = `No accounts of type "${accountType}"`;
        return RESPONSE(res, 400, message);
      }

      const data = accountTotalBalanceResult.rows[0];
      return RESPONSE(res, 200, successMsg, data);
    }
    if (
      accountType == 'category_budget' ||
      accountType == 'debtor' ||
      accountType == 'pocket_saving'
    ) {
      const query = TOTAL_BALANCE_AND_GOAL_BY_TYPE[accountType];

      const accountTotalBalanceResult = await pool.query(query);

      if (accountTotalBalanceResult.rows.length === 0) {
        const message = `No available accounts of type ${accountType}`;
        return RESPONSE(res, 400, message);
      }

      const data = accountTotalBalanceResult.rows[0];
      return RESPONSE(res, 200, successMsg, data);
    }
    const message = `No accounts of type ${accountType} were found`;
    return RESPONSE(res, 400, message);
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting account by type'));
      if (process.env.NODE_ENV == 'development') {
       console.log('stack:', error.stack);
      }
      // Returned so next() is not called twice for one error.
      return next(createError(error.status, error.message));
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};
// GET /api/fintrack/dashboard/balance/summary?type=
// Summary list for category_budget, debtor and pocket_saving, including budget or target.
export const dashboardAccountSummaryList = async (req, res, next) => {
  const backendColor = 'yellow';
  const errorColor = 'red';
  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };
  const controllerName = 'dashboardAccountSummaryList';
  console.log(pc[backendColor](controllerName));

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const accountType = req.body.type ?? req.query.type;

    if (!accountType) {
      return RESPONSE(res, 400, 'Account TYPE is required');
    }

    if (!['category_budget', 'debtor', 'pocket_saving'].includes(accountType)) {
      const message = `Invalid account type for summary list "${accountType}" check endpoint queries.`;
      console.warn(pc.red(message));
      return RESPONSE(res, 400, message);
    }

    const successMsg = `Summary list of accounts type ${accountType} was successfully calculated`;

    const SUMMARY_BALANCE_AND_GOAL_BY_TYPE = {
      category_budget: {
        text: `
        SELECT cba.category_name,  ct.currency_code, 
          SUM(${DERIVED_BALANCE})::FLOAT AS total_balance, 
          (COALESCE(SUM(cba.budget), 0) - SUM(${DERIVED_BALANCE}))::FLOAT AS total_remaining
          
          FROM user_accounts ua
          
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          LEFT JOIN category_budget_accounts cba ON ua.account_id = cba.account_id
          
          WHERE ua.user_id = $1
          AND act.account_type_name =$2
          AND ua.account_name !=$3
          ${LIVE_ACCOUNT}
          
          GROUP BY ct.currency_code, cba.category_name
          ORDER BY cba.category_name ASC, ct.currency_code DESC;
`,
        values: [userId, accountType, 'slack'],
      },

      // pocket_saving and debtor list each account's own balance, one row per account.

      pocket_saving: {
        text: `SELECT ua.account_name, ua.account_id,ua.account_start_date, CAST((${DERIVED_BALANCE}) AS FLOAT ) AS balance, CAST((st.target) AS FLOAT ) AS target,  ct.currency_code, st.note, st.desired_date
          FROM user_accounts ua
            JOIN account_types act ON ua.account_type_id = act.account_type_id
            JOIN pocket_saving_accounts st ON ua.account_id = st.account_id
            JOIN currencies ct ON ua.currency_id = ct.currency_id
          WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
          ${LIVE_ACCOUNT}
          ORDER BY balance DESC, ua.account_name ASC
`,
        values: [userId, accountType, 'slack'],
      },

      debtor: {
        text: `SELECT ua.account_name, ua.account_id, CAST((${DERIVED_BALANCE}) AS FLOAT ) AS total_debt_balance, CAST((CASE WHEN ${DERIVED_BALANCE} > 0 THEN ${DERIVED_BALANCE} ELSE 0 END) AS FLOAT ) AS debt_receivable,  CAST((CASE WHEN ${DERIVED_BALANCE} < 0 THEN ${DERIVED_BALANCE} ELSE 0 END) AS FLOAT ) AS debt_payable,

        CAST(COUNT(CASE WHEN ${DERIVED_BALANCE}>0 THEN 1 ELSE NULL END) AS FLOAT) AS debtor, 
        CAST(COUNT(*) FILTER (WHERE ${DERIVED_BALANCE}<0) AS FLOAT) AS creditor, 
        ct.currency_code
        
        FROM user_accounts ua
        JOIN account_types act ON ua.account_type_id = act.account_type_id
        JOIN debtor_accounts st ON ua.account_id = st.account_id
        JOIN currencies ct ON ua.currency_id = ct.currency_id

        WHERE user_id = $1 AND act.account_type_name = $2 AND ua.account_name!=$3
        ${LIVE_ACCOUNT}
        GROUP BY ua.account_name, ct.currency_code, ua.account_id
        ORDER BY total_debt_balance DESC, ua.account_name ASC
`,
        values: [userId, accountType, 'slack'],
      },
    };
    if (
      accountType == 'category_budget' ||
      accountType == 'debtor' ||
      accountType == 'pocket_saving'
    ) {
      const query = SUMMARY_BALANCE_AND_GOAL_BY_TYPE[accountType];

      if (!query) {
        const message = `Invalid account type "${accountType}" check endpoint queries.`;
        console.warn(pc.red(message));
        return RESPONSE(res, 400, message);
      }

      const accountSummaryResult = await pool.query(query);

      if (accountSummaryResult.rows.length === 0) {
        const message = `No accounts available of type ${accountType}.`;
        return RESPONSE(res, 400, message);
      }

      const data = accountSummaryResult.rows;

      return RESPONSE(res, 200, successMsg, data);
    }
    const message = `No available accounts of type ${accountType} for summary list`;
    return RESPONSE(res, 400, message);
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting account balances'));
      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};
// GET /api/fintrack/dashboard/movements/movement?movement=<movement type>
// The user's movement transactions for one movement type, each with its pre-fixed
// account type (accountTypeMap). Examples: ?movement=investment, ?movement=pocket
export const dashboardMovementTransactions = async (req, res, next) => {
  const backendColor = 'yellow';
  const errorColor = 'red';
  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };
  console.log(pc[backendColor]('dashboardMovementTransactions'));
  const accountTypeMap = {
    expense: 'category_budget',
    income: 'income_source',
    investment: 'investment',
    debt: 'debtor',
    pocket: 'pocket_saving',
    transfer: '',
    receive: '',
    'account-opening': '',
  };

  const queryFn = async (text, values) => {
    try {
      const result = await pool.query(text, values);
      return result.rows;
    } catch (error) {
      console.error(
        'Database query error occurred',
        process.env.NODE_ENV === 'development'
          ? console.log(error.stack, error)
          : '',
      );
    }
  };
  const { movement } = req.query;
  const movement_type_name = movement === 'debts' ? 'debt' : movement;
  const userId = requireUserId(req, res);
  if (!userId) return;
  console.log('movement', movement, movement_type_name);
  // The window is resolved in the owner's zone and leaves as two calendar dates; every
  // predicate below turns them into instants with one AT TIME ZONE, so no bound uses the
  // server's clock.
  const { start, end } = req.query;

  const { startDate, endDate, timeZone } = resolveZonedWindow({
    start,
    end,
    timeZone: await getUserTimeZone(pool, userId),
  });

  if (!movement_type_name) {
    const message = 'Missing required parameter: movement type name';
    return RESPONSE(res, 400, message);
  }

  if (
    ![
      'expense',
      'income',
      'investment',
      'debt',
      'pocket',
      'account-opening',
      'transfer',
      'receive',
      'pnl',
    ].includes(movement_type_name)
  ) {
    const message = `movement name " ${movement_type_name} " is not included`;
    console.warn(pc.magentaBright(message));
    return RESPONSE(res, 400, message);
  }
  let queryModel;

  switch (movement_type_name) {
    case 'expense':
      queryModel = {
        text: `
        SELECT
          ua.account_id,
          ua.account_name,
          ${DERIVED_BALANCE} AS account_balance,

          act.account_type_id,
          act.account_type_name,
         
          ua.account_starting_amount, ua.account_start_date, 

          tr.transaction_id, tr.description,
          tr.amount, tr.transaction_actual_date

        FROM transactions tr 
            JOIN ${ACCOUNT_READ_SOURCE} ua ON
              (
                (tr.amount > 0 AND ua.account_id = tr.destination_account_id) OR
                (tr.amount < 0 AND ua.account_id = tr.source_account_id)
              )
              
            JOIN account_types act ON ua.account_type_id = act.account_type_id

            WHERE ua.user_id = $1
              AND (act.account_type_name = $2)
              AND ua.account_name != $3
              ${NOT_BOUNDARY_ACCOUNT}
              AND tr.amount !=0

            AND (
              tr.transaction_actual_date >= ($4::timestamp AT TIME ZONE $6)
              AND tr.transaction_actual_date <
                (($5::date + INTERVAL '1 day') AT TIME ZONE $6)
              )

            ORDER BY tr.transaction_actual_date DESC
          `,
        values: [
          userId,
          accountTypeMap.expense,
          'slack',
          // Calendar dates, not instants. The ::timestamp cast on the lower bound is
          // load-bearing: a bare date makes AT TIME ZONE pick the TIMESTAMPTZ overload and
          // convert the wrong way. The upper bound needs none: date + interval is a TIMESTAMP.
          startDate,
          endDate,
          timeZone,
        ],
      };
      break;

    case 'income':
      queryModel = {
        text: `
        SELECT
          ua.account_id,
          ua.account_name,
          ${DERIVED_BALANCE} AS account_balance,

          act.account_type_id,
          act.account_type_name,
         
          ua.account_starting_amount,
          ua.account_start_date, 

          tr.transaction_id,
          tr.description,
          tr.amount,
          tr.movement_type_id,
          tr.transaction_actual_date

        FROM transactions tr 
          JOIN ${ACCOUNT_READ_SOURCE} ua ON
            tr.account_id = ua.account_id
                            
          JOIN account_types act
           ON ua.account_type_id = act.account_type_id

          WHERE tr.user_id = $1
           AND (act.account_type_name = $2)
           AND ua.account_name != $3
           ${NOT_BOUNDARY_ACCOUNT}
           AND tr.amount !=0

            AND (
              tr.transaction_actual_date >= ($4::timestamp AT TIME ZONE $6)
              AND tr.transaction_actual_date <
                (($5::date + INTERVAL '1 day') AT TIME ZONE $6)
              )

            ORDER BY tr.transaction_actual_date DESC
          `,
        values: [
          userId,
          accountTypeMap.income,
          'slack',
          // Calendar dates, not instants. The ::timestamp cast on the lower bound is
          // load-bearing: a bare date makes AT TIME ZONE pick the TIMESTAMPTZ overload and
          // convert the wrong way. The upper bound needs none: date + interval is a TIMESTAMP.
          startDate,
          endDate,
          timeZone,
        ],
      };
      break;

    case 'investment':
      queryModel = {
        text: `
        SELECT 
          ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance,
          ct.currency_code,
          act.account_type_id, act.account_type_name,
          ua.account_starting_amount, ua.account_start_date, 
          tr.description, tr.transaction_actual_date, tr.amount,
          tr.transaction_id

          FROM transactions tr 
            JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
            JOIN account_types act ON ua.account_type_id = act.account_type_id
            JOIN currencies ct ON ua.currency_id = ct.currency_id

          WHERE ua.user_id = $1
            AND (act.account_type_name = $2) AND ua.account_name != $3
            ${NOT_BOUNDARY_ACCOUNT}

          ORDER BY tr.transaction_actual_date DESC, ${DERIVED_BALANCE} DESC, ua.account_name ASC
          `,
        values: [userId, accountTypeMap.investment, 'slack'],
      };
      break;

    case 'pocket':
      queryModel = {
        text: `SELECT  mt.movement_type_name, ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance,
        ct.currency_code, act.account_type_id, act.account_type_name,
        psa.target,psa.desired_date,           
        ua.account_starting_amount, ua.account_start_date, 
        tr.description, tr.transaction_actual_date, tr.amount, tr.transaction_id

         FROM transactions tr 
          JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
          ${ACCOUNT_EXTENSION_JOIN} pocket_saving_accounts psa ON ua.account_id = psa.account_id
            WHERE ua.user_id = $1
              AND (act.account_type_name = $2) AND ua.account_name != $3
              ${NOT_BOUNDARY_ACCOUNT}
               AND( mt.movement_type_name = $4  OR mt.movement_type_name=$7)
                  AND (
                    (tr.transaction_actual_date >= ($5::timestamp AT TIME ZONE $8)
                      AND tr.transaction_actual_date <
                        (($6::date + INTERVAL '1 day') AT TIME ZONE $8))
                    OR
                    (tr.created_at >= ($5::timestamp AT TIME ZONE $8)
                      AND tr.created_at <
                        (($6::date + INTERVAL '1 day') AT TIME ZONE $8))
                  )
            ORDER BY tr.transaction_actual_date DESC, ${DERIVED_BALANCE} DESC, ua.account_name ASC
          `,
        values: [
          userId,
          accountTypeMap.pocket,
          'slack',
          'pocket',
          startDate,
          endDate,
          'account-opening',
          timeZone,
        ],
      };
      break;

    case 'debt':
      queryModel = {
        text: `SELECT  mt.movement_type_name,
        ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance,
        ct.currency_code, act.account_type_id, act.account_type_name,

        dbt.debtor_name,dbt.debtor_lastname, dbt.value,         
        ua.account_starting_amount, ua.account_start_date, 
          tp.transaction_type_name, tr.description, 
          tr.transaction_actual_date, tr.amount, tr.transaction_id

        FROM transactions tr 
          JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
          JOIN transaction_types tp ON tp.transaction_type_id = tr.transaction_type_id
            ${ACCOUNT_EXTENSION_JOIN} debtor_accounts dbt ON ua.account_id = dbt.account_id
            WHERE ua.user_id = $1
          AND (act.account_type_name = $2) AND ua.account_name != $3
          ${NOT_BOUNDARY_ACCOUNT}
          AND (mt.movement_type_name = $4  OR (tp.transaction_type_name = $5 OR tp.transaction_type_name = $6))

          ORDER BY tr.transaction_actual_date DESC, 
          tr.created_at DESC
          `,
        values: [
          userId,
          accountTypeMap.debt,
          'slack',
          movement_type_name,
          'lend',
          'borrow',
        ],
      };
      break;

    case 'account-opening':
    case 'transfer':
    case 'receive':
    case 'pnl':
      queryModel = {
        text: `SELECT  mt.movement_type_name,ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance,
        ct.currency_code, act.account_type_id, act.account_type_name,
        ua.account_starting_amount, ua.account_start_date, 
        tp.transaction_type_name, tr.description, tr.transaction_actual_date, tr.amount, tr.transaction_id

          FROM transactions tr 
          JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
          JOIN transaction_types tp ON tp.transaction_type_id = tr.transaction_type_id
          WHERE ua.user_id = $1
            AND ua.account_name != $2
            ${NOT_BOUNDARY_ACCOUNT}
            AND (mt.movement_type_name = $3)

          ORDER BY tr.transaction_actual_date DESC,
          tr.created_at DESC,tr.updated_at DESC,
          ${DERIVED_BALANCE} DESC, ua.account_name ASC
          `,
        values: [userId, 'slack', movement_type_name],
      };
      break;

    case 'all':
      queryModel = {
        // The derived expression sits AFTER ua.*, which already ships an account_balance
        // column: with two outputs of one name the driver keeps the last, so the derived
        // value wins over the stored one.
        text: `SELECT mt.movement_type_name, ua.*, ${DERIVED_BALANCE} AS account_balance, tr.*
         FROM transactions tr
        JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
        WHERE ua.user_id = $1
         ORDER BY tr.transaction_actual_date DESC, tr.transaction_type_id ASC `,
        values: [userId],
      };

      break;
    default:
      return RESPONSE(
        res,
        400,
        `Invalid movement type name: ${movement_type_name}`,
      );
  }
  try {
    const movements = await queryFn(queryModel.text, queryModel.values);

    if (movements && movements?.length === 0) {
      const message = `No info encountered for movement: ${movement_type_name} and type: ${accountTypeMap[movement_type_name]}`;
      console.error('error', message);
      return RESPONSE(res, 400, message);
    }
    const message = `${movements.length} transaction(s) found. Period between ${startDate} and ${endDate}`;

    // One place for all branches above: each selects tr.description, so the note is split
    // out once; description travels untouched beside it.
    const movementsWithNote = movements.map((movement) => ({
      ...movement,
      note: extractNoteFromDescription(movement.description),
    }));

    return RESPONSE(res, 200, message, movementsWithNote);
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        pc.red(
          `Error while getting movement transactions ${movement_type_name}`,
        ),
      );
      if (process.env.NODE_ENV === 'development') {
        console.warn(error.stack);
      }
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};
// GET /api/fintrack/dashboard/movements/search?start=&end=&search=
// Tracker movements for a period (default: last 30 days) matching a search term.

export const dashboardMovementTransactionsSearch = async (req, res, next) => {
  const backendColor = 'green';
  const errorColor = 'red';
  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };
  console.log(pc[backendColor]('dashboardMovementTransactionsSearch'));
  try {
    const { start, end, search } = req.query;
    const userId = requireUserId(req, res);
    if (!userId) return;
    // Same zoned half-open window as the other movement endpoints; an unzoned bound would
    // end at the end day's 00:00 UTC and drop everything the owner did after that hour.
    const { startDate, endDate, timeZone } = resolveZonedWindow({
      start,
      end,
      timeZone: await getUserTimeZone(pool, userId),
    });

    const movementsResult = await pool.query({
      text: `
  SELECT mt.movement_type_name, ct.currency_code,ua.*, tr.*, trt.transaction_type_name,
    -- The alias is required: an un-aliased cast is output as float8, collides with
    -- nothing, and leaves ua.*'s stored account_balance as the value the client gets.
    CAST(tr.amount AS FLOAT), CAST(${DERIVED_BALANCE} AS FLOAT) AS account_balance, CAST(ua.account_starting_amount AS FLOAT)
  FROM transactions tr
          JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
          JOIN transaction_types trt ON tr.transaction_type_id = trt.transaction_type_id
  WHERE ua.user_id = $1 
  AND (
   (tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $6)
     AND tr.transaction_actual_date < (($3::date + INTERVAL '1 day') AT TIME ZONE $6))
   OR
   (tr.created_at >= ($2::timestamp AT TIME ZONE $6)
     AND tr.created_at < (($3::date + INTERVAL '1 day') AT TIME ZONE $6))
  )
  AND (ua.account_name != $5)
  ${NOT_BOUNDARY_ACCOUNT}
  AND (
   tr.description ILIKE '%'||$4||'%' 
  OR CAST(tr.status AS TEXT)  ILIKE '%'||$4||'%'
  OR CAST(mt.movement_type_name AS TEXT) ILIKE '%'||$4||'%'
  OR CAST(trt.transaction_type_name AS TEXT) ILIKE '%'||$4||'%'
  OR CAST(ct.currency_code AS TEXT) ILIKE '%'||$4||'%'
  OR CAST(tr.amount AS TEXT) ILIKE '%'||$4||'%'
  OR CAST(tr.source_account_id AS TEXT) ILIKE '%'||$4||'%'
  OR CAST(tr.destination_account_id  AS TEXT) ILIKE '%'||$4||'%'
    )
   ORDER BY tr.transaction_actual_date DESC, tr.created_at DESC
  `,
      values: [
        userId,
        startDate,
        endDate,
        search,
        search === 'slack' ? '' : 'slack',
        timeZone,
      ],
    });

    if (movementsResult.rows?.length === 0) {
      const message = `No info encountered for movements`;

      return RESPONSE(res, 404, message);
    }
    const message = `${movementsResult.rows.length} transaction(s) found`;

    return RESPONSE(res, 200, message, movementsResult.rows);
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        pc.red(
          `Error while getting movement transactions in the period between`,
        ),
      );
      if (process.env.NODE_ENV === 'development') {
        console.warn(error.stack);
      }
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};
// GET /api/fintrack/dashboard/movements/account_type?start=&end=&movement=&account_type=&transaction_type=
// Movements by movement, account and transaction type, e.g. ?movement=expense&account_type=category_budget.
// Transfer movements (pocket, investment) go through dashboardMovementTransactions instead.

export const dashboardMovementTransactionsByType = async (req, res, next) => {
  const backendColor = 'blue';
  const errorColor = 'red';
  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };
  console.log(pc[backendColor]('dashboardMovementTransactionsByType'));
  try {
    const { start, end, transaction_type, movement, account_type } = req.query;
    const userId = requireUserId(req, res);
    if (!userId) return;

    if (!(movement || transaction_type || account_type)) {
      const message =
        'movement, transaction_type or account_type is required';
      return RESPONSE(res, 400, message);
    }
    // Same zoned half-open window as the other movement endpoints; an unzoned bound would
    // end at the end day's 00:00 UTC and drop everything the owner did after that hour.
    const { startDate, endDate, timeZone } = resolveZonedWindow({
      start,
      end,
      timeZone: await getUserTimeZone(pool, userId),
    });

    const movementsResult = await pool.query({
      text: `
  SELECT mt.movement_type_name, ct.currency_code, ua.*, tr.*, trt.transaction_type_name,act.account_type_name,
  CAST ( ua.account_starting_amount AS FLOAT),  CAST (tr.amount AS FLOAT),
  -- Named, for the reason spelled out in dashboardMovementTransactionsSearch:
  -- an un-aliased cast is called float8 and leaves ua.* holding the name.
  CAST(${DERIVED_BALANCE} AS FLOAT) AS account_balance
    FROM transactions tr
      JOIN ${ACCOUNT_READ_SOURCE} ua ON tr.account_id = ua.account_id
      JOIN account_types act ON ua.account_type_id = act.account_type_id
      JOIN currencies ct ON ua.currency_id = ct.currency_id
      JOIN movement_types mt ON tr.movement_type_id = mt.movement_type_id
      JOIN transaction_types trt ON tr.transaction_type_id = trt.transaction_type_id
    WHERE ua.user_id = $1 

    AND (
      (tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $9)
        AND tr.transaction_actual_date < (($3::date + INTERVAL '1 day') AT TIME ZONE $9))
      OR
      (tr.created_at >= ($2::timestamp AT TIME ZONE $9)
        AND tr.created_at < (($3::date + INTERVAL '1 day') AT TIME ZONE $9))
    )
    -- A separate AND term, not trailing the OR: AND binds tighter, so trailing it
    -- would apply the slack exclusion to the created_at branch only.
    AND ua.account_name != $4
    ${NOT_BOUNDARY_ACCOUNT}

    AND (mt.movement_type_name = $6 OR mt.movement_type_name = $8 )
    AND (trt.transaction_type_name = $5 OR act.account_type_name = $7)

    ORDER BY tr.transaction_actual_date DESC, tr.created_at DESC
  `,
      values: [
        userId,
        startDate,
        endDate,
        'slack',
        transaction_type,
        movement,
        account_type,
        movement === 'debt' || movement === 'pocket'
          ? 'account-opening'
          : movement,
        timeZone,
      ],
    });

    if (movementsResult.rows?.length === 0) {
      const message = `No transactions encountered for "${movement}" and ${
        transaction_type || account_type
      }`;

      return RESPONSE(res, 404, message);
    }

    const message = `${movementsResult.rows.length} transaction(s) found. Period between ${startDate} and ${endDate}`;

    return RESPONSE(res, 200, message, movementsResult.rows);
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        pc.red(
          `Error while getting movement transactions in the period between ${req.query.start} and ${req.query.end}`,
        ),
      );
      if (process.env.NODE_ENV === 'development') {
        console.warn(error.stack);
      }
    } else {
      console.error(
        pc.red('Something went wrong'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

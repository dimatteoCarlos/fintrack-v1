// Monthly amounts per expense category, income source and saving pocket for one calendar year.
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';
import { validate as uuidValidate } from 'uuid';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { NOT_BOUNDARY_ACCOUNT } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
  isCalendarDate,
  todayInZone,
} from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';

/**
 * Yearly total per movement type, so the client never sums months (a cent apart otherwise).
 * Currencies are not converted (as in makeTotals): a type spanning several reports null.
 * Amounts arrive as FLOAT, so the sum is rounded to the DECIMAL(15,2) scale.
 */
const makeYearlyTotals = (rows) => {
  const byType = {};

  for (const row of rows) {
    const bucket = (byType[row.type] ??= { amount: 0, currencies: new Set() });
    bucket.amount += Number(row.amount) || 0;
    bucket.currencies.add(row.currency_code);
  }

  return Object.fromEntries(
    Object.entries(byType).map(([type, { amount, currencies }]) => [
      type,
      currencies.size === 1
        ? {
            amount: Math.round(amount * 100) / 100,
            currency: [...currencies][0],
          }
        : { amount: null, currency: null },
    ]),
  );
};

export const dashboardMonthlyTotalAmountByType = async (req, res, next) => {
  const backendColor = 'yellow';
  const errorColor = 'red';
  const RESPONSE = (res, status, message, data = null) => {
    console.log(pc[backendColor](message));
    res.status(status).json({ status, message, data });
  };
  console.log(pc[backendColor]('dashboardMonthlyTotalAmountByType'));
  const { startDate, endDate } = req.query;
  const userId = requireUserId(req, res);
  if (!userId) return;
  if (!uuidValidate(userId)) {
    const msg = 'Invalid user ID format';
    return RESPONSE(res, 400, msg);
  }

  // The owner's year, not the server clock's: around 31 December they differ.
  const timeZone = await getUserTimeZone(pool, userId);

  if (startDate && endDate && !(isCalendarDate(startDate) && isCalendarDate(endDate))) {
    // Refused rather than coerced: casting an ISO instant to a date resolves it
    // in the session's zone, not the owner's.
    return RESPONSE(res, 400, 'Invalid date format. Use YYYY-MM-DD');
  }

  const currentYear = todayInZone(timeZone).slice(0, 4);

  // Calendar dates, never instants; the query converts each bound with AT TIME ZONE.
  const dateRange =
    startDate && endDate
      ? { start: startDate, end: endDate }
      : { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` };
  async function getFinancialData(userId) {
    // A withdrawal from an income-source account is income deposited to a bank account; a deposit to a
    // category budget account is an expense; a deposit to a pocket saving account is a saving
    // contribution (pockets can also be withdrawn from, so this is contributions, not the balance saved).

    try {
      const queryText = `
     WITH financial_data AS (
      SELECT CAST(EXTRACT(MONTH FROM (tr.transaction_actual_date AT TIME ZONE $4)) AS INTEGER) AS month_index,
          TRIM(TO_CHAR((tr.transaction_actual_date AT TIME ZONE $4), 'month')) AS month_name,
          tr.movement_type_id,
          tr.transaction_type_id,
          COALESCE(cba.category_name, ua.account_name) AS name,
          CAST(SUM(tr.amount) AS FLOAT) AS amount,
          ct.currency_code, 

        CASE
            WHEN tr.movement_type_id = 1 AND tr.transaction_type_id = 2  THEN 'expense'
            WHEN tr.movement_type_id = 2 AND tr.transaction_type_id = 1  THEN 'income'
            WHEN tr.movement_type_id = 5 AND tr.transaction_type_id = 2  THEN 'saving'
            ELSE 'other'
          END AS type

        FROM transactions tr
          LEFT JOIN category_budget_accounts cba ON tr.account_id = cba.account_id
          LEFT JOIN pocket_saving_accounts psa ON tr.account_id = psa.account_id
          LEFT JOIN user_accounts ua ON tr.account_id = ua.account_id
          -- Inner, unlike the joins above: account_type_id is NOT NULL behind a RESTRICT
          -- foreign key, so a LEFT join would preserve nothing.
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON tr.currency_id = ct.currency_id
      
        WHERE ua.user_id = $1
            AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4)
            AND tr.transaction_actual_date <
              (($3::date + INTERVAL '1 day') AT TIME ZONE $4)
            AND (
              (tr.movement_type_id = 1 AND tr.transaction_type_id = 2)
              OR
              (tr.movement_type_id = 2 AND tr.transaction_type_id = 1)
              OR
              (tr.movement_type_id = 5 AND tr.transaction_type_id = 2)
            )
            -- Excludes the compensation account, which the movement-type pairs above keep
            -- out only because they omit the types that account writes: adding
            -- profit-and-loss or account-closure to them would admit it as the owner's own
            -- spending ('slack', negative amount) and understate the monthly total.
            --
            -- It covers one leg of a deletion pair, the counterpart on the boundary
            -- account. The annulment's affected leg and the closure's target leg sit on the
            -- owner's own account, so no account-type predicate removes them: annulment rows
            -- stay catchable by their description prefix, but closure rows carry none, so
            -- for those the movement-type pairs above are the whole defence.
            ${NOT_BOUNDARY_ACCOUNT}
              
        GROUP BY 
            EXTRACT(MONTH FROM (tr.transaction_actual_date AT TIME ZONE $4)),
            TO_CHAR((tr.transaction_actual_date AT TIME ZONE $4), 'month'),
            tr.movement_type_id,
            tr.transaction_type_id,
            cba.category_name,
            ua.account_id,
            ct.currency_code
        )
		
        SELECT * FROM financial_data
        ORDER BY month_index ASC, type, name, currency_code
`;
      const result = await pool.query(queryText, [
        userId,
        dateRange.start,
        dateRange.end,
        timeZone,
      ]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching financial data:', error);
      throw error;
    }
  }
  try {
    const dataArr = await getFinancialData(
      userId,
      dateRange.start,
      dateRange.end,
    );

    if (dataArr.length === 0) {
      const message = `No financial data available`;
      console.warn(pc[backendColor](message));
      return RESPONSE(res, 400, message);
    }

    const responseData = {
      // Calendar dates (YYYY-MM-DD), which the client's DateRange type (string | Date) accepts.
      dateRange: {
        start: dateRange.start,
        end: dateRange.end,
      },

      monthlyAmounts: dataArr,

      // Served so Overview does not sum the twelve months itself.
      yearlyTotals: makeYearlyTotals(dataArr),
    };
    return RESPONSE(
      res,
      200,
      'Financial data retrieved successfully',
      responseData,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        pc.red(
          `Error while getting monthly total amount by movement type`,
        ),
      );
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

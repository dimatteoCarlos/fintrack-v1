import pc from 'picocolors';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import { pool } from '../../db/config/configDB.js';
import { respondError, respondSuccess } from '../../utils/responseHelpers.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { dayInZone } from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { accountAllocationService } from '../services/pocket_services/services/accountAllocationService.js';
import { derivedAccountBalanceSql } from '../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import {
  LIVE_ACCOUNT,
  NOT_BOUNDARY_ACCOUNT,
} from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import { getClosedAccountRegistry } from '../services/delete_account/getClosedAccountRegistry.js';

const backendColor = 'greenBright';
const errorColor = 'red';

// Every list below serves this in place of the stored user_accounts.account_balance.
// One expression, so a list and the detail of the same account cannot disagree.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua');

// LIVE_ACCOUNT drops soft-deleted and closed accounts from every list here. Not applied to reads by
// account id: the deletion flow must display the account it just acted on, so those ship is_deleted/is_closed.

const RESPONSE = (res, status, message, data = null) => {
  const backendColor =
    status >= 400 ? 'red' : status >= 300 ? 'yellow' : 'green';
  console.log(pc[backendColor](`[${status}] ${message}`));

  res.status(status).json({ status, message, data });
};

// The owner's live accounts of one type, without the compensation account. type is one of
// bank, category_budget, income_source, investment, pocket_saving, debtor, bank_and_investment.
export const getAllAccountsByType = async (req, res, next) => {
  const controllerName = 'getAllAccountsByType';
  console.log(pc[backendColor](controllerName));

  try {
    const { type } = req.query;
    const accountType = type.trim();
    const userId = requireUserId(req, res);
    if (!userId) return;

    if (!accountType) {
      const message = `Account type is required.Try again!.`;
      console.warn(pc[backendColor](message));
      return respondError(res, 400, message);
    }

    if (
      ![
        'bank',
        'category_budget',
        'income_source',
        'investment',
        'pocket_saving',
        'debtor',
        'bank_and_investment',
      ].includes(accountType)
    ) {
      const message = `Account of type ${accountType} is not valid. Try again!.`;
      console.warn(pc[backendColor](message, controllerName));
      return respondError(res, 400, message);
    }
    const accountTypeQuery = {
      bank: {
        typeQuery: {
          text: `SELECT ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance, ct.currency_code, act.account_type_id, act.account_type_name,
          CAST(ua.account_starting_amount AS FLOAT),  ua.account_start_date
       FROM user_accounts ua
       JOIN account_types act ON ua.account_type_id = act.account_type_id
       JOIN currencies ct ON ua.currency_id = ct.currency_id
       WHERE ua.user_id = $1
       AND act.account_type_name = $2 AND ua.account_name != $3
       ${NOT_BOUNDARY_ACCOUNT}
       ${LIVE_ACCOUNT}
       ORDER BY ua.account_name ASC, account_balance DESC
       `,
          values: [userId, accountType, 'slack'],
        },
      },

      category_budget: {
        typeQuery: {
          text: `SELECT ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance,
   act.account_type_name,
   ct.currency_code, cba.budget, cba.subcategory, cnt.category_nature_type_name,
     ua.account_starting_amount,  ua.account_start_date
   FROM user_accounts ua
   JOIN account_types act ON ua.account_type_id = act.account_type_id
   JOIN currencies ct ON ua.currency_id = ct.currency_id
   JOIN category_budget_accounts cba ON ua.account_id = cba.account_id
   JOIN category_nature_types cnt ON cba.category_nature_type_id = cnt.category_nature_type_id
   WHERE ua.user_id =$1
   AND act.account_type_name = $2 AND ua.account_name != $3
   ${NOT_BOUNDARY_ACCOUNT}
   ${LIVE_ACCOUNT}
   ORDER BY ABS(${DERIVED_BALANCE}) DESC
       `,
          values: [userId, accountType, 'slack'],
        },
      },

      income_source: {
        typeQuery: {
          text: `SELECT ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance, act.account_type_name, ct.currency_code, 
         CAST(ua.account_starting_amount AS FLOAT), ua.account_start_date
FROM user_accounts ua
JOIN account_types act ON ua.account_type_id = act.account_type_id
JOIN currencies ct ON ua.currency_id = ct.currency_id
  WHERE ua.user_id =$1
  AND act.account_type_name = $2 AND ua.account_name != $3
  ${NOT_BOUNDARY_ACCOUNT}
  ${LIVE_ACCOUNT}
  ORDER BY ABS(${DERIVED_BALANCE}) DESC
`,
          values: [userId, accountType, 'slack'],
        },
      },

      investment: {
        typeQuery: {
          text: `SELECT ua.account_id, ua.account_name, ${DERIVED_BALANCE} AS account_balance, act.account_type_name, ct.currency_code, 
           CAST(ua.account_starting_amount AS FLOAT) ,  ua.account_start_date
FROM user_accounts ua
JOIN account_types act ON ua.account_type_id = act.account_type_id
JOIN currencies ct ON ua.currency_id = ct.currency_id
  WHERE ua.user_id =$1
  AND act.account_type_name = $2 AND ua.account_name != $3
  ${NOT_BOUNDARY_ACCOUNT}
  ${LIVE_ACCOUNT}
  ORDER BY ABS(${DERIVED_BALANCE}) DESC
      `,
          values: [userId, accountType, 'slack'],
        },
      },

      pocket_saving: {
        typeQuery: {
          text: `
   SELECT ua.account_id, ua.account_name,
    ${DERIVED_BALANCE} AS account_balance,
    act.account_type_name, ct.currency_code, ps.target, ps.desired_date,
    -- 'user' or 'default'. A defaulted deadline is not a deadline the user
    -- chose, and no pace figure derived from it may read as one.
    ps.desired_date_source,
    ps.account_start_date, 
    ua.account_starting_amount,
    ua.account_start_date
FROM user_accounts ua
JOIN account_types act ON ua.account_type_id = act.account_type_id
JOIN currencies ct ON ua.currency_id = ct.currency_id
JOIN pocket_saving_accounts ps ON ua.account_id = ps.account_id
WHERE ua.user_id =$1
AND act.account_type_name = $2 AND ua.account_name != $3
${NOT_BOUNDARY_ACCOUNT}
${LIVE_ACCOUNT}
ORDER BY ps.target DESC, ABS(${DERIVED_BALANCE}) DESC
`,
          values: [userId, accountType, 'slack'],
        },
      },

      debtor: {
        typeQuery: {
          text: `
   SELECT ua.account_id,ua.account_name,
    ${DERIVED_BALANCE} AS account_balance,
    act.account_type_name, ct.currency_code,
   dac.value as starting_value,
   dac.debtor_name, dac.debtor_lastname,
   dac.selected_account_id,
   dac.account_start_date, 
   ua.account_starting_amount,
      ua.account_start_date
   FROM user_accounts ua
   JOIN account_types act
    ON ua.account_type_id = act.account_type_id
   JOIN currencies ct
    ON ua.currency_id = ct.currency_id
   JOIN debtor_accounts dac
    ON ua.account_id = dac.account_id
   WHERE ua.user_id =$1
   AND act.account_type_name = $2 AND ua.account_name != $3
   ${NOT_BOUNDARY_ACCOUNT}
   ${LIVE_ACCOUNT}
   ORDER BY account_balance ASC
`,
          values: [userId, accountType, 'slack'],
        },
      },

      bank_and_investment: {
        typeQuery: {
          text: `SELECT ua.account_id, ua.account_name,
           ${DERIVED_BALANCE} AS account_balance,
            ct.currency_code, act.account_type_id, act.account_type_name,
          CAST(ua.account_starting_amount AS FLOAT),
            ua.account_start_date
          FROM user_accounts ua
          JOIN account_types act ON ua.account_type_id = act.account_type_id
          JOIN currencies ct ON ua.currency_id = ct.currency_id
          WHERE ua.user_id = $1
          AND( act.account_type_name = $2 OR act.account_type_name=$3) AND ua.account_name != $4
          ${NOT_BOUNDARY_ACCOUNT}
          ${LIVE_ACCOUNT}
        ORDER BY ua.account_type_id ASC, ua.account_name ASC, account_balance DESC
       `,
          values: [userId, 'bank', 'investment', 'slack'],
        },
      },
    };

    const accountListResult = await pool.query(
      accountTypeQuery[accountType].typeQuery,
    );

    if (accountListResult.rows.length === 0) {
      const message = `No accounts of type: "${accountType}" found`;
      console.warn(pc[backendColor](message));
      return respondError(res, 404, message);
    }

    const accountList = accountListResult.rows;

    // Pocket-funding picker figures (balance, committed, unassigned), from the service the commit path
    // validates against so rule and screen cannot drift; one query for the list. Bank only: they mean
    // nothing for investment or debtor, and a mixed type would carry them on some rows only.
    if (accountType === 'bank') {
      const allocationByAccountId =
        await accountAllocationService.getAllocationsByAccountId(
          pool,
          userId,
          accountList.map((account) => account.account_id),
        );

      for (const account of accountList) {
        const allocation = allocationByAccountId.get(account.account_id);

        // Absent: the allocation read filtered the row out. Left unset, not
        // zeroed, since a zero would claim nothing is committed to the account.
        if (!allocation) continue;

        account.allocated = allocation.allocated;
        account.unassignedCash = allocation.unassignedCash;
        account.isOverAllocated = allocation.isOverAllocated;
      }
    }

    const data = {
      rows: accountList.length,
      accountList,
    };

    const message = `Accounts retrieved successfully for accounts type "${accountType}"`;
    console.log('success:', pc[backendColor](message), controllerName);

    return respondSuccess(res, data, 200, message);
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting accounts by account type'));
      console.error(pc.red(`[${controllerName}] Error:`), error);

      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    }

    next(error);
  }
};

// The owner's live accounts of every type, without the compensation account.
export const getAccounts = async (req, res, next) => {
  console.log(pc[backendColor]('getAccounts'));

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const accountTypeQuery = {
      all: {
        typeQuery: {
          text: `SELECT ua.*,  ct.currency_code,  act.account_type_name,
           ${DERIVED_BALANCE} AS account_balance,
           CAST(ua.account_starting_amount AS FLOAT)   
       FROM user_accounts ua
       JOIN account_types act ON ua.account_type_id = act.account_type_id
       JOIN currencies ct ON ua.currency_id = ct.currency_id
       WHERE ua.user_id = $1
       AND ua.account_name != $2
       ${NOT_BOUNDARY_ACCOUNT}
       ${LIVE_ACCOUNT}
       -- The expression and not the output name: ua.* already ships a column
       -- called account_balance, so the bare name is ambiguous here.
       ORDER BY ua.account_type_id ASC, ${DERIVED_BALANCE} DESC
       `,
          values: [userId, 'slack'],
        },
      },
    };
    const accountListResult = await pool.query(
      accountTypeQuery['all'].typeQuery,
    );
    if (accountListResult.rows.length === 0) {
      const message = `No accounts available`;
      console.warn(pc[backendColor](message));
      return res.status(400).json({ status: 400, message });
    }
    const accountList = accountListResult.rows;

    const data = { rows: accountList.length, accountList };

    const message = `Account list successfully completed `;
    console.log('success:', pc[backendColor](message));

    res.status(200).json({ status: 200, message, data });
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting accounts'));

      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    } else {
      console.error(
        pc.red('Error during getting accounts'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

// The owner's closed accounts, the inverse of LIVE_ACCOUNT: a closed account
// keeps its transactions readable, and this is the only list that serves it.
// The compensation account never appears here; nothing can close it.
export const getClosedAccounts = async (req, res, next) => {
  console.log(pc[backendColor]('getClosedAccounts'));

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    // Read from account_registry: closing deletes the user_accounts row in the same transaction that
    // stamps the closure. Search, filter, sort and page come from the query string, validated by the
    // service; the sort key is whitelisted because it reaches ORDER BY as an identifier.
    const data = await getClosedAccountRegistry(pool, userId, req.query);

    // 200 with an empty list, not the live list's 400: closing nothing, or a
    // search matching nothing, is normal, and a screen cannot tell "you have
    // none" from "bad request" by status.
    const message = data.total
      ? 'Closed account list successfully completed'
      : 'No closed accounts';
    console.log('success:', pc[backendColor](message));

    res.status(200).json({ status: 200, message, data });
  } catch (error) {
    console.error(pc.red('Error while getting closed accounts'));
    if (process.env.NODE_ENV === 'development') {
      console.log(error.stack);
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

// One account by id, joined with the extension table of its type.
export const getAccountById = async (req, res, next) => {
  console.log(pc[backendColor]('getAccountById'));
  const basicAccountTypes = ['bank', 'investment', 'income_source'];
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { accountId } = req.params;

    if (!accountId) {
      const message = `Account ID is required.`;
      console.warn(pc[backendColor](message));
      return res.status(400).json({ status: 400, message });
    }
    const accountsResult = await pool.query({
      text: `SELECT act.account_type_name , ua.*,
        -- The ledger figure, carried under its own name so it does not collide
        -- with the stored column ua.* still ships. NUMERIC, so pg hands it back
        -- as text and the wire type of account_balance does not change.
        ${derivedAccountBalanceSql('ua', 'NUMERIC')} AS derived_account_balance
        FROM user_accounts ua
        JOIN account_types act ON 
        act.account_type_id = ua.account_type_id
        WHERE ua.account_id= $1 AND ua.user_id = $2`,
      values: [accountId, userId],
    });

    if (!accountsResult || accountsResult.rows.length === 0) {
      const message = `Account does not exist or user mismatch.`;
      console.warn(pc[backendColor](message));
      return res.status(404).json({ status: 404, message });
    }
    const account_type_name = accountsResult.rows[0].account_type_name;
    if (
      ![
        'pocket_saving',
        'category_budget',
        'bank',
        'investment',
        'income_source',
        'debtor',
      ].includes(account_type_name)
    ) {
      const message = `${account_type_name} is not included in the account types fintrack app`;
      console.warn(message);
      return RESPONSE(res, 404, message);
    }
    const accountTypeQuery = {
      category_budget: {
        typeQuery: {
          text: `
      SELECT
       ua.*, act.*, cba.*,
       ct.currency_code,
       cnt.category_nature_type_name

      FROM user_accounts ua

      JOIN account_types act ON ua.account_type_id = act.account_type_id

      JOIN currencies ct ON ua.currency_id = ct.currency_id

      JOIN category_budget_accounts cba ON ua.account_id = cba.account_id

      JOIN category_nature_types cnt ON cba.category_nature_type_id = cnt.category_nature_type_id

      WHERE ua.user_id =$1
        AND act.account_type_name = $2
        AND ua.account_id = $3 AND ua.account_name != $4
        ${NOT_BOUNDARY_ACCOUNT}
      ORDER BY ua.created_at DESC, ua.updated_at DESC 
      `,
          values: [userId, account_type_name, accountId, 'slack'],
        },
      },

      pocket_saving: {
        typeQuery: {
          text: `SELECT ua.*, act.account_type_name, ct.currency_code, ps.* 
    FROM user_accounts ua
    JOIN account_types act ON ua.account_type_id = act.account_type_id
    JOIN currencies ct ON ua.currency_id = ct.currency_id
    JOIN pocket_saving_accounts ps ON ua.account_id = ps.account_id
    WHERE ua.user_id =$1
    AND ua.account_id = $2
    AND act.account_type_name = $3 AND ua.account_name != $4
    ${NOT_BOUNDARY_ACCOUNT}
`,
          values: [userId, accountId, account_type_name, 'slack'],
        },
      },

      debtor: {
        typeQuery: {
          // Columns listed instead of da.*: debtor_accounts repeats account_id, currency_id and
          // account_start_date, and the driver keeps the last duplicate; the base table's
          // account_start_date is the one the rest of the app reads and derives from.
          text: `SELECT ua.*, act.account_type_name, ct.currency_code,
      da.value, da.debtor_name, da.debtor_lastname,
      da.selected_account_id, da.selected_account_name,
      da.original_value, da.original_currency_id, da.exchange_rate,
      da.exchange_rate_source, da.exchange_rate_timestamp,
      da.exchange_rate_target_currency_id
      FROM user_accounts ua
      JOIN account_types act ON ua.account_type_id = act.account_type_id
      JOIN currencies ct ON ua.currency_id = ct.currency_id
      JOIN debtor_accounts da ON ua.account_id = da.account_id
        WHERE ua.user_id =$1
        AND ua.account_id = $2
        AND act.account_type_name = $3 AND ua.account_name != $4
        ${NOT_BOUNDARY_ACCOUNT}
`,
          values: [userId, accountId, account_type_name, 'slack'],
        },
      },

      // bank, investment and income_source need no entry: the base account row
      // suffices unless these types gain attributes of their own.
    };
    let accountListResult;
    if (basicAccountTypes.includes(account_type_name)) {
      accountListResult = accountsResult;
    } else if (accountTypeQuery.hasOwnProperty(account_type_name)) {
      accountListResult = await pool.query(
        accountTypeQuery[account_type_name].typeQuery,
      );
    } else {
      const message = `No query defined for account type "${account_type_name}"`;
      console.warn(pc[backendColor](message));

      return res.status(400).json({ status: 400, message });
    }
    if (accountListResult.rows.length === 0) {
      const message = `No accounts available for ${account_type_name}`;
      console.warn(pc[backendColor](message));

      return res.status(400).json({ status: 400, message });
    }
    const data = {
      rows: accountListResult.rows.length,
      accountList: [accountListResult.rows[0]],
    };

    // Every branch selects ua.*, which ships the stored balance; replace it with
    // the ledger-derived figure. The detail screen and the category budget's
    // remainder read it with no list beside them to expose a mismatch.
    data.accountList[0].account_balance =
      accountsResult.rows[0].derived_account_balance;
    delete data.accountList[0].derived_account_balance;

    // This route still serves deleted and closed accounts, so flags tell a screen which case it has.
    // Two flags: CLOSE writes both stamps during the dual-write window, so is_deleted is also true
    // for a closed account; is_closed stays correct after close stops writing deleted_at.
    data.accountList[0].is_deleted = Boolean(data.accountList[0].deleted_at);
    data.accountList[0].is_closed = Boolean(data.accountList[0].closed_at);

    // account_start_date is a TIMESTAMPTZ; its day is derived here in the owner's zone because UTC
    // parts name the next day for an account opened after 19:00 in Bogota. Served beside the instant.
    const accountTimeZone = await getUserTimeZone(pool, userId);

    data.accountList[0].account_start_local_date = dayInZone(
      data.accountList[0].account_start_date,
      accountTimeZone,
    );

    // account_balance stays the bank-statement figure; beside it go the pocket-committed amount, the
    // remainder (unassignedCash, never "available": a pocket blocks no spend; may be negative) and the
    // pockets. Null for types where it means nothing (investment, debtor), so the fields are absent.
    const pocketAllocation =
      await accountAllocationService.getAccountAllocation(
        pool,
        userId,
        data.accountList[0].account_id,
        account_type_name,
      );

    if (pocketAllocation) {
      data.accountList[0].allocated = pocketAllocation.allocated;
      data.accountList[0].unassignedCash = pocketAllocation.unassignedCash;
      data.accountList[0].isOverAllocated = pocketAllocation.isOverAllocated;
      data.accountList[0].pockets = pocketAllocation.pockets;
    }
    const message = `Get account successfully!`;
    console.log('success:', pc[backendColor](message));

    res.status(200).json({ status: 200, message, data });
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting accounts by account ID'));

      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    } else {
      console.error(
        pc.red('Error during getting accounts by ID'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

// The owner's live accounts of one category, by category name.
export const getAccountsByCategory = async (req, res, next) => {
  console.log(pc[backendColor]('getAccountsByCategory'));

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { categoryName } = req.params;

    if (!categoryName) {
      const message = `Category name is required.`;
      console.warn(pc[backendColor](message));
      return res.status(400).json({ status: 400, message });
    }
    // Alias order is load-bearing: ua.* already ships the stored account_balance
    // and the driver keeps the last of two same-named columns, so the derived
    // expression must stay after ua.*.
    const accountsResult = await pool.query({
      text: `SELECT ua.*, ${DERIVED_BALANCE} AS account_balance, CAST(ua.Account_starting_amount AS FLOAT), cba.*,CAST(cba.budget AS FLOAT),
       cur.currency_code,act.account_type_name ,cnt.category_nature_type_name
      FROM user_accounts ua
      JOIN category_budget_accounts cba ON cba.account_id = ua.account_id
      JOIN category_nature_types cnt ON cnt.category_nature_type_id = cba.category_nature_type_id
      JOIN currencies cur ON cur.currency_id = ua.currency_id
      JOIN account_types act ON act.account_type_id= ua.account_type_id

      WHERE cba.category_name = $1 AND ua.user_id = $2
      ${LIVE_ACCOUNT}
      
      ORDER BY cba.category_name asc, cnt.category_nature_type_id asc`,
      values: [categoryName, userId],
    });

    if (!accountsResult || accountsResult.rows.length === 0) {
      const message = `No accounts of cateogry ${categoryName} were found`;
      console.warn(pc[backendColor](message));
      return res.status(400).json({ status: 400, message });
    }

    const accountListResult = accountsResult;

    if (accountListResult.rows.length === 0) {
      const message = `No accounts available`;
      console.warn(pc[backendColor](message));
      return res.status(400).json({ status: 400, message });
    }

    const accountList = accountListResult.rows;

    const data = { rows: accountList.length, accountList };

    const message = `${categoryName} account list successfully completed `;
    console.log('success:', pc[backendColor](message));

    res.status(200).json({ status: 200, message, data });
  } catch (error) {
    if (error instanceof Error) {
      console.error(pc.red('Error while getting accounts by category name'));

      if (process.env.NODE_ENV === 'development') {
        console.log(error.stack);
      }
    } else {
      console.error(
        pc.red('Error during getting accounts by category name'),
        pc[errorColor]('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  }
};

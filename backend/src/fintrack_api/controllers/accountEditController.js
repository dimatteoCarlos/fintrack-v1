import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import {
 normalizeAccountName,
 normalizePersonName,
} from '../../utils/helpers.js';

import { requireUserId } from '../../utils/authUtils/requireUserId.js';

/**
 * Partially updates an account: takes only the modified fields and picks the tables
 * to update (user_accounts plus the type-specific table).
 */
// Endpoint: /api/fintrack/account/edit/:accountId
export const patchAccountById = async (req, res, next) => {
  console.log(pc['yellowBright']('patchAccountById'));

  const client = await pool.connect();

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { accountId } = req.params;
    const payload = req.body;
    console.log('🚀 ~ patchAccountById ~ payload:', payload.account_name);

    if (!accountId) {
     return res.status(400).json({ status: 400, message: 'Account ID is required.' });
    }

    // Fetched without a state predicate on purpose: a closed account must be found to be
    // refused by name, and a predicate would answer a misleading 404. closed_at feeds
    // the guard below.
    const accountInfoResult = await client.query({
     text:
      `SELECT act.account_type_name, ua.account_type_id, ua.closed_at
      FROM user_accounts ua
      JOIN account_types act ON act.account_type_id = ua.account_type_id
      WHERE ua.account_id = $1 AND ua.user_id = $2`,

     values: [accountId, userId],
    });

    if (!accountInfoResult || accountInfoResult.rows.length === 0) {
      const message = 'Account not found or user mismatch.';
      console.warn(pc['red'](message));
      return res.status(404).json({ status: 404, message });
    }

    // Closed accounts stay uneditable: history prefers the live user_accounts name over the archive,
    // so a rename would rewrite past transactions. Unreachable while CLOSE deletes the row; 409
    // because the request is well formed and the state refuses it.
    if (accountInfoResult.rows[0].closed_at !== null) {
      const message = `Account ${accountId} is closed and cannot be edited. Its name, type and currency are the ones its history is recorded under.`;
      console.warn(pc['red'](message));
      return res.status(409).json({ status: 409, message });
    }

    const { account_type_name } = accountInfoResult.rows[0];

    const userAccountFields = {
      account_name: payload.account_name,
      note: payload.note,
    };
    console.log(
      '🚀 ~ patchAccountById ~ userAccountFields:',
      userAccountFields,
    );

    const specificFields = {};

    switch (account_type_name) {
      case 'pocket_saving':
        if (payload.target !== undefined)
          specificFields.target = payload.target;

        if (payload.desired_date !== undefined)
          specificFields.desired_date = payload.desired_date;

        if (payload.note !== undefined) specificFields.note = payload.note;

        console.log('pocket_saving', payload);
        console.log('account pocket', userAccountFields.account_name);

        break;

      case 'category_budget': {
        // The budget is a four-part decision (amount, currency, month, range) owned by
        // PUT /budget/accounts/:id/current, so a budget key in this payload is ignored.

        // The parts are normalized too, not only the derived name: storing 'Comida' next
        // to a derived 'comida/...' puts one word in two forms in the same row.
        if (payload.category_name !== undefined)
          specificFields.category_name = normalizeAccountName(payload.category_name);

        if (payload.subcategory !== undefined)
          specificFields.subcategory = normalizeAccountName(payload.subcategory);

        // The nature is editable (identity is account_id; account_name is a derived label
        // that follows). Resolved against the catalog so an unknown value is a 400, not a
        // foreign key violation surfacing as a 500.
        let natureName = null;

        if (payload.category_nature_type_name !== undefined) {
          natureName = normalizeAccountName(payload.category_nature_type_name);

          const natureRow = await client.query({
            text: `SELECT category_nature_type_id FROM category_nature_types
                    WHERE LOWER(category_nature_type_name) = $1`,
            values: [natureName],
          });

          if (natureRow.rows.length === 0) {
            const message = `category_nature_type_name must be a known nature. Received: ${payload.category_nature_type_name}.`;
            console.warn(pc['red'](message));
            return res.status(400).json({ status: 400, message });
          }

          specificFields.category_nature_type_id =
            natureRow.rows[0].category_nature_type_id;
        }

        // account_name is derived but the payload is partial: rebuilding from the payload alone
        // would yield "//undefined", so the payload is merged over the stored parts.
        const stored = await client.query({
         text:
          `SELECT cba.category_name, cba.subcategory, cnt.category_nature_type_name
          FROM category_budget_accounts cba
          JOIN category_nature_types cnt
           ON cnt.category_nature_type_id = cba.category_nature_type_id
          WHERE cba.account_id = $1`,

         values: [accountId],
        });

        if (stored.rows.length === 0) {
         console.warn(
          pc['red'](
           `No category_budget_accounts row for account ${accountId}. Leaving account_name untouched.`,
          ),
         );
         break;
        }

        const current = stored.rows[0];
        const categoryName = payload.category_name ?? current.category_name;
        const subcategory = payload.subcategory ?? current.subcategory;
        const nature = natureName ?? current.category_nature_type_name;

        userAccountFields.account_name = normalizeAccountName(
          `${categoryName}/${subcategory}/${nature}`,
        );

        if (payload.account_name !== userAccountFields.account_name) {
          console.log(`Check the input account name`);
        }

        break;
      }
      case 'debtor': {
        if (payload.debtor_name !== undefined)
          specificFields.debtor_name = normalizePersonName(payload.debtor_name);

        if (payload.debtor_lastname !== undefined)
          specificFields.debtor_lastname = normalizePersonName(
           payload.debtor_lastname,
          );

        // As with category_budget, stored parts fill whatever the partial payload omits;
        // without them a missing debtor_lastname would throw on .trim() and return 500.
        const stored = await client.query({
         text: `SELECT debtor_name, debtor_lastname FROM debtor_accounts WHERE account_id = $1`,
         values: [accountId],
        });

        if (stored.rows.length === 0) {
         console.warn(
          pc['red'](
           `No debtor_accounts row for account ${accountId}. Leaving account_name untouched.`,
          ),
         );
         break;
        }

        const current = stored.rows[0];
        const debtorName = payload.debtor_name ?? current.debtor_name;
        const debtorLastname =
         payload.debtor_lastname ?? current.debtor_lastname;

        // Rebuilt with the case the user typed; lowercasing first would turn McCartney
        // into Mccartney.
        userAccountFields.account_name = `${normalizePersonName(debtorLastname)}, ${normalizePersonName(debtorName)}`;

        break;
      }
    }

    // Reject a rename onto a name this user already holds; runs after the switch because the name is
    // composed there. Key is name plus account type per user (as verifyAccountExistence), excluding
    // the account itself; a soft-deleted account frees its name, a closed one keeps it.
    if (userAccountFields.account_name !== undefined) {
      const nameCollision = await client.query({
        text: `SELECT ua.account_id FROM user_accounts ua
                JOIN account_types act
                  ON act.account_type_id = ua.account_type_id
                WHERE ua.user_id = $1
                  AND LOWER(ua.account_name) = LOWER($2)
                  AND LOWER(act.account_type_name) = LOWER($3)
                  AND ua.account_id <> $4
                  -- A closed account keeps its name; only a soft-deleted one frees it.
                  -- Erasure rewrites descriptions by substring match on the account name,
                  -- so a freed name would let a namesake's deletion rewrite the closed
                  -- account's preserved rows.
                  AND (ua.closed_at IS NOT NULL OR ua.deleted_at IS NULL)`,
        values: [
          userId,
          userAccountFields.account_name,
          account_type_name,
          accountId,
        ],
      });

      if (nameCollision.rows.length > 0) {
        const message = `An account named ${userAccountFields.account_name} already exists.`;
        console.warn(pc['red'](message));
        return res.status(400).json({ status: 400, message });
      }
    }

    const userAccountSqlParameters = []; //['key=$n', ]
    const userAccountSqlValues = [];
    let sqlParameter = 1;

    for (const keyFieldName in userAccountFields) {
      const sqlValue = userAccountFields[keyFieldName];
      if (sqlValue !== undefined) {
        userAccountSqlParameters.push(`${keyFieldName} = $${sqlParameter}`);
        userAccountSqlValues.push(sqlValue);
        sqlParameter++;
      }
    }

    if (
      userAccountSqlParameters.length === 0 &&
      Object.keys(specificFields).length === 0
    ) {
      return res.status(400).json({
        status: 400,
        message: 'No fields to update',
      });
    }

    await client.query('BEGIN');
    if (userAccountSqlParameters.length > 0) {
      userAccountSqlValues.push(accountId, userId); // the last two placeholders
      const userAccountQuery = `
       UPDATE user_accounts SET 
       ${userAccountSqlParameters.join(', ')},
       updated_at = NOW() 
       WHERE account_id = $${sqlParameter} AND user_id = $${sqlParameter + 1}; 
       `;
      await client.query(userAccountQuery, userAccountSqlValues);
    }

    if (Object.keys(specificFields).length > 0) {
      const allowedTables = {
        category_budget: 'category_budget_accounts',
        pocket_saving: 'pocket_saving_accounts',
        debtor: 'debtor_accounts',
      };

      const tableName = allowedTables[account_type_name];

      const specificUpdateSqlParameters = [];
      const specificSqlValues = [];
      let specificSqlParameters = 1;

      // Placeholder index of desired_date, so the provenance check below compares the
      // very value being written.
      let desiredDateParameter = null;

      for (const key in specificFields) {
        specificUpdateSqlParameters.push(`${key} = $${specificSqlParameters}`);
        specificSqlValues.push(specificFields[key]);

        if (key === 'desired_date') desiredDateParameter = specificSqlParameters;

        specificSqlParameters++;
      }

      // A changed deadline is a user choice, so desired_date_source flips to 'user'. Guarded on the
      // value differing, not presence: the editor resubmits the whole form. SET expressions read the
      // OLD row, so the bare column in IS DISTINCT FROM is the stored value.
      if (desiredDateParameter !== null && tableName === 'pocket_saving_accounts') {
        specificUpdateSqlParameters.push(
          `desired_date_source = CASE WHEN desired_date IS DISTINCT FROM $${desiredDateParameter}::timestamptz THEN 'user' ELSE desired_date_source END`,
        );
      }

      specificSqlValues.push(accountId); // the last placeholder
      const specificQuery = `
     UPDATE ${tableName} SET 
     ${specificUpdateSqlParameters.join(', ')}
     WHERE account_id = $${specificSqlParameters}; 
 `;
      await client.query(specificQuery, specificSqlValues);
    }

    await client.query('COMMIT');

    req.params.accountId = accountId;
    const message = `Account ${accountId} updated successfully!`;
    console.log('success:', pc.greenBright(message));

    res.status(200).json({
      status: 200,
      message,
      data: {
        account_id: accountId,
        ...userAccountFields,
        ...specificFields,
      }, //returns partial updated account info
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  } finally {
    client.release();
  }
};

// The accounts one account has actually operated with, for the close screen.

import pc from 'picocolors';
import { TARGET_ACCOUNT_TRANSACTIONS_CTE } from './getAnnulmentImpactReport.js';

/**
 * Per counterparty: interaction count, net amount, movement types and last date. One level
 * only (the shared CTE filters `tr.account_id = $2`); the inner join drops counterparties
 * deleted earlier, which `getUnattributedAnnulmentTotal` counts.
 * @param {object} dbClient - a pg client or the pool
 * @returns {Promise<Array<{accountId: number, accountName: string,
 *   accountTypeName: string, interactionCount: number, netAmount: number,
 *   movementBreakdown: Array<{movementTypeName: string, count: number}>,
 *   lastInteractionDate: string}>>} ordered by interaction count, descending
 */
export const getRelatedAccounts = async (dbClient, userId, targetAccountId) => {
 const relatedQuery = `
${TARGET_ACCOUNT_TRANSACTIONS_CTE},

 -- The same rows counted per counterparty and movement type, then folded back by
 -- the subquery below, so the breakdown always sums to interaction_count.
 MovementBreakdown AS
 (
  SELECT
   tat.affected_account_id,
   mt.movement_type_name,
   COUNT(*)::int AS movement_count

  FROM TargetAccountTransactions tat

  -- Inner, and safe: transactions.movement_type_id is INTEGER NOT NULL with a
  -- foreign key into movement_types, so every row has exactly one match.
  JOIN
   movement_types mt ON mt.movement_type_id = tat.movement_type_id

  GROUP BY
   tat.affected_account_id, mt.movement_type_name
 )

 SELECT
  tat.affected_account_id,
  ua.account_name,
  acctype.account_type_name,
  COUNT(*)::int AS interaction_count,
  -- The target's own signed amounts, netted per counterparty. FLOAT rather
  -- than NUMERIC to match every other amount this module returns; the column
  -- is rendered to two decimals and never summed again downstream.
  SUM(tat.amount)::float AS net_amount,
  MAX(tat.transaction_actual_date) AS last_interaction_date,

  -- A correlated aggregate, not a second GROUP BY level: the breakdown is a detail of
  -- the per-counterparty row, not a different grain. json_agg over an empty set is
  -- NULL, which cannot occur here; the COALESCE keeps the field an array regardless.
  COALESCE(
   (
    SELECT json_agg(
     json_build_object(
      'movementTypeName', mb.movement_type_name,
      'count', mb.movement_count
     )
     ORDER BY mb.movement_count DESC, mb.movement_type_name ASC
    )
    FROM MovementBreakdown mb
    WHERE mb.affected_account_id = tat.affected_account_id
   ),
   '[]'::json
  ) AS movement_breakdown

 FROM TargetAccountTransactions tat

 JOIN
  user_accounts ua ON ua.account_id = tat.affected_account_id

 JOIN
  account_types acctype ON ua.account_type_id = acctype.account_type_id

 GROUP BY
  tat.affected_account_id, ua.account_name, acctype.account_type_name

 -- Most-dealt-with account first; the name breaks ties so the order is stable
 -- across calls.
 ORDER BY
  interaction_count DESC, ua.account_name ASC
 `;

 const { rows } = await dbClient.query(relatedQuery, [userId, targetAccountId]);

 console.log(
  pc.blue(
   `Target ${targetAccountId} has interacted with ${rows.length} live accounts.`,
  ),
 );

 return rows.map((row) => ({
  accountId: row.affected_account_id,
  accountName: row.account_name,
  accountTypeName: row.account_type_name,
  interactionCount: row.interaction_count,
  netAmount: row.net_amount,
  movementBreakdown: row.movement_breakdown,
  lastInteractionDate: row.last_interaction_date,
 }));
};

export default getRelatedAccounts;

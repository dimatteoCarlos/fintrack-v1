// Pocket reads: one row per owned pocket; the service folds totals from these rows so header and list agree.
// Amounts leave as text: pg returns NUMERIC as a string that money() parses exactly, unlike a FLOAT cast.

/**
 * The calendar date of "now" on the owner's clock, resolved in SQL rather than from the
 * node or browser zone: overdue, days remaining and the monthly pace all branch on it.
 *
 * @param {string} timeZone - the owner's IANA zone
 * @returns {Promise<string>} YYYY-MM-DD
 */
export async function getCalendarToday(db, timeZone) {
 const { rows } = await db.query(
  `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today`,
  [timeZone],
 );

 return rows[0].today;
}

/**
 * Every pocket of one user as of the close of one month; allocated is the ledger sum, not account_balance.
 * The bound sits in each FILTER, not the join, so an empty pocket reads zero instead of vanishing.
 * Month bounds cast to ::timestamp, never ::date, which selects the instant overload and shifts the window.
 *
 * @param {string} userId - UUID from the token, never from the client
 * @param {string} monthStart - first day of the selected month, YYYY-MM-01
 * @param {string} timeZone - the owner's IANA zone
 * @returns {Promise<object[]>} raw rows
 */
export async function getPocketsForUser(pool, userId, monthStart, timeZone) {
 const { rows } = await pool.query(
  `
  SELECT
   p.pocket_id                             AS "pocketId",
   p.name                                  AS name,
   p.note                                  AS note,
   p.target_amount::text                   AS target,
   p.original_target::text                 AS "originalTarget",
   p.original_currency_id                  AS "originalCurrencyId",
   p.exchange_rate::text                   AS "exchangeRate",
   p.exchange_rate_source                  AS "exchangeRateSource",
   to_char(p.exchange_rate_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "exchangeRateTimestamp",
   p.exchange_rate_target_currency_id      AS "exchangeRateTargetCurrencyId",
   to_char(p.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS "planStart",
   COALESCE(SUM(pa.amount) FILTER (
    WHERE pa.allocation_actual_date < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
   ), 0)::text                             AS allocated,
   COALESCE(SUM(pa.amount) FILTER (
    WHERE pa.allocation_actual_date >= ($2::timestamp AT TIME ZONE $3)
      AND pa.allocation_actual_date <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
   ), 0)::text                             AS "movedInMonth",
   COALESCE(SUM(pa.amount) FILTER (
    WHERE pa.amount > 0
      AND pa.allocation_actual_date >= ($2::timestamp AT TIME ZONE $3)
      AND pa.allocation_actual_date <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
   ), 0)::text                             AS "committedInMonth",
   COALESCE(-SUM(pa.amount) FILTER (
    WHERE pa.amount < 0
      AND pa.allocation_actual_date >= ($2::timestamp AT TIME ZONE $3)
      AND pa.allocation_actual_date <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
   ), 0)::text                             AS "releasedInMonth",
   to_char(p.desired_date, 'YYYY-MM-DD')   AS "desiredDate",
   COUNT(DISTINCT pa.source_account_id) FILTER (
    WHERE pa.allocation_actual_date < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
   )::int                                  AS "sourceCount",
   lower(ct.currency_code)                 AS currency
  FROM pockets p
  JOIN currencies ct ON ct.currency_id = p.currency_id
  LEFT JOIN pocket_allocations pa ON pa.pocket_id = p.pocket_id
  WHERE p.user_id = $1
   AND p.created_at < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
  GROUP BY p.pocket_id, ct.currency_code
  ORDER BY p.desired_date ASC, p.name ASC
  `,
  [userId, monthStart, timeZone],
 );

 return rows;
}

/**
 * One pocket of one user, in the board-row shape; user_id in the WHERE hides another user's pocket.
 * The caller answers 403 for both "missing" and "not yours", so ids cannot be probed.
 * planStart needs the owner's zone to match the board; write paths only prove ownership, default zone.
 *
 * @param {string} userId - UUID from the token
 * @param {string} [timeZone] - the owner's IANA zone; only planStart reads it
 * @returns {Promise<object|null>} the raw row, or null when there is none
 */
export async function getPocketForUser(db, userId, pocketId, timeZone = 'UTC') {
 const { rows } = await db.query(
  `
  SELECT
   p.pocket_id                             AS "pocketId",
   p.name                                  AS name,
   p.note                                  AS note,
   p.target_amount::text                   AS target,
   p.original_target::text                 AS "originalTarget",
   p.original_currency_id                  AS "originalCurrencyId",
   p.exchange_rate::text                   AS "exchangeRate",
   p.exchange_rate_source                  AS "exchangeRateSource",
   to_char(p.exchange_rate_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "exchangeRateTimestamp",
   p.exchange_rate_target_currency_id      AS "exchangeRateTargetCurrencyId",
   to_char(p.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS "planStart",
   COALESCE(SUM(pa.amount), 0)::text       AS allocated,
   to_char(p.desired_date, 'YYYY-MM-DD')   AS "desiredDate",
   COUNT(DISTINCT pa.source_account_id)::int AS "sourceCount",
   lower(ct.currency_code)                 AS currency
  FROM pockets p
  JOIN currencies ct ON ct.currency_id = p.currency_id
  LEFT JOIN pocket_allocations pa ON pa.pocket_id = p.pocket_id
  WHERE p.user_id = $1
   AND p.pocket_id = $2
  GROUP BY p.pocket_id, ct.currency_code
  `,
  [userId, pocketId, timeZone],
 );

 return rows[0] ?? null;
}

/**
 * Every allocation and release of one pocket, newest decision first, with FX fields for the detail modal.
 * Ordered on allocation_actual_date (when decided), never created_at (when typed): a Friday decision keyed
 * on Monday belongs to Friday.
 *
 * @param {string} userId - UUID from the token
 * @param {string} timeZone - the owner's IANA zone
 * @returns {Promise<object[]>} raw rows
 */
export async function getPocketHistory(db, userId, pocketId, timeZone) {
 const { rows } = await db.query(
  `
  SELECT
   pa.allocation_id::text        AS "allocationId",
   pa.amount::text               AS amount,
   to_char(pa.allocation_actual_date AT TIME ZONE $3, 'YYYY-MM-DD') AS "allocationDate",
   to_char(pa.allocation_actual_date AT TIME ZONE $3, 'HH24:MI')     AS "allocationTime",
   pa.source_account_id          AS "sourceAccountId",
   -- A closed account's name survives on account_registry, stamped at closure.
   COALESCE(ua.account_name, ar.account_name) AS "sourceAccountName",
   -- True only when the row is absent; CLOSE keeps it, so a closed source is not flagged.
   (ua.account_id IS NULL)       AS "sourceAccountIsClosed",
   pa.original_amount::text      AS "originalAmount",
   lower(oc.currency_code)       AS "originalCurrency",
   pa.exchange_rate::text        AS "exchangeRate",
   pa.exchange_rate_source       AS "exchangeRateSource",
   pa.exchange_rate_timestamp    AS "exchangeRateTimestamp"
  FROM pocket_allocations pa
  -- LEFT: this join supplies a label, not a row; inner, it would drop the
  -- allocations of any source account whose row is gone.
  LEFT JOIN user_accounts ua ON ua.account_id = pa.source_account_id
  LEFT JOIN account_registry ar ON ar.account_id = pa.source_account_id
  JOIN currencies oc ON oc.currency_id = pa.original_currency_id
  WHERE pa.user_id = $1
   AND pa.pocket_id = $2
  ORDER BY pa.allocation_actual_date DESC, pa.allocation_id DESC
  `,
  [userId, pocketId, timeZone],
 );

 return rows;
}

/**
 * Every allocation and release of every owned pocket up to the close of one month, in one statement.
 * The ceiling matches `allocated` in getPocketsForUser with no floor, so rows sum to the board figure.
 * Ordered by pocket then forward in time: the append-only ledger (+300 then -50) reads as a running total.
 *
 * @param {string} userId - UUID from the token
 * @param {string} monthStart - first day of the selected month, YYYY-MM-01
 * @param {string} timeZone - the owner's IANA zone
 * @returns {Promise<object[]>} raw rows, amount as text
 */
export async function getPocketHistoryForUser(db, userId, monthStart, timeZone) {
 const { rows } = await db.query(
  `
  SELECT
   pa.pocket_id                  AS "pocketId",
   p.name                        AS "pocketName",
   pa.amount::text               AS amount,
   to_char(pa.allocation_actual_date AT TIME ZONE $3, 'YYYY-MM-DD') AS "allocationDate",
   -- A closed account's name survives on account_registry, stamped at closure.
   COALESCE(ua.account_name, ar.account_name) AS "sourceAccountName"
  FROM pocket_allocations pa
  -- Inner: an allocation cannot outlive its pocket, and the pocket's name is
  -- what identifies the row once every pocket shares one table.
  JOIN pockets p ON p.pocket_id = pa.pocket_id
  -- LEFT on both: these supply a label, not a row; inner, either would drop the
  -- allocations of any source account whose row is gone.
  LEFT JOIN user_accounts ua ON ua.account_id = pa.source_account_id
  LEFT JOIN account_registry ar ON ar.account_id = pa.source_account_id
  WHERE pa.user_id = $1
   AND pa.allocation_actual_date < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY p.name ASC, pa.allocation_actual_date ASC, pa.allocation_id ASC
  `,
  [userId, monthStart, timeZone],
 );

 return rows;
}

/**
 * Write a new pocket with no money and no source account; allocating is a separate decision.
 * target_amount is already in the accounting currency; the origin columns keep the typed value and rate.
 *
 * @param {string} userId - UUID from the token
 * @param {object} pocket - amounts already converted and normalized
 * @returns {Promise<number>} the new pocket_id
 */
export async function insertPocket(db, userId, pocket) {
 const { rows } = await db.query(
  `
  INSERT INTO pockets (
   user_id, name, note, target_amount, currency_id, desired_date,
   original_target, original_currency_id, exchange_rate, exchange_rate_source,
   exchange_rate_timestamp, exchange_rate_target_currency_id
  )
  VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12)
  RETURNING pocket_id AS "pocketId"
  `,
  [
   userId,
   pocket.name,
   pocket.note,
   pocket.targetAmount,
   pocket.currencyId,
   pocket.desiredDate,
   pocket.originalTarget,
   pocket.originalCurrencyId,
   pocket.exchangeRate,
   pocket.exchangeRateSource,
   pocket.exchangeRateTimestamp,
   pocket.exchangeRateTargetCurrencyId,
  ],
 );

 return rows[0].pocketId;
}

/**
 * Overwrite the plan of one pocket (target and date are overwritten; allocations are appended).
 * COALESCE per column, plus a "was sent" flag for note, so clearing it differs from leaving it alone.
 * FX columns move with the target or not at all: a stale rate would claim to have produced the new target.
 *
 * @param {string} userId - UUID from the token
 * @param {object} fields - undefined for every value the caller did not send
 * @returns {Promise<boolean>} whether a row was updated
 */
export async function updatePocket(db, userId, pocketId, fields) {
 const hasTarget = fields.targetAmount !== undefined;

 const { rowCount } = await db.query(
  `
  UPDATE pockets
     SET name          = COALESCE($3, name),
         note          = CASE WHEN $4::boolean THEN $5 ELSE note END,
         target_amount = COALESCE($6, target_amount),
         desired_date  = COALESCE($7::date, desired_date),
         original_target                  = COALESCE($8, original_target),
         original_currency_id             = COALESCE($9, original_currency_id),
         exchange_rate                    = COALESCE($10, exchange_rate),
         exchange_rate_source             = COALESCE($11, exchange_rate_source),
         exchange_rate_timestamp          = COALESCE($12, exchange_rate_timestamp),
         updated_at    = now()
   WHERE pocket_id = $1
     AND user_id = $2
  `,
  [
   pocketId,
   userId,
   fields.name ?? null,
   fields.noteWasSent,
   fields.note ?? null,
   hasTarget ? fields.targetAmount : null,
   fields.desiredDate ?? null,
   hasTarget ? fields.originalTarget : null,
   hasTarget ? fields.originalCurrencyId : null,
   hasTarget ? fields.exchangeRate : null,
   hasTarget ? fields.exchangeRateSource : null,
   hasTarget ? fields.exchangeRateTimestamp : null,
  ],
 );

 return rowCount > 0;
}

/**
 * Delete one pocket and, by cascade, its ledger; allowed whatever it holds.
 * An allocation never moved money: the cash returns to each source account's unassigned cash.
 *
 * @param {string} userId - UUID from the token
 * @returns {Promise<boolean>} whether a row was deleted
 */
export async function deletePocket(db, userId, pocketId) {
 const { rowCount } = await db.query(
  `DELETE FROM pockets WHERE pocket_id = $1 AND user_id = $2`,
  [pocketId, userId],
 );

 return rowCount > 0;
}

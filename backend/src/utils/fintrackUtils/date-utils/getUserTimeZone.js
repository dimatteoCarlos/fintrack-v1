// Every period boundary depends on the user's IANA zone, so it is fetched once
// per request at the controller and passed down; no service resolves identity itself.

/**
 * Read the stored time zone of a user. Falls back to UTC instead of throwing: the column
 * is NOT NULL, so a row is missing only for an unknown id, and a read must not die on that.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db - a pool, or the client
 *  of a transaction in flight so the read shares its snapshot
 * @param {string} userId - UUID from the token, never from the client body
 * @returns {Promise<string>} an IANA zone identifier
 */
export async function getUserTimeZone(db, userId) {
 const { rows } = await db.query(
  `SELECT timezone FROM users WHERE user_id = $1`,
  [userId],
 );

 return rows[0]?.timezone ?? 'UTC';
}

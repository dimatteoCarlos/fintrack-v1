// Owner's name for a download's filename, fetched once per request and passed down.

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db - a pool, or the client
 *  of a transaction in flight so the read shares its snapshot.
 * @param {string} userId - UUID from the token, never from the client body.
 * @returns {Promise<string>} the username, or 'user' when the row is missing
 */
export async function getUsername(db, userId) {
 const { rows } = await db.query(
  `SELECT username FROM users WHERE user_id = $1`,
  [userId],
 );

 return rows[0]?.username ?? 'user';
}

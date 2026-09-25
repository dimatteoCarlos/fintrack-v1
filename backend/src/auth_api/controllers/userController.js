// User controllers: profile read and update, password change.
import {
  hashed,
  isRight,
  revokeAllUserRefreshTokens,
} from '../../utils/authUtils/authFn.js';
import { createError } from '../../utils/errorHandling.js';

import { pool } from '../../db/config/configDB.js';
import { LIVE_ACCOUNT } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';

import {
  clearAccessTokenFromCookie,
  clearRefreshTokenFromCookie,
} from '../middlewares/authMiddleware.js';

export const getUserById = async (req, res, next) => {
  const { userId, userRole } = req.user;

  try {
    const userDataResult = await pool.query({
      text: `SELECT u.user_id, u.username,
    u.email,
    u.user_firstname,
    u.user_lastname,
    u.user_contact,
    u.timezone,
    currencies.currency_name,
    currencies.currency_code as currency,
    user_roles.user_role_name as user_role
    FROM users u
    JOIN currencies ON currencies.currency_id = u.currency_id
    JOIN user_roles ON user_roles.user_role_id = u.user_role_id
    WHERE u.user_id = $1
    `,
      values: [userId],
    });

    const userData = userDataResult.rows[0];

    if (!userData) {
      return next(createError(404, 'user not found'));
    }
    const userAccountsResult = await pool.query({
      // Aliased ua only because LIVE_ACCOUNT names that alias; duplicating its two stamps
      // here would let them drift between files.
      text: `SELECT ua.account_id
        FROM user_accounts ua
       WHERE ua.user_id = $1
       ${LIVE_ACCOUNT}
       ORDER BY ua.account_id ASC
    `,
      values: [userId],
    });

    // Shape: { account_id: number }[]
    const userAccountsId = userAccountsResult.rows;

    res.status(200).json({
      message: 'user data available ',
      user: userData,
      userAccountsId,
      role: userRole,
    });
  } catch (error) {
    console.log('auth error:', error);
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {

  const client = await pool.connect();

  try {
    const { userId } = req.user;
    const updateData = req.validatedData; // validated by Zod, not req.body


    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'No valid fields provided for update',
      });
    }

    await client.query('BEGIN');
    const userCheck = await client.query(
      'SELECT 1 FROM users WHERE user_id =$1',
      [userId],
    );
    if (userCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(createError(404, 'User not found'));
    }
    // The UPDATE is built from only the provided fields.
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (updateData.firstname !== undefined) {
      updates.push(`user_firstname=$${paramCount}`);
      values.push(updateData.firstname);
      paramCount++;
    }
    if (updateData.lastname !== undefined) {
      updates.push(`user_lastname=$${paramCount}`);
      values.push(updateData.lastname);
      paramCount++;
    }
    if (updateData.currency !== undefined) {
      const currencyResult = await client.query(
        'SELECT currency_id FROM currencies WHERE currency_code = $1',
        [updateData.currency],
      );

      if (currencyResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return next(
          createError(
            400,
            `Currency '${updateData.currency}' is not supported`,
          ),
        );
      }

      updates.push(`currency_id = $${paramCount}`);
      values.push(currencyResult.rows[0].currency_id);
      paramCount++;
    }
    if (updateData.contact !== undefined) {
      // null clears the contact.
      updates.push(`user_contact=$${paramCount}`);
      values.push(updateData.contact);
      paramCount++;
    }
    // Zod already checked it against the set the trigger admits, so no lookup here: unlike
    // currency, the catalog is not a table this query can join.
    if (updateData.timezone !== undefined) {
      updates.push(`timezone = $${paramCount}`);
      values.push(updateData.timezone);
      paramCount++;
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'No valid fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(userId);
    const updateQuery = `
   UPDATE users
   SET ${updates.join(', ')}
   WHERE user_id = $${paramCount}
   RETURNING user_id, username, email, user_firstname, user_lastname, user_contact, currency_id, timezone
  `;

    await client.query(updateQuery, values);

    const fullUserData = await client.query({
      text: `
   SELECT u.user_id, u.username, u.email,
    u.user_firstname, u.user_lastname,
    u.user_contact, u.timezone, c.currency_code as currency, c.currency_name,
    ur.user_role_name as role
   FROM users u
   JOIN currencies c ON c.currency_id = u.currency_id
   JOIN user_roles ur ON ur.user_role_id = u.user_role_id
   WHERE u.user_id = $1`,
      values: [userId],
    });

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: fullUserData.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(
      `[UPDATE PROFILE ERROR] User: ${req.user?.userId}, IP: ${req.ip}`,
      error,
    );
    next(createError(500, 'Internal server error'));
  } finally {
    client.release();
  }
};

// Status codes: 401 invalid or expired token (auth middleware), 403 wrong current password
// (no logout), 400 schema validation, 429 rate limit.
export const changePassword = async (req, res, next) => {

  const client = await pool.connect();

  try {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.validatedData;

    // Already enforced by the Zod schema.
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'New password was not received',
      });
    }

    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT u.password_hashed 
     FROM users u
     WHERE u.user_id = $1
     `,
      [userId],
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found',
      });
    }

    const isMatch = await isRight(
      currentPassword,
      userResult.rows[0].password_hashed,
    );

    if (!isMatch) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Current password is incorrect',
        fieldErrors: {
          currentPassword: ['Current password is incorrect'],
        },
      });
    }

    const isSamePassword = await isRight(
      newPassword,
      userResult.rows[0].password_hashed,
    );

    if (isSamePassword) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'New password must be different from the current password',
        fieldErrors: {
          newPassword: [
            'New password must be different from the current password',
          ],
        },
      });
    }

    const newHashedPassword = await hashed(newPassword);

    // token_version increments with the hash so the live access token stops verifying at once;
    // revokeAllUserRefreshTokens only stops future refreshes, leaving it valid for up to an hour.
    await client.query({
      text: `UPDATE users SET password_hashed = $1, updated_at = CURRENT_TIMESTAMP, token_version = token_version + 1
    WHERE user_id = $2`,
      values: [newHashedPassword, userId],
    });

    await client.query('COMMIT');

    req.validatedData = undefined;

    await revokeAllUserRefreshTokens(userId, client);
    clearAccessTokenFromCookie(res);
    clearRefreshTokenFromCookie(res);

    return res.status(200).json({
      success: true,
      message:
        'Password changed successfully. Please sign in again with your new password.',
    });
  } catch (error) {
    await client.query('ROLLBACK');

    // Rate-limit errors go to the error handler unchanged.
    if (error.status === 429) {
      return next(error);
    }

    console.error('changePassword error:', error);

    next(
      createError(
        500,
        error.message ?? 'Internal error while changing password',
      ),
    );
  } finally {
    client.release();
  }
};

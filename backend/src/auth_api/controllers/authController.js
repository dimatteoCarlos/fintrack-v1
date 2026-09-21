// Auth controllers: sign-up, sign-in, sign-out and session validation.
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/config/configDB.js';
import pc from 'picocolors';

import {
  createToken,
  createRefreshToken,
  hashed,
  hashToken,
  isRight,
  getDecoyHash,
  refreshTokenExpiryFrom,
} from '../../utils/authUtils/authFn.js';

import { sendSuccessResponse } from '../../utils/authUtils/sendSuccessResponse.js';
import {
  clearAccessTokenCookie,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from '../../utils/authUtils/cookieConfig.js';
import { createError } from '../../utils/errorHandling.js';

import { getCurrencyId } from '../../utils/currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../fintrack_api/config/fintrackConfig.js';

// Role given to every new account; the application decides the name, only its id is read
// from the catalog.
const DEFAULT_USER_ROLE = 'user';

export const signUpUser = async (req, res, next) => {
  console.log(pc.blueBright('signUpUser'));
  const client = await pool.connect();
  try {
    // From the middleware's output, not req.body: signUpSchema proves these are present and
    // well formed, and is where any transform lands.
    const { username, user_firstname, user_lastname, email, currency, timezone } =
      req.validatedData;
    // Configured accounting currency, not a literal: a hardcoded code and id would be
    // independent defaults that agree only because seed 005 pairs them.
    const currency_code = currency ?? ACCOUNTING_CURRENCY_CODE;

    // Normalization is a write-path rule, not a request-format rule, so it lives here: the
    // email folds case, the username keeps it as a display name.
    const normalizedUsername = username.trim();
    const normalizedEmail = email.toLowerCase();

    let hashedPassword = await hashed(req.validatedData.password);
    req.validatedData.password = undefined;
    req.body.password = undefined;

    const newUserId = uuidv4();
    // The id is derived from the code the response returns, so the row and the client can
    // never name two different currencies. Resolved before BEGIN: a throw here would reach a
    // catch whose ROLLBACK has no transaction to close.
    let currencyId;
    try {
      currencyId = await getCurrencyId(client, currency_code);
    } catch {
      return next(createError(400, `Currency ${currency_code} is not supported`));
    }

    console.log('🚀 ~ signUpUser ~ currencyId:', currencyId);

    // The catalog resolves the id: user_role_id is nullable, so a blind write could land NULL and
    // sign-in's INNER JOIN would refuse a valid credential. Read before BEGIN, as ROLLBACK needs one.
    const roleResult = await client.query(
      'SELECT user_role_id FROM user_roles WHERE user_role_name = $1',
      [DEFAULT_USER_ROLE],
    );
    if (roleResult.rows.length === 0) {
      return next(createError(500, 'Role catalog is not initialized'));
    }
    const userRoleId = roleResult.rows[0].user_role_id;

    // Opens after the hash: hundreds of milliseconds of CPU work would pin a pooled connection for nothing.
    await client.query('BEGIN');

    const userData = await client.query({
      text: `
      INSERT INTO users(user_id, username,email,password_hashed,user_firstname,user_lastname, currency_id, user_role_id, timezone) VALUES ($1, $2, $3,$4,$5, $6, $7, $8, COALESCE($9, 'UTC'))
      RETURNING user_id, username, email, user_firstname, user_lastname, currency_id, user_role_id, timezone;`,
      values: [
        newUserId,
        normalizedUsername,
        normalizedEmail,
        hashedPassword,
        user_firstname,
        user_lastname,
        currencyId,
        userRoleId,
        // COALESCE, not the column default: a parameter left out of VALUES is not the same
        // as one bound to null, and null breaks the NOT NULL.
        timezone ?? null,
      ],
    });
    hashedPassword = undefined;
    const newUser = userData.rows[0];

    // The role name the id was resolved from: RETURNING cannot join user_roles, so the row
    // carries only the id.
    const accessToken = createToken(newUser.user_id, DEFAULT_USER_ROLE);

    const refreshToken = createRefreshToken(newUser.user_id);

    const refreshTokenExpiry = refreshTokenExpiryFrom();

    await client.query(
      `INSERT INTO refresh_tokens(user_id, token, expiration_date, user_agent, ip_address) VALUES($1,$2,$3,$4,$5) RETURNING token_id`,
      [
        newUser.user_id,
        hashToken(refreshToken),
        refreshTokenExpiry,
        req.headers['user-agent'],
        req.ip,
      ],
    );
    console.log('🚀 ~ signUpUser ~ newUser:', newUser);

    req.body.password = undefined;

    // Commits before the cookie and the body: nothing reaches the client until the user is durable.
    await client.query('COMMIT');

    setRefreshTokenCookie(res, refreshToken);

    const userResponseData = {
      user_id: newUser.user_id,
      username: newUser.username,
      email: newUser.email,
      user_firstname: newUser.user_firstname,
      user_lastname: newUser.user_lastname,
      currency: currency_code,
      timezone: newUser.timezone,
      role: DEFAULT_USER_ROLE,
    };

    res.status(201).json({
      message: 'User successfully registered',
      accessToken: accessToken,
      user: userResponseData,
      expiresIn: 3600, // 1 hour in seconds, matching createToken
    });
  } catch (error) {
    await client.query('ROLLBACK');

    // 23505 is the unique violation: the caller's duplicate, not a server fault, and
    // error.message would publish the index name.
    if (error.code === '23505') {
      // Two constraint names cover the email: the plain UNIQUE and the case-folded index
      // from migration 025.
      const emailConstraints = ['users_email_key', 'users_email_lower_key'];
      const duplicate = emailConstraints.includes(error.constraint)
        ? 'Email already exists. Login with sign in button'
        : 'Username already exists.Try Sign in';
      return next(createError(409, duplicate));
    }

    console.log(pc.red('Sign-up error:'), error);
    next(createError(500, 'internal signup error'));
  } finally {
    client.release();
  }
};
export const signInUser = async (req, res, next) => {
  console.log(pc.greenBright('signInUser'));
  // From the middleware's output: signInSchema proves both are present, trims the identity
  // and folds in the email and username keys a client deployed behind this backend may
  // still send.
  const { identity, password } = req.validatedData;

  // No transaction: one read and one write, each already atomic. A BEGIN here would leak on
  // the 401 path, whose return skips the catch and leaves the connection in transaction.
  try {
    // An email is the only identity that can carry '@', so the string itself decides the
    // column. The column name is one of two literals, never the typed value.
    const identityColumn = identity.includes('@') ? 'u.email' : 'u.username';

    const userData = await pool
      .query({
        text: `SELECT u.username, u.email, u.password_hashed, u.user_id, u.user_firstname, u.user_lastname, u.user_contact, u.user_role_id, u.timezone, u.token_version,
        ur.user_role_name,
        ct.currency_code as currency
        FROM users u
        JOIN user_roles ur ON u.user_role_id = ur.user_role_id
        JOIN currencies ct ON u.currency_id = ct.currency_id
        -- Folded on both sides: whoever registered a name with a capital still
        -- signs in with it typed any other way.
        WHERE lower(${identityColumn}) = lower($1)`,
        values: [identity],
      })
      .then((res) => res.rows);

    const user = userData[0];

    // The hash is compared even when no row came back, and every failure gets the same
    // answer, so neither the message nor the response time tells an anonymous caller whether
    // that identity is registered.
    const isPasswordCorrect = await isRight(
      password,
      user ? user.password_hashed : await getDecoyHash(),
    );

    if (!user || !isPasswordCorrect) {
      console.warn('not authenticated:', 'invalid credentials');
      return next(createError(401, 'Invalid credentials'));
    }

    const accessToken = createToken(
      user.user_id,
      user.user_role_name,
      user.token_version,
    );

    const refreshToken = createRefreshToken(user.user_id);

    // The row and the signature must declare the same lifetime, hence one constant.
    const refreshTokenExpirationDate = refreshTokenExpiryFrom();

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expiration_date, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5) RETURNING token_id',
      [
        user.user_id,
        hashToken(refreshToken),
        refreshTokenExpirationDate,
        req.headers['user-agent'],
        req.ip,
      ],
    );
    req.body.password = undefined;
    user.password_hashed = undefined;

    setRefreshTokenCookie(res, refreshToken);

    const userResponseData = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      user_firstname: user.user_firstname,
      user_lastname: user.user_lastname,
      // The column is user_role_name; the contract key is `role`, as validate-session
      // already returns, so both endpoints name it the same.
      role: user.user_role_name,
      currency: user.currency,
      user_contact: user.user_contact,
      timezone: user.timezone,
    };

    res.status(200).json({
      message: 'Login successful',
      accessToken: accessToken,
      user: userResponseData,
      expiresIn: 3600, // 1 hour in seconds, matching createToken
    });

    console.log(
      'User is logged in',
      user.username,
    );
  } catch (error) {
    console.log('Sign-in error:', error);
    next(createError(500, 'internal sign-in user error'));
  }
};

// Sign-out with token revocation.
export const signOutUser = async (req, res, next) => {
  console.log(pc.yellow('signOutUser'));
  // Cookie only, no body fallback: this route has no auth middleware, so a token string
  // named in the JSON body could revoke someone else's session. The cookie is httpOnly and
  // unreadable from script.
  const refreshTokenFromClient = req.cookies.refreshToken;

  // The signature, not just presence, decides whose session this is: it proves the caller
  // holds a token this server issued, and it is the only source of userId here, since this
  // route runs unauthenticated.
  let ownerId = null;
  if (refreshTokenFromClient) {
    try {
      const decoded = jwt.verify(
        refreshTokenFromClient,
        process.env.JWT_REFRESH_TOKEN_SECRET,
        { issuer: process.env.JWT_ISSUER || 'fintrack app' },
      );
      if (decoded?.type === 'refresh_token' && decoded?.userId) {
        ownerId = decoded.userId;
      }
    } catch (verifyError) {
      console.warn(
        pc.yellow('signOutUser: refresh token failed verification, clearing cookies only'),
      );
    }
  }

  try {
    let revokeSuccess = false;
    let revokeMessage = `No refresh token provided for revocation`;

    if (refreshTokenFromClient && ownerId) {
      try {
        const result = await pool.query(
          `UPDATE refresh_tokens
         SET revoked = TRUE
         WHERE token = $1 AND user_id = $2`,
          [hashToken(refreshTokenFromClient), ownerId],
        );
        revokeSuccess = result.rowCount > 0;

        revokeMessage = revokeSuccess
          ? 'Refresh token successfully revoked'
          : 'Refresh token not found for revocation';
        console.log(pc.yellow(revokeMessage));
      } catch (revokeError) {
        console.error('Error revoking token:', revokeError);
        revokeMessage = 'Error during token revocation';
      }
    }
    clearRefreshTokenCookie(res);
    clearAccessTokenCookie(res);

    if (revokeSuccess) {
      sendSuccessResponse(res, 200, 'Logged out successfully. Token revoked.');
      console.log('Logged out successfully. Token revoked.');
    } else if (refreshTokenFromClient) {
      const message =
        'Logged out with issues: ' +
        revokeMessage +
        '. Please login again to ensure security.';

      console.warn(message);

      sendSuccessResponse(res, 200, message);
    } else {
      const message =
        'Logged out successfully. No active session found to revoke.';
      console.error(message);
      sendSuccessResponse(res, 200, message);
    }
  } catch (error) {
    console.error(pc.red('Error during logout:', error));

    // Clear the cookies even on error.
    clearRefreshTokenCookie(res);
    clearAccessTokenCookie(res);
    const message =
      'Logged out with some technical issues. Please login again to ensure complete security.';
    sendSuccessResponse(res, 200, message);
  }
};

export const validateSession = async (req, res, next) => {
  try {
    const { userId } = req.user;
    console.log('🚀 ~ validateSession ~ userId:', userId);

    const userDataResult = await pool.query({
      text: `SELECT u.user_id, u.username, u.email, u.user_firstname, u.user_contact, u.user_lastname,
      u.user_contact, u.timezone, ct.currency_code as currency,
      ur.user_role_name as role
      FROM users u
      JOIN currencies ct ON ct.currency_id = u.currency_id
      JOIN user_roles ur ON ur.user_role_id = u.user_role_id
      WHERE u.user_id = $1`,
      values: [userId],
    });

    const userData = userDataResult.rows[0];

    if (!userData) {
      return next(createError(404, 'Session invalid: user not found'));
    }

    console.log(
      `✅ Session validated for user: ${userId} ${userData.user_firstname}`,
    );

    res.status(200).json({
      message: 'Session validated successfully',
      user: userData,
    });
  } catch (error) {
    console.error('❌Error validating session');
    next(createError(500, 'Error validating session'));
  }
};

// JWT authentication and role-based authorization middleware.

import jwt from 'jsonwebtoken';
import { createError } from '../../utils/errorHandling.js';
import { pool } from '../../db/config/configDB.js';
import {
  clearAccessTokenCookie,
  clearRefreshTokenCookie,
} from '../../utils/authUtils/cookieConfig.js';
import { ACCEPTED_ORIGINS } from '../../utils/authUtils/acceptedOrigins.js';

const ROLE_LEVELS = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

// 401, not 403: these are failures to identify the caller and a fresh token fixes
// them; 403 is reserved for an identified caller who is refused.
const TOKEN_ERRORS = {
  TokenExpiredError: { message: 'Token expired.', status: 401 },
  JsonWebTokenError: { message: 'Invalid token.', status: 401 },
  NotBeforeError: { message: 'Token not yet active.', status: 401 },
};

export const clearAccessTokenFromCookie = (res) => {
  clearAccessTokenCookie(res);
};

export const clearRefreshTokenFromCookie = (res) => {
  clearRefreshTokenCookie(res);
};

export const getAuthToken = (req) => {
  // The Authorization header wins over the cookie.
  const authHeader =
    req.headers['authorization'] || req.headers['Authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return token;
  }

  // Cookie fallback for the web app.
  if (req.cookies.accessToken) {
    console.log('✅ Token found in cookies');
    return req.cookies.accessToken;
  }

  console.log('❌ No token provided in headers or cookies');
  return null;
};

const verifyJWTToken = async (token) => {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Invalid token format');
  }
  const decoded = await new Promise((resolve, reject) => {
    // The issuer pin is an extra guard, not the whole check (see the type check below).
    jwt.verify(
      token,
      process.env.JWT_SECRET,
      { issuer: process.env.JWT_ISSUER || 'fintrack app' },
      (err, payload) => {
        if (err) reject(err);
        else resolve(payload);
      },
    );
  });

  // createToken signs { type: 'access_token' }; this is what keeps a refresh
  // token out of endpoints guarded by verifyToken/verifyUser.
  if (decoded.type !== 'access_token') {
    throw new jwt.JsonWebTokenError('Wrong token type');
  }

  // Access tokens (1h expiry) have no blocklist, so token_version is the
  // revocation channel: changePassword bumps users.token_version and tokens
  // signed with the old value fail here.
  const { rows } = await pool.query(
    'SELECT token_version FROM users WHERE user_id = $1',
    [decoded.userId],
  );

  if (rows.length === 0 || rows[0].token_version !== decoded.tv) {
    throw new jwt.JsonWebTokenError('Token has been invalidated');
  }

  return decoded;
};

// CSRF guard for the cookie-authenticated routes (refresh-token, sign-out): their cookie is sameSite
// 'none' in production, so any site's request carries it, and CORS does not stop a request from running.
// A missing Origin passes, as in app.js's cors(): browsers always send Origin on credentialed POSTs.
export const verifyOriginForCookieAuth = (req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || ACCEPTED_ORIGINS.includes(origin)) {
    return next();
  }

  console.error('CSRF guard: origin not allowed', origin);
  return next(createError(403, 'Request origin not allowed.'));
};

const handleTokenError = (error, req, res) => {
  const errorConfig = TOKEN_ERRORS[error.name] || {
    message: 'Invalid token. Please sign in again.',
    status: 401,
  };

  // Clear the cookie when an expired token came from it.
  if (error.name === 'TokenExpiredError' && req.cookies?.accessToken) {
    clearAccessTokenFromCookie(res);
  }

  console.error('TOKEN VERIFICATION ERROR:', error.name, errorConfig.message);
  return createError(errorConfig.status, errorConfig.message);
};

// Authentication only: sets req.user, with no ownership or role check.
export const verifyToken = async (req, res, next) => {
  console.log('verifyToken');
  try {
    const token = getAuthToken(req);

    if (!token) {
      console.error('Error when verifying token');
      return next(
        createError(
          401,
          'Access Unauthenticated. No token provided. Please sign in.',
        ),
      );
    }
    const decoded = await verifyJWTToken(token);
    req.user = decoded;
    console.log('Token successfully verified for req.user:');
    next();
  } catch (error) {
    return next(handleTokenError(error, req, res));
  }
};
// Authenticates if req.user is missing, then allows the owner of the account in
// req.params (targetAccountId or id), a caller whose role outranks the owner's,
// or a super_admin.
export const verifyUser = async (req, res, next) => {
  if (!req.user) {
    const token = getAuthToken(req);
    if (!token) return next(createError(401, 'Authentication required.'));

    try {
      req.user = await verifyJWTToken(token);
    } catch (err) {
      return next(handleTokenError(err, req, res));
    }
  }

  const { userId: authId, role: authRole } = req.user;
  console.log('DEBUG: Verificando userId:', authId, 'user role:', authRole);

  const targetAccountId = req.params.targetAccountId || req.params.id;

  if (!targetAccountId)
    return next(
      createError(500, 'Developer Error: targetAccountId missing in params.'),
    );

  try {
    const query = `
      SELECT u.user_id, ur.user_role_name FROM user_accounts acc 
      JOIN users u ON acc.user_id = u.user_id
      JOIN user_roles ur ON u.user_role_id=ur.user_role_id
      WHERE acc.account_id = $1`;

    const result = await pool.query(query, [targetAccountId]);

    if (result.rows.length === 0)
      return next(
        createError(
          404,
          'The account you are trying to access does not exist.',
        ),
      );

    const { user_id: ownerId, user_role_name: ownerRole } = result.rows[0];

    const isOwner = authId === ownerId;
    const hasAuthority = ROLE_LEVELS[authRole] > ROLE_LEVELS[ownerRole];
    const isSuperAdmin = authRole === 'super_admin';

    if (isOwner || hasAuthority || isSuperAdmin) return next();

    return next(
      createError(
        403,
        'Unauthorized: You do not have authority over this resource.',
      ),
    );
  } catch (err) {
    console.error('❌ Auth Error Detail:', err.message);
    return next(createError(500, 'Database error during authorization.'));
  }
};


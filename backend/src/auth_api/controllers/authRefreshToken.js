import jwt from 'jsonwebtoken';
import {
  createToken,
  hashToken,
  rotateRefreshToken,
} from '../../utils/authUtils/authFn.js';
import { createError } from '../../utils/errorHandling.js';

import { setRefreshTokenCookie } from '../../utils/authUtils/cookieConfig.js';

import { pool } from '../../db/config/configDB.js';
import pc from 'picocolors';

// Issues a new access token from the refresh-token cookie, rotating the refresh token when
// little life remains.
export const authRefreshToken = async (req, res, next) => {
  console.log(pc.green('🔄 authRefreshToken called'));

  try {
    const refreshTokenFromClient = req.cookies.refreshToken;

    if (!refreshTokenFromClient) {
      return next(createError(401, 'Refresh token is required'));
    }
    const decoded = jwt.verify(
      refreshTokenFromClient,
      process.env.JWT_REFRESH_TOKEN_SECRET,
      { issuer: process.env.JWT_ISSUER || 'fintrack app' },
    );
    const userId = decoded?.userId;

    if (!userId) {
      return next(createError(403, 'Invalid refresh token signature.'));
    }

    // createRefreshToken signs { type: 'refresh_token' }. The stored row has no type of its
    // own, so without this check an access token that verified under this secret (it cannot
    // while the two secrets differ) would read as a refresh token.
    if (decoded.type !== 'refresh_token') {
      return next(createError(403, 'Wrong token type.'));
    }

    const refreshTokenResult = await pool.query(
      `SELECT * FROM refresh_tokens
       WHERE token = $1 AND user_id = $2 AND revoked = FALSE AND expiration_date > NOW()`,
      [hashToken(refreshTokenFromClient), userId],
    );

    const storedRefreshToken = refreshTokenResult.rows[0];

    if (!storedRefreshToken) {
      return next(createError(401, 'Invalid or expired refresh token'));
    }

    const userResult = await pool.query(
      `SELECT
   u.user_id, u.username, u.email, u.user_role_id, u.token_version,
   ur.user_role_name
  FROM  users u
  JOIN user_roles ur
  ON u.user_role_id = ur.user_role_id
  WHERE user_id = $1 `,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user) {
      return next(createError(404, 'User not found.'));
    }

    const newAccessToken = createToken(
      user.user_id,
      user.user_role_name,
      user.token_version,
    );

    const currentRefreshTokenExpiry = decoded.exp * 1000;
    const now = Date.now();
    const remainingTime = currentRefreshTokenExpiry - now;
    const totalLifetime = (decoded.exp - decoded.iat) * 1000;

    // Rotate when under 10% of the lifetime remains (an arbitrary threshold). totalLifetime is
    // already in milliseconds: scaling it again would make the test always true and insert a
    // row on every refresh.
    const limitRemLife = totalLifetime / 10;

    let newRefreshToken = refreshTokenFromClient;
    let shouldSetNewCookie = false;

    if (remainingTime < limitRemLife) {
      console.log(pc.yellow('🔄 Rotating refresh token (low remaining life)'));

      newRefreshToken = await rotateRefreshToken(
        refreshTokenFromClient,
        userId,
        req,
      );
      shouldSetNewCookie = true;
    }

    if (shouldSetNewCookie) {
      setRefreshTokenCookie(res, newRefreshToken);
    }

    res.json({
      message: 'Access token refreshed successfully',
      accessToken: newAccessToken,
      expiresIn: 3600, // 1 hour in seconds, matching createToken
    });
  } catch (error) {
    console.log(pc.red('❌ authRefreshToken error:'), error.message);

    if (error.name === 'TokenExpiredError') {
      return next(
        createError(401, 'Refresh token expired. Please login again.'),
      );
    } else if (error.name === 'JsonWebTokenError') {
      return next(createError(403, 'Invalid refresh token.'));
    }
    next(createError(500, 'Internal server error during token refresh'));
  }
};

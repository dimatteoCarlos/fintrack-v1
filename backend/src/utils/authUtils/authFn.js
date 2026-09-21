import bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';

const salt = Number(process.env.SALT_ROUNDS);

// refresh_tokens stores this digest, not the signed JWT, so a table read yields no usable credential.
// SHA-256, not bcrypt: the token is already high-entropy and hashed on every refresh, so bcrypt's
// slowness would only tax requests.
export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

// The single refresh-token lifetime. The signature, the row the refresh endpoint
// checks and the cookie must all agree on it, or the shortest silently wins.
export const REFRESH_TOKEN_DAYS = 7;
export const REFRESH_TOKEN_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

// Adds the lifetime to a date, without mutating the one passed in.
export const refreshTokenExpiryFrom = (from = new Date()) =>
  new Date(from.getTime() + REFRESH_TOKEN_MS);

export const hashed = async (word) => {
  const salted = await bcrypt.genSalt(salt);
  const hashedWord = await bcrypt.hash(word, salted);
  return hashedWord;
};

export const isRight = async (userPwd, hashedPwd) => {
  try {
    const isRightPwd = await bcrypt.compare(userPwd, hashedPwd);
    return isRightPwd;
  } catch (error) {
    process.env.NODE_ENV === 'development'
      ? console.error(error, 'error message comparing password')
      : console.error('error:', 'something went error');
    // A failed comparison is a mismatch, never an undefined result.
    return false;
  }
};

// A hash of a random secret nobody can type, compared when a sign-in attempt
// names an identity that does not exist. Without it the attempt returns without
// ever calling bcrypt, and its speed says the account is not registered.
let decoyHashPromise = null;

export const getDecoyHash = () => {
  if (!decoyHashPromise) {
    decoyHashPromise = hashed(randomUUID());
  }
  return decoyHashPromise;
};

export const createToken = (id, role, tokenVersion) => {
  if (!id) {
    throw new Error('the user id is required to generate the token.');
  }

  if (!role) {
    throw new Error('the user role is required to generate the token.');
  }

  // Stamped so a password change invalidates issued tokens: changePassword bumps
  // users.token_version and verifyJWTToken rejects a mismatched tv. An omitted tv
  // is 0, matching only accounts that never changed their password.
  const tv = tokenVersion ?? 0;

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  // One hour in every environment.
  const expiresIn = '1h';

  // expiresIn here and the cookie's maxAge must stay in sync.
  return jwt.sign(
    {
      userId: id,
      type: 'access_token',
      role,
      tv,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    {
      expiresIn,
      issuer: process.env.JWT_ISSUER || 'fintrack app',
    },
  );
};

export const createRefreshToken = (id) => {
  if (!id) {
    throw new Error('the user id is required to generate the token.');
  }

  if (!process.env.JWT_REFRESH_TOKEN_SECRET) {
    throw new Error(
      'JWT_REFRESH_TOKEN_SECRET is not configured in the environment variables.',
    );
  }
  // Same lifetime the row and the cookie carry; the refresh endpoint filters on
  // the row, not the signature, so a longer signature lifetime is unreachable.
  const expiresIn = `${REFRESH_TOKEN_DAYS}d`;

  return jwt.sign(
    // jti keeps two tokens minted in the same second (iat resolution) from being
    // byte-identical, which refresh_tokens.token UNIQUE would reject as a second sign-in.
    {
      userId: id,
      type: 'refresh_token',
      jti: randomUUID(),
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_REFRESH_TOKEN_SECRET,
    {
      expiresIn,
      // Same fallback literal as createToken's issuer: if they diverged, the
      // first issuer check added to either verifier would reject every token
      // signed by the other function.
      issuer: process.env.JWT_ISSUER || 'fintrack app',
    },
  );
};

export async function cleanRevokedTokens() {
  try {
    await pool.query('SELECT 1');

    // Only revoked or expired rows go: an idle cutoff on updated_at would sign out
    // live sessions, since updated_at rotates only when the refresh token is used
    // and a session idle over a day (REFRESH_TOKEN_DAYS is 7) would lose its row.
    const result = await pool.query(
      'DELETE FROM refresh_tokens WHERE revoked = TRUE OR expiration_date <= NOW()',
    );

    console.log(
      pc.greenBright(
        `Limpieza de tokens revocados al inicio: ${result.rowCount} tokens eliminados.`,
      ),
    );
  } catch (error) {
    console.error(
      pc.redBright(
        'Error durante la limpieza inicial de tokens revocados:',
        error,
      ),
    );
  }
}
export const rotateRefreshToken = async (oldToken, userId, req) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const revokeResult = await client.query(
      `UPDATE refresh_tokens
       SET revoked = TRUE, updated_at = NOW()
       WHERE token = $1 AND user_id = $2`,
      [hashToken(oldToken), userId],
    );

    if (revokeResult.rowCount === 0) {
      throw new Error('Old refresh token not found for revocation');
    }

    const newRefreshToken = createRefreshToken(userId);

    const expirationDate = refreshTokenExpiryFrom();

    await client.query(
      `INSERT INTO refresh_tokens 
       (user_id, token, expiration_date, user_agent, ip_address) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        hashToken(newRefreshToken),
        expirationDate,
        req.headers['user-agent'],
        req.ip,
      ],
    );
    await client.query('COMMIT');

    console.log('🔄 Refresh token rotated successfully');

    // The caller cookies this plaintext value; the row above stores its hash.
    return newRefreshToken;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error rotating refresh token:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const revokeAllUserRefreshTokens = async (
  userId,
  clientOrPool = pool,
) => {
  try {
    const dbClient = clientOrPool ?? pool;
    console.log('Entering revocation of all refresh tokens');

    const revokeResult = await dbClient.query(
      `UPDATE refresh_tokens 
    SET revoked = TRUE, updated_at = NOW() 
    WHERE revoked = $1 AND user_id = $2`,
      [false, userId],
    );

    console.log('revoke all refresh tokens:', revokeResult.rows);
  } catch (error) {
    console.error('Error revoking refresh tokens:', error.message);
    throw error;
  }
};

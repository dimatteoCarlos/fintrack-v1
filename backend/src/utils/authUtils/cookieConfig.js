import pc from 'picocolors';
import { REFRESH_TOKEN_MS } from './authFn.js';

export const getCookieOptions = (type = 'set') => {
  const isProduction = process.env.NODE_ENV === 'production';
  const baseOptions = {
   httpOnly: true,
   secure: isProduction,
   sameSite: isProduction ? 'none' : 'lax',
   path: '/api',
  };

  if (type === 'clear') {
    // The attributes must match those the cookie was set with. maxAge is left out
    // on purpose: clearCookie expires the cookie, never renews it.
    return { ...baseOptions };
  }

  // Without maxAge the browser treats this as a session cookie and drops it when
  // it closes, even though the token inside stays valid for days. Same lifetime
  // the signature and the refresh_tokens row carry.
  return { ...baseOptions, maxAge: REFRESH_TOKEN_MS };
};

export const setRefreshTokenCookie = (res, refreshToken) => {

  res.cookie('refreshToken', refreshToken, getCookieOptions('set'));

  console.log(pc.green('🍪 Refresh token cookie set successfully.'));
};

export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', getCookieOptions('clear'));
  console.log(pc.yellow('🗑️ Refresh token cookie cleared.'));
};

// Currently unused: reserved for an access-token cookie.
export const clearAccessTokenCookie = (res) => {
  res.clearCookie('accessToken', getCookieOptions('clear'));
  console.log(pc.yellow('🗑️ Access token cookie cleared.'));
};

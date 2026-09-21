import axios from 'axios';
import { url_refreshToken } from '../../urlConfig';
import { invalidateSession } from './invalidateSession';

// Shared by all concurrent callers so only one refresh request is in flight.
let refreshPromise: Promise<string> | null = null;

/**
 * Gets a fresh access token; concurrent calls share one request (single-flight).
 * Never navigates or shows UI.
 * @throws when the refresh fails (network, rejected refresh token, etc.)
 */
export const getRefreshedToken = async (): Promise<string> => {
  console.log('[RefreshManager] ;getRefreshedToken called');

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        // Authenticated by the refresh cookie; no token is passed manually.
        const response = await axios.post(url_refreshToken, null, {
          withCredentials: true,
          timeout: 10000,
        });

        const newAccessToken = response.data?.accessToken;

        if (!newAccessToken) {
          throw new Error('No access token in refresh response');
        }

        sessionStorage.setItem('accessToken', newAccessToken);

        // A successful refresh makes any saved returnTo stale.
        sessionStorage.removeItem('returnTo');

        return newAccessToken;
      } catch (error) {
        // Only a rejected or expired refresh token makes the session
        // irrecoverable; a timeout, 5xx or network error is transient and the
        // caller may retry.
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        if (status === 401 || status === 403) {
          // Saved so the user can be redirected back after login.
          const currentPath =
            window.location.pathname + window.location.search;
          sessionStorage.setItem('returnTo', currentPath);

          // Clears storage and store but keeps the remembered identity.
          invalidateSession('expired');
        }

        throw error;
      } finally {
        // Reset so the next refresh (e.g. after login) starts a new request.
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
};

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getRefreshedToken } from './authRefreshManager';

/**
 * Makes an authenticated request. On 401 it refreshes the token once (shared
 * across concurrent calls by the refresh manager) and retries. It never
 * navigates or shows UI; a failed refresh is left to ProtectedRoute.
 */
export const authFetch = async <T>(
  url: string,
  options: AxiosRequestConfig = {},
): Promise<AxiosResponse<T>> => {
  const accessToken = sessionStorage.getItem('accessToken');

  const requestConfig: AxiosRequestConfig & { _retry?: boolean } = {
    ...options,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
  };

  try {
    const response = await axios<T>(url, requestConfig);
    return response;
  } catch (error) {
    // Retry once, on 401 only, and never for sign-in/sign-up: they carry no token.
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !requestConfig._retry &&
      !url.includes('/sign-in') &&
      !url.includes('/sign-up')
    ) {
      requestConfig._retry = true;

      try {
        const newToken = await getRefreshedToken();

        const retryConfig = {
          ...requestConfig,
          headers: {
            ...requestConfig.headers,
            Authorization: `Bearer ${newToken}`,
          },
        };

        const retryResponse = await axios<T>(url, retryConfig);
        return retryResponse;
      } catch (refreshError) {
        // The log has no cookie check: refreshToken is httpOnly, so
        // document.cookie can never see it.
        console.error('🚨 Refresh failed:', {
          error: refreshError,
          url,
        });

        return Promise.reject(refreshError);
      }
    }

    throw error;
  }
};

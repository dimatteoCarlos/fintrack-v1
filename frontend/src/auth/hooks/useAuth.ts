// Auth service hook: single source of truth for sign-in/up/out, password change and profile update.
import { useEffect } from 'react';
import axios from 'axios';

import { useAuthStore } from '../stores/useAuthStore';
import { authFetch } from '../auth_utils/authFetch';
import { getRefreshedToken } from '../auth_utils/authRefreshManager';

import {
  AuthSuccessResponseType,
  ChangePasswordResponseType,
  ChangePasswordResultType,
  ProfileUpdatePayloadType,
  ProfileUpdateResponseType,
  SignInCredentialsType,
  SignInResponseType,
  SignUpCredentialsType,
  SignUpPayloadType,
  UserDataType,
  UserIdentityType,
  UserResponseDataType,
} from '../types/authTypes';

import {
  url_signin,
  url_signup,
  url_signout,
  url_update_user,
  url_change_password,
  url_validate_session,
} from '../../urlConfig';
import {
  clearIdentity,
  saveIdentity,
} from '../auth_utils/localStorageHandle/authStorage';
import { detectTimeZone } from '../auth_utils/detectTimeZone';
import { safeMergeUser } from '../auth_utils/safeMergeUser';
import { invalidateSession } from '../auth_utils/invalidateSession';
import { logoutCleanup } from '../auth_utils/logoutCleanup';

const mapUserResponseToUserData = (
  user: UserResponseDataType,
): UserDataType => ({
  user_id: user.user_id,
  username: user.username,
  user_firstname: user.user_firstname,
  user_lastname: user.user_lastname,
  email: user.email,
  currency: user.currency,
  role: user.role,
  contact: user.user_contact,
  timezone: user.timezone,
});

// Wait shown to a rate-limited caller; rounded up to whole minutes past a minute,
// since a per-second countdown on a long lockout invites watching over leaving.
const formatRetryAfter = (seconds: number): string => {
  const safe = Math.max(0, Math.ceil(seconds));

  if (safe < 60) {
    return `You can try again in ${safe} second${safe === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(safe / 60);

  return `You can try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

const extractErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data as Record<string, unknown>;
    // Must precede the generic message branch, which would drop the wait. The 429
    // body carries the seconds actually left (from the limiter's reset time); a
    // user not told how long retries and extends the lockout.
    if (err.response.status === 429) {
      const served =
        typeof data?.message === 'string' ? data.message : 'Too many attempts.';

      return typeof data?.retryAfter === 'number'
        ? `${served} ${formatRetryAfter(data.retryAfter)}`
        : served;
    }

    // The backend message wins over the status-code defaults below.
    if (data?.message && typeof data.message === 'string') {
      return data.message;
    }

    if (err.response.status === 401) {
      return 'Invalid credentials';
    }
    if (err.response.status === 400) {
      return 'Invalid input data';
    }
  }

  if (axios.isAxiosError(err) && !err.response) {
    return 'Network error. Please check your connection.';
  }

  if (err instanceof Error) {
    return err.message;
  }

  return 'An unexpected error occurred';
};

/**
 * `fieldErrors` is present only on a 400 validation failure, keyed by the form's
 * own field names so each message can attach to its input.
 */
export type SignInResultType = {
 success: boolean;
 error?: string;
 fieldErrors?: Record<string, string[]>;
};

/**
 * Only a 400 carries field errors. A 401 (wrong password or unknown account) gets a
 * single form-level message on purpose: attaching it to a field would tell an
 * anonymous caller which half of the pair was wrong.
 */
const extractSignInFieldErrors = (
 err: unknown,
): Record<string, string[]> | undefined => {
 if (!axios.isAxiosError(err) || err.response?.status !== 400) return undefined;

 const data = err.response.data as
  | { fieldErrors?: unknown; details?: { fieldErrors?: unknown } }
  | undefined;

 // `details` is the legacy envelope some endpoints still answer with.
 const fieldErrors = data?.fieldErrors ?? data?.details?.fieldErrors;

 if (!fieldErrors || typeof fieldErrors !== 'object') return undefined;

 return fieldErrors as Record<string, string[]>;
};

const useAuth = () => {
  const {
    isLoading,
    setIsLoading,
    isCheckingAuth,
    setIsCheckingAuth,
    isAuthenticated,
    setIsAuthenticated,
    userData,
    setUserData,
    error,
    setError,
    clearError,
    successMessage,
    setSuccessMessage,
    clearSuccessMessage,
    sessionExpired,
  } = useAuthStore();

  useEffect(() => {
    let isMounted = true;

    const checkAuthStatus = async () => {
      let accessToken = sessionStorage.getItem('accessToken');

      if (!accessToken) {
        try {
          // No token in this tab: try the refresh cookie once (new tab or reopened
          // browser within the 7-day refresh window)
          accessToken = await getRefreshedToken();
        } catch {
          // Ungated on isMounted because authRefreshManager.ts writes 'returnTo' ungated too; under
          // StrictMode's double-invoke, gating would leave it for AuthPage's fallback effect, which
          // would show "session expired" to an anonymous visitor.
          sessionStorage.removeItem('returnTo');
          if (isMounted) {
            // No cookie, or it is spent: an anonymous visitor, not an expired
            // session, so no 'expired' reason
            invalidateSession();
            setIsCheckingAuth(false);
          }
          return;
        }
      }

      if (accessToken && !isAuthenticated) {
        try {
          const response = await authFetch<AuthSuccessResponseType>(
            url_validate_session,
            { method: 'GET' },
          );
          if (isMounted && response.data?.user) {
            const transformedUser = mapUserResponseToUserData(
              response.data.user,
            );

            const currentUserData = useAuthStore.getState().userData;

            const mergedUser = safeMergeUser(currentUserData, transformedUser);

            setUserData(mergedUser);
            setIsAuthenticated(true);
            console.log('✅ Session restored successfully');
          }
        } catch (error) {
          if (isMounted) {
            console.warn('🔍 Session hydration failed');
            invalidateSession('expired');
          }
        }
      }
      if (isMounted) setIsCheckingAuth(false);
    };

    checkAuthStatus();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // boot check runs once, on mount — Zustand setters are stable references

  /** Signs in and updates auth state; never navigates or shows toasts/modals (the UI layer does). */
  const handleSignIn = async (
    credentials: SignInCredentialsType,
    rememberMe: boolean,
  ): Promise<SignInResultType> => {
    clearError();
    setIsLoading(true);
    clearSuccessMessage();

    try {
      const response = await authFetch<SignInResponseType>(url_signin, {
        method: 'POST',
        data: credentials,
      });

      const { accessToken, user, message, expiresIn } = response.data;

      const userFromSignIn = response.data?.user || user;

      if (!accessToken || !userFromSignIn) {
        const errorMessage = !accessToken
          ? 'Server response missing access token'
          : 'Server response missing user data';
        throw new Error(errorMessage);
      }

      // expiresIn is in seconds; stored as an absolute expiry timestamp in ms
      if (expiresIn) {
        const expiryTime = Date.now() + expiresIn * 1000;
        sessionStorage.setItem('tokenExpiry', expiryTime.toString());
      }

      sessionStorage.setItem('accessToken', accessToken);

      if (rememberMe) {
        const identity: UserIdentityType = {
          identity: credentials.identity,
          rememberMe: true,
        };

        saveIdentity(identity);
      } else {
        clearIdentity();
      }

      const transformedUser = mapUserResponseToUserData(userFromSignIn);

      const currentUserDataStore = useAuthStore.getState().userData;

      const mergedUser = safeMergeUser(currentUserDataStore, transformedUser);
      setUserData(mergedUser);

      setIsAuthenticated(true);
      setSuccessMessage(message || 'Sign in successful! Welcome back!');

      return { success: true };
    } catch (err: unknown) {
      const errorMessage =
        extractErrorMessage(err) ||
        'Login failed. Please check your credentials.';

      // The banner keeps the form-level message; the field map travels beside it
      // so the form can put each message under the input it belongs to.
      const fieldErrors = extractSignInFieldErrors(err);

      setError(errorMessage);
      return { success: false, error: errorMessage, fieldErrors };
    } finally {
      setIsLoading(false);
    }
  };

  /** Registers a new user and updates auth state; never navigates or shows toasts/modals. */
  const handleSignUp = async (
    credentials: SignUpCredentialsType,
  ): Promise<{ success: boolean; error?: string }> => {
    clearError();
    clearSuccessMessage();
    setIsLoading(true);

    try {
      // Attached here and not in the form: the zone is read from the device,
      // not typed by the user, so no sign-up caller has to remember it.
      const payload: SignUpPayloadType = {
        ...credentials,
        timezone: detectTimeZone(),
      };

      const response = await fetch(url_signup, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `HTTP error! status: ${response.status}. Registration failed.`,
        );
      }

      const resData = await response.json();

      if (!resData.user) {
        throw new Error('Server response missing user data');
      }

      if (resData.accessToken) {
        sessionStorage.setItem('accessToken', resData.accessToken);
      }
      const transformedUser = mapUserResponseToUserData(resData.user);

      const currentUserDataStore = useAuthStore.getState().userData;

      const mergedUser = safeMergeUser(currentUserDataStore, transformedUser);
      setUserData(mergedUser);

      setIsAuthenticated(true);
      setSuccessMessage(resData.message || 'Sign up successful!');

      return { success: true };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * User-initiated logout: calls the API, then clears client session data. Automatic
   * expiry is handled by ProtectedRoute; this never navigates or notifies.
   */
  const handleSignOut = async (): Promise<void> => {
    try {
      await authFetch(url_signout, { method: 'POST' });
    } catch (err: unknown) {
      // Log and continue: local cleanup must run even if the server call fails
      console.log('⚠️ Logout API call failed, proceeding with client cleanup');
    } finally {
      logoutCleanup();
    }
  };

  // Single source of truth for changing the password.
  const handleDomainChangePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<ChangePasswordResultType> => {
    try {
      const response = await authFetch<ChangePasswordResponseType>(
        url_change_password,
        {
          method: 'PATCH',
          data: { currentPassword, newPassword, confirmPassword },
        },
      );

      const responseData = response.data;

      if (responseData.success === true) {
        return {
          success: true,
          message: responseData.message || 'Password updated successfully.',
        };
      }
      return {
        success: false,
        error: responseData.error || 'ChangePasswordError',
        message: responseData.message ?? 'Password change failed',
        fieldErrors: responseData.fieldErrors ?? {},
        retryAfter: responseData.retryAfter,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const { status, data } = err.response;
        const errorData = data;

        // 401: token invalid or expired, a real logout (unlike the 403 below)
        if (status === 401) {
          // Remember the page so sign-in can return the user to it
          const currentPath = window.location.pathname + window.location.search;
          sessionStorage.setItem('returnTo', currentPath);

          invalidateSession('expired');

          return {
            success: false,
            error: (errorData?.error as string) || 'SessionExpired',
            message:
              (errorData?.message as string) ||
              'Session expired. Please sign in again.',
          };
        }

        // 403: wrong current password; must not log the user out
        if (status === 403) {
          return {
            success: false,
            error: (errorData?.error as string) || 'InvalidCurrentPassword',
            message:
              (errorData?.message as string) ||
              'Current password is incorrect.',
            fieldErrors: errorData?.fieldErrors as
              | Record<string, string[]>
              | undefined,
          };
        }

        if (status === 429) {
          return {
            success: false,
            error: (errorData?.error as string) || 'RateLimitExceeded',
            message:
              (errorData?.message as string) ||
              'Too many attempts. Please try again later.',
            fieldErrors: errorData?.fieldErrors as Record<string, string[]>,
            retryAfter: errorData?.retryAfter as number,
          };
        }

        if (status === 400) {
          const details = errorData?.details as
            | Record<string, unknown>
            | undefined; // `details` is the legacy envelope
          return {
            success: false,
            error: (errorData?.error as string) || 'ValidationError',
            message: (errorData?.message as string) || 'Invalid input data.',
            fieldErrors:
              (details?.fieldErrors as Record<string, string[]>) ||
              (errorData?.fieldErrors as Record<string, string[]> | undefined),
          };
        }

        return {
          success: false,
          error: (errorData?.error as string) || 'ChangePasswordFailed',
          message:
            (errorData?.message as string) ||
            'Failed to change password due to server error.',
          fieldErrors: errorData?.fieldErrors as
            | Record<string, string[]>
            | undefined,
        };
      }

      if (axios.isAxiosError(err) && !err.response) {
        return {
          success: false,
          error: 'NetworkError',
          message: 'Network error. Please check your connection.',
        };
      }

      return {
        success: false,
        error: 'UnknownError',
        message: 'An unexpected error occurred.',
      };
    }
  };

  const handleUpdateUserProfile = async (payload: ProfileUpdatePayloadType) => {
    clearError();
    clearSuccessMessage();
    setIsLoading(true);

    try {
      const response = await authFetch<ProfileUpdateResponseType>(
        url_update_user,
        {
          method: 'PATCH',
          data: payload,
        },
      );

      if (response.data.success) {
        const currentUserData = useAuthStore.getState().userData;

        const mappedNewData = mapUserResponseToUserData(response.data.user);
        if (!mappedNewData || typeof mappedNewData !== 'object') {
          console.error(
            '❌ Invalid user data from backend:',
            response.data.user,
          );

          throw new Error('Invalid user data from backend');
        }

        // Merge the API user into the current store state instead of replacing it
        const finalUserData = safeMergeUser(currentUserData, mappedNewData);

        setUserData(finalUserData);

        setSuccessMessage(
          response.data.message || 'Profile updated successfully',
        );

        return response.data;
      }

      setError(response.data.message);
      return response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const { status, data } = err.response;
        const errorData = data as Record<string, unknown>;

        if (status === 401) {
          const currentPath = window.location.pathname + window.location.search;
          sessionStorage.setItem('returnTo', currentPath);

          invalidateSession('expired');

          return {
            success: false,
            error: 'Session expired. Please login again.',
            sessionExpired: true,
          };
        }

        if (status === 429) {
          return {
            success: false,
            error: (errorData?.error as string) || 'RateLimitExceeded',
            message:
              (errorData?.message as string) ||
              'Too many requests. Please try again later.',
            retryAfter: errorData?.retryAfter as number | undefined,
          };
        }

        if (status === 400) {
          const details = errorData?.details as
            | Record<string, unknown>
            | undefined;
          return {
            success: false,
            error: (errorData?.message as string) || 'Invalid data provided',
            fieldErrors: details?.fieldErrors as
              | Record<string, string[]>
              | undefined,
          };
        }
      }

      const errorMessage = extractErrorMessage(err) || 'Error updating profile';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isAuthenticated,
    userData,
    isCheckingAuth,
    isLoading,
    error,
    successMessage,
    sessionExpired,

    handleSignIn,
    handleSignUp,
    handleSignOut,
    handleUpdateUserProfile,
    handleDomainChangePassword,

    clearError,
    clearSuccessMessage,
    setIsCheckingAuth,
  };
};

export default useAuth;

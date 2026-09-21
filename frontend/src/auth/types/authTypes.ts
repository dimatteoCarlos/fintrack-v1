import { CurrencyType } from '../../fintrack/types/types';

export type CredentialsType = {
  username: string;
  email: string;
  user_firstname: string;
  user_lastname: string;
  password: string;
  confirmPassword?: string;
};

// Sign-in takes one identity, resolved by the backend against the username or
// the email column; sign-up takes both because it creates them.
export type SignInCredentialsType = {
  identity: string;
  password: string;
};

export type SignUpCredentialsType = {
  username: string;
  email: string;
  password: string;
  user_firstname: string;
  user_lastname: string;
  confirmPassword: string;
};

// The wire payload. timezone is detected, not typed, so the form's credentials
// do not carry it.
export type SignUpPayloadType = SignUpCredentialsType & {
  timezone: string;
};

export type AuthStoreStateType<U> = {
  isAuthenticated: boolean;
  setIsAuthenticated: (isAuthenticated: boolean) => void;

  userData: U | null;

  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;

  isCheckingAuth: boolean;
  setIsCheckingAuth: (isCheckingAuth: boolean) => void;

  error: string | null;
  setUserData: (userData: U | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  successMessage: string | null;
  setSuccessMessage: (successMessage: string | null) => void;
  clearSuccessMessage: () => void;

  sessionExpired: boolean;
  setSessionExpired: (expired: boolean) => void; 
};

// Backend response shared by sign-in, sign-up and refresh-token.
export type AuthSuccessResponseType = {
  message: string;
  accessToken: string;
  user: UserResponseDataType;
  expiresIn: number;
};

export type UserResponseDataType = {
  user_id: string;
  username: string;
  email: string;
  user_firstname: string;
  user_lastname: string;
  role: string;
  currency: CurrencyType;
  user_contact: string | null;
  // Returned by sign-up, sign-in and validateSession; optional because an older
  // backend omits it.
  timezone?: string;
};

export type UserDataType = {
  user_id: string;
  username: string;
  email: string;
  user_firstname: string;
  user_lastname: string;
  currency: CurrencyType;
  role: string;
  contact: string | null;
  // The zone the account's periods are read on. Date formatters must take it
  // from here, never from Intl, which reports the device's zone.
  timezone?: string;
};

export type SignInResponseType = {
  message: string;
  accessToken: string;
  user: UserResponseDataType;
  expiresIn: number;
};

export interface SuccessResponseType<T> {
  message: string;
  data?: T;
  accessToken?: string;
  refreshToken?: string;
}

export type UpdateProfileFormDataType = {
  firstname: string;
  lastname: string;
  currency: CurrencyType;
  contact: string | null;
  // The IANA zone the account's periods are read on. Always a string: the
  // column is NOT NULL and defaults to UTC.
  timezone: string;
};

export type UpdateProfileResponseUserType = {
  user_id: string;
  username: string;
  email: string;
  user_firstname: string;
  user_lastname: string;
  user_contact: string;
  currency_id: number;
  currency: CurrencyType;
  role: string;
  // Returned by the update endpoint. Optional so an older backend still parses.
  timezone?: string;
};
// Error body returned by the backend.
export type ErrorResponseType = {
  status: number;
  error: string;
  message: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
  timestamp?: string;
};

export type AuthErrorType =
  | { type: 'validation'; fieldErrors: Record<string, string[]> }
  | { type: 'rate_limit'; retryAfter: number }
  | { type: 'session_expired' }
  | { type: 'network'; message: string };

export type FormErrorsType<TFieldName extends string> = Partial<
  Record<TFieldName, string>
> & {
  form?: string;
};

/** Result of a password change; mirrors the backend response structure. */
export type ChangePasswordResultType =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
      retryAfter?: number;
    };

export type ChangePasswordFormDataType = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

// Raw API responses, matching the backend middleware.
export type ChangePasswordSuccessResponse = {
  success: true;
  message: string;
};

// The most common error, produced by validateRequestSync.
export type ChangePasswordErrorResponse = {
  success: false;
  error: string; // e.g. "ValidationError" or "InvalidCredentials"
  message: string;
  fieldErrors?: Record<string, string[]>; // fallback for other middlewares
  retryAfter?: number; // set by the rate limiter, which runs before the validator
};

export type ChangePasswordFailureResponse = {
  success: false;
  error: string; // e.g. "InvalidCredentials"
  message?: string;
};

// Rate limiter triggered (HTTP 429).
export type ChangePasswordRateLimitResponse = {
  success: false;
  error: 'ChangePasswordRateLimitExceeded';
  message: string;
  retryAfter: number; // seconds
};

// Only produced if the backend starts returning fieldErrors.
export type ChangePasswordValidationErrorResponse = {
  success: false;
  fieldErrors: Record<string, string[]>;
};

export type ChangePasswordResponseType =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
      message?: string;
      fieldErrors?: Record<string, string[]>;
      retryAfter?: number;
    };

// PATCH payload; must stay aligned with the backend profile-update schema.
export type ProfileUpdatePayloadType = Partial<{
  firstname: string;
  lastname: string;
  contact: string | null;
  currency: CurrencyType;
  timezone: string;
}>;
export type NormalizedProfileUpdateResultType = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | string>;
  message?: string;
  retryAfter?: number;
  sessionExpired?: boolean;
};

export type ProfileUpdateSuccessResponseType = {
  success: true;
  user: UpdateProfileResponseUserType;
  message?: string;
};

export type ProfileUpdateErrorResponseType = {
  success: false;
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfter?: number;
};

/**
 * Identity kept in localStorage only to pre-fill the sign-in form. It never
 * holds tokens or passwords, and the backend never trusts it.
 */
export type UserIdentityType = {
  /** What was typed to sign in, a username or an email. */
  identity: string;

  rememberMe: boolean;
};

export type AuthUIStateType =
  | 'IDLE'
  | 'SIGN_IN'
  | 'SIGN_UP'

export type ProfileUpdateResponseType =
  | ProfileUpdateSuccessResponseType
  | ProfileUpdateErrorResponseType;

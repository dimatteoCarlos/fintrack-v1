import { AuthUIStateType } from '../../types/authTypes';

// The payload each auth navigation event carries.
export type AuthEventMapType = {
  password_changed: Record<string, never>|undefined; // no data needed
  session_expired: { from?: string };
  user_logged_out: Record<string, never>|undefined;
};

export type AuthEventType = keyof AuthEventMapType;

/**
 * What a handler wants to happen. Handlers execute nothing; AuthPage applies
 * the result.
 */
export type AuthEventResultType = {
  uiState?: AuthUIStateType;
  message?: string | null;
  prefill?: {
  identity?: string | null;
} | null;

  navigation?: {
    to: string;
    replace?: boolean;
    state?: Record<string, unknown>;
  };

  // Set by session_expired: where to send the user after signing in.
  returnTo?: string | null;
};

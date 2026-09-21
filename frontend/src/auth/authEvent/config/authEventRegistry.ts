// Maps each auth event to a handler that returns an AuthEventResultType, which AuthPage executes.

import {
  AuthEventMapType,
  AuthEventType,
  AuthEventResultType,
} from '../types/eventTypes';

import { AuthEventContextType } from '../types/eventContextTypes';
import { getIdentity } from '../../auth_utils/localStorageHandle/authStorage';
import { AUTH_UI_STATES } from '../../auth_constants/constants';

export type AuthEventHandlerType<EventKey extends AuthEventType> = (
  data?: AuthEventMapType[EventKey],
  ctx?: AuthEventContextType,
) => AuthEventResultType;

export const authEventRegistry: {
  [EventKey in AuthEventType]: AuthEventHandlerType<EventKey>;
} = {
// Opens the sign-in modal, prefilled when a remembered identity exists.
  password_changed: () => {
    const identity = getIdentity(); //from authStorage
    const result: AuthEventResultType = { uiState: 'SIGN_IN' };

    if (identity?.identity) {
      result.prefill = { identity: identity.identity };
    }
    return result;
  },

  // Opens sign-in with an expiry message and passes the return path (from) for the post-login redirect.
  session_expired: (data) => {
    const result: AuthEventResultType = {
      uiState: AUTH_UI_STATES.SIGN_IN || 'SIGN_IN',
      message: 'Your session has expired. Please sign in again.',
    };

  // Priority: data.from (from ProtectedRoute) > sessionStorage returnTo
    const returnTo = data?.from || sessionStorage.getItem('returnTo');
    
    if (returnTo) {
      result.returnTo = returnTo;
    }
    return result;
  },

  user_logged_out: () => {
    return {
      uiState: 'IDLE',
    };
  },
};

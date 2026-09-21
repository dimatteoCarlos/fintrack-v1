import { useAuthStore } from '../stores/useAuthStore';
/**
 * Single place that clears auth state when a session expires; idempotent. It
 * keeps the remembered identity in localStorage and does no navigation or UI
 * (ProtectedRoute and AuthPage own those); logout goes through logoutCleanup.
 * @param reason - Only 'expired' is handled.
 */
export const invalidateSession = (reason?: 'expired'): void => {
  const hasToken = sessionStorage.getItem('accessToken');
  if (hasToken) {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('tokenExpiry');
  }

  const authStore = useAuthStore.getState();

  authStore.setIsAuthenticated(false);
  authStore.setUserData(null);

  if (authStore.clearError) authStore.clearError();
  if (authStore.clearSuccessMessage) authStore.clearSuccessMessage();

  // Reset loading flags so the UI does not stay in a loading state.
  authStore.setIsLoading(false);
  authStore.setIsCheckingAuth(false);

 // ProtectedRoute reads this flag to tell expiry from signed-out. Set on every call: useAuth's mount
 // check calls again with no reason to correct an earlier 'expired' one (an anonymous silent refresh
 // 401s like an expired session), else every first visit would show "Your session has expired".
 authStore.setSessionExpired(reason === 'expired');

  console.log('🧹 Session invalidated:', {reason});
};

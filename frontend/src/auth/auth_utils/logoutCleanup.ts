import { LOCAL_STORAGE_KEY } from '../../fintrack/helpers/constants';
import { useAuthStore } from '../stores/useAuthStore';
import { clearIdentity, getIdentity } from './localStorageHandle/authStorage';

// Logout cleanup: clears tokens and store, and keeps the remembered identity only when rememberMe is true.
export const logoutCleanup = (): void => {
  console.log(
    `🔧 logoutCleanup executing`,
  );

  const { setIsAuthenticated, setUserData, clearError, clearSuccessMessage } =
    useAuthStore.getState();

  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('tokenExpiry');

  setIsAuthenticated(false);
  clearError();
  clearSuccessMessage();

  const identity = getIdentity();
  const shouldKeepData = identity?.rememberMe === true;

  // Always clear the in-memory profile; "remember me" keeps identity, not userData
  setUserData(null);

  if (!shouldKeepData) {
    clearIdentity();
    localStorage.removeItem(LOCAL_STORAGE_KEY.USER_DATA);
    console.log('🔧 Full cleanup: all persistent data removed');
  } else {
    console.log('🔧 Partial cleanup: keeping identity for next visit');
  }
};

// In-memory auth session state; persistence lives in authStorage and UI state in useAuthUIStore.
import { create } from 'zustand';
import { AuthStoreStateType, UserDataType } from '../types/authTypes';

export const useAuthStore = create<AuthStoreStateType<UserDataType>>(
 (set) => ({
 isAuthenticated: false,
 setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

  userData: null,
  setUserData: (userData) => set({ userData }),

  isLoading: false,
  setIsLoading: (isLoading: boolean) => set({ isLoading }),

// True until the initial silent-refresh session check finishes
  isCheckingAuth: true,
  setIsCheckingAuth: (isCheckingAuth: boolean) => set({ isCheckingAuth }), 

  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  successMessage: '',
  setSuccessMessage: (successMessage) => set({ successMessage }),
  clearSuccessMessage: () => set({ successMessage: '' }),

  sessionExpired:false,
  setSessionExpired:(expired:boolean)=>set({sessionExpired:expired})

 }))

// Debug state logging; disabled while the environment value is 'developmentX'
if (import.meta.env.VITE_ENVIRONMENT === 'developmentX') {
  useAuthStore.subscribe((state) => {
    console.log('🔧 AuthStore state:', {
      isAuthenticated: state.isAuthenticated,
      hasUserData: !!state.userData,
      isLoading: state.isLoading,
      error: state.error,
      successMessage: state.successMessage,
    });
  });
}
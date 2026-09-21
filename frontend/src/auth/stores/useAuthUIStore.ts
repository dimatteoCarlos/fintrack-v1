// UI-only auth state (modal state, messages, prefilled identity); session data lives in useAuthStore.
import { create } from 'zustand';
import { AuthUIStateType } from '../types/authTypes';

type AuthUIStoreType = {
  uiState: AuthUIStateType;

  message: string | null;

  // The username or email last used, from the remembered identity
  prefilledIdentity: string | null;

  setUIState: (state: AuthUIStateType) => void;
  setMessage: (message: string | null) => void;
  setPrefilledData: (identity: string | null) => void;
  resetUI: () => void;
}

// Not persisted: UI state intentionally resets on page reload
export const useAuthUIStore = create<AuthUIStoreType>()(
 (set) => ({
   uiState: 'IDLE',
   message: null,
   prefilledIdentity: null,

   setUIState: (uiState) => set({ uiState }),
   setMessage: (message) => set({ message }),
   setPrefilledData: (identity) => set({
      prefilledIdentity: identity
    }),
   resetUI: () => set({
      uiState: 'IDLE',
      message: null,
      prefilledIdentity: null,
    }),
  })
);

// Debug state logging; disabled while the environment value is 'developmentX'
if (import.meta.env.VITE_ENVIRONMENT === 'developmentX') {
  useAuthUIStore.subscribe((state) => {
    console.log('🔧 AuthUIStore state:', {
      uiState: state.uiState,
      message: state.message,
      hasPrefill: !!state.prefilledIdentity,
    });
  });
}
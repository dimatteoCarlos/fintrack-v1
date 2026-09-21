// Pure localStorage helpers for the remembered sign-in identity.
import { UserIdentityType } from '../../types/authTypes';

const STORAGE_KEYS = {
  IDENTITY: 'auth_identity',
} as const;

export const saveIdentity = (identity: UserIdentityType): void => {
  try {
    const serialized = JSON.stringify(identity);
    localStorage.setItem(STORAGE_KEYS.IDENTITY, serialized);
  } catch (error) {
    // localStorage is not critical for the app, so a failed save only warns.
    console.warn('⚠️ Failed to save identity to localStorage:', error);
  }
};

/** Returns null when the entry is missing or corrupted; a corrupted entry is removed. */
export const getIdentity = (): UserIdentityType | null => {
  try {
    const serialized = localStorage.getItem(STORAGE_KEYS.IDENTITY);
    if (!serialized) return null;
    
    const parsed = JSON.parse(serialized) as UserIdentityType;
    
    // Shape check: an entry written before the single identity field carries
    // email and username instead, fails here and is cleaned up below.
    if (typeof parsed === 'object' &&
        parsed !== null &&
        'identity' in parsed &&
        'rememberMe' in parsed)
     {
     return parsed;
     }

    clearIdentity();
    return null;

  } catch (error) {
    console.warn('⚠️ Failed to parse identity from localStorage:', error);
    localStorage.removeItem(STORAGE_KEYS.IDENTITY);
    return null;
  }
};

export const clearIdentity = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.IDENTITY);
  } catch (error) {
    console.warn('⚠️ Failed to clear identity from localStorage:', error);
  }
};

// Injected by AuthPage with read-only functions only, so handlers must return a result instead of acting.
export type AuthEventContextType = {
  getIdentity: () => { identity?: string } | null;
};
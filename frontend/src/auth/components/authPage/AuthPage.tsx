// Orchestrates the auth navbar, modal and post-auth navigation; auth logic lives in useAuth.

import { useCallback, useEffect, useState , useRef} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import AuthModal from './AuthModal';
import { AUTH_ROUTE, AUTH_UI_STATES } from '../../auth_constants/constants';
import Logo from '../../../assets/logo.svg';

import { useAuthUIStore } from '../../stores/useAuthUIStore';
import useAuth, { SignInResultType } from '../../hooks/useAuth';

import { SignInCredentialsType, SignUpCredentialsType } from '../../types/authTypes';

import { INITIAL_PAGE_ADDRESS } from '../../../fintrack/helpers/constants';

import { getIdentity } from '../../auth_utils/localStorageHandle/authStorage';

import { authEventRegistry } from '../../authEvent/config/authEventRegistry';
import { useAuthStore } from '../../stores/useAuthStore';

import styles from './styles/authPage.module.css';

// The 16:9 promo, served from public/ so the link does not depend on a GitHub upload.
const DEMO_VIDEO_URL = '/fintrack-demo-desktop.mp4';

export default function AuthPage() {

 const location = useLocation();
  const navigateTo = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSignInMode, setIsSignInMode] = useState(true); // true = signin, false = signup
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);

  const {
    isLoading,
    error,
    handleSignIn:handleSignInDomain,
    handleSignUp:handleSignUpDomain,
    clearError,
  } = useAuth();
  
  const { uiState, message, setUIState,setMessage,  setPrefilledData, resetUI } = useAuthUIStore();

  const { setSessionExpired, sessionExpired } = useAuthStore();

   const returnToRef = useRef<string | null>(null)
// Whether the expiry message on screen was set by the reload fallback below
   const fallbackShowedExpiryRef = useRef(false);

 const handleSignInWithNavigation = async (
  credentials: SignInCredentialsType,
  rememberMe: boolean,
  ): Promise<SignInResultType> => {
  const result =  await handleSignInDomain(credentials, rememberMe);

  if(result.success){
  // Always the initial page; returning to the pre-expiry route is disabled.
  const redirectPath = INITIAL_PAGE_ADDRESS;
  // replace, so the auth screen does not stay one step back in the history,
  // where a signed-in user pressing back would land on the login form.
  navigateTo(redirectPath, { replace: true });

  returnToRef.current = null;
   }

 // The form reads the failed result to attach the server's per-field messages.
  return result;
  };

 const handleSignUpWithNavigation = async(credentials:SignUpCredentialsType)=>{
   const result = await handleSignUpDomain(credentials);

   if(result.success){
    // replace, as for sign-in: registering must not leave the auth screen one
    // step back from the app.
    navigateTo(INITIAL_PAGE_ADDRESS ??' /fintrack', { replace: true });
   }

// Errors are already stored in useAuthStore and displayed by AuthUI
  }
const openLoginModalWithPrefill = useCallback(()=>{
 const identity = getIdentity();
 if(identity?.identity){
  setPrefilledData(identity.identity)
 }else {setPrefilledData(null);}

 setUIState(AUTH_UI_STATES.SIGN_IN); // always SIGN_IN, prefill handled separately
}, [setPrefilledData, setUIState]);

 const navigationState = location.state as
  | {
     authEvent?: string;
     from?: string;
    }
  | undefined;
 const authEvent = navigationState?.authEvent;

// Only processes an authEvent; without one it does not force the UI to IDLE.
useEffect(() => {
 if (!authEvent) return;

// Start from a clean baseline before processing the authEvent.
 if (uiState !== AUTH_UI_STATES.IDLE) {
   setUIState(AUTH_UI_STATES.IDLE);
 }

 const authEventHandler = authEventRegistry[authEvent as keyof typeof authEventRegistry];

 if (!authEventHandler) {
  console.warn(`Unknown authEvent: ${authEvent}`);
  return;
  }

// session_expired needs the 'from' data; others don't
  let result;
  if (authEvent === 'session_expired') {
  result = authEventRegistry.session_expired({ from: navigationState?.from }, { getIdentity });
  } else {
  result = authEventHandler(undefined, { getIdentity });
  }

 if(result.uiState){
  setUIState(result.uiState);
 }

 if (result.message) {
  setMessage(result.message);
  }
   
 if (result.prefill) {
  setPrefilledData(result.prefill.identity ?? null);
  }

if(result.returnTo !== undefined){
 returnToRef.current = result.returnTo;
}

if(result.navigation){
 navigateTo(result.navigation.to,{
  replace:result.navigation.replace ?? false,
  state:result.navigation.state,
 });
}

 // Consume the stored returnTo and reset the sessionExpired flag.
  sessionStorage.removeItem('returnTo');
  setSessionExpired(false);
 }, [authEvent,  navigateTo,navigationState?.from, setMessage, setPrefilledData, setUIState,uiState,setSessionExpired]);

// Separate from the effect above so clearing location.state cannot re-trigger it.
useEffect(() => {
  if (location.state && Object.keys(location.state).length > 0) {
   navigateTo(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigateTo]);

  // Reload fallback: restores the expiry message when location.state is empty. Gated on sessionExpired,
  // not 'returnTo' alone: useAuth's boot check briefly writes both on an anonymous visit before
  // correcting itself, which latched a false message. The else-branch withdraws it.
  useEffect(() => {
    if (authEvent) return;
    const savedReturnTo = sessionStorage.getItem('returnTo');
    // A returnTo naming a route that renders this page ('/' or the auth route)
    // was written by the boot refresh failing here (anonymous visit or sign-out),
    // not by an expiry inside the app, so the modal stays closed until opened.
    const returnToPath = savedReturnTo?.split('?')[0];
    const expiredElsewhere =
      returnToPath !== undefined &&
      returnToPath !== '/' &&
      !returnToPath.startsWith(AUTH_ROUTE);

    if (expiredElsewhere && sessionExpired) {
      returnToRef.current = savedReturnTo;
      setUIState(AUTH_UI_STATES.SIGN_IN);
      setMessage('Your session has expired. Please sign in again.');
      fallbackShowedExpiryRef.current = true;

      const identity = getIdentity();
      if (identity?.identity) {
        setPrefilledData(identity.identity);
      }

      sessionStorage.removeItem('returnTo');
    } else if (!sessionExpired && fallbackShowedExpiryRef.current) {
      // The flag was corrected after a transient true reading latched the message: withdraw
      // only this effect's own message; the session_expired event's is real.
      fallbackShowedExpiryRef.current = false;
      setMessage(null);
    }
  }, [authEvent, sessionExpired, message, setUIState, setMessage, setPrefilledData]);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleTheme = () => setIsDarkTheme((prev) => !prev);

  const openSigninModalHandler = () => {
    setIsMenuOpen(false);
    clearError();
    returnToRef.current = null; // a manual open must not inherit a stale return path
    setIsSignInMode(true);
    openLoginModalWithPrefill();
  };

  const openSignupModalHandler = () => {
    setIsMenuOpen(false);
    clearError();
    setIsSignInMode(false);
    setUIState(AUTH_UI_STATES.SIGN_UP);
  };

  const handleCloseModal = () => {
   resetUI();
   returnToRef.current = null; // avoids a stale redirect on the next sign-in
  };

  const showModal = uiState !== AUTH_UI_STATES.IDLE;

  return (
    <div className={styles.authPageContainer}>
      <nav className={styles.navbar}>
       <div className={styles.logoContainer}>
        {/* No wrapper: a span puts the svg back on a text baseline, and the mark
            rides 2px above the menu button it lines up with. */}
        <Logo />
       </div>

        <button
          className={styles.menuToggleButton}
          aria-label='Navigation Menu'
          aria-expanded={isMenuOpen}
          onClick={toggleMenu}
        >
          ☰
        </button>

        <ul
          className={`${styles.navList} ${
            isMenuOpen ? styles.navMenuActive :''
          }
         `}
        >
          <li>
            <button
              type='button'
              className={`${styles.navPill} ${isSignInMode ? styles.navPillActive : ''}`}
              onClick={openSigninModalHandler}
            >
              Sign in
            </button>
          </li>

          <li>
            <button
              type='button'
              className={`${styles.navPill} ${!isSignInMode ? styles.navPillActive : ''}`}
              onClick={openSignupModalHandler}
            >
              Sign up
            </button>
          </li>

          <li>
            <a
              href={DEMO_VIDEO_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={styles.navPill}
            >
              Watch demo
            </a>
          </li>
        </ul>
      </nav>

      <main className={styles.mainContent}>
        {showModal && (
          <AuthModal
            onSignIn={handleSignInWithNavigation}
            onSignUp={handleSignUpWithNavigation}
            isLoading={isLoading}
            error={error}
            messageToUser={message}
            isSignInInitial={isSignInMode}
            clearError={clearError}
            // Escape, the backdrop and AuthUI's own close button all land here
            onClose={handleCloseModal}
            isDarkTheme={isDarkTheme}
            onToggleTheme={toggleTheme}
          />
        )}
      </main>
    </div>
  );
}

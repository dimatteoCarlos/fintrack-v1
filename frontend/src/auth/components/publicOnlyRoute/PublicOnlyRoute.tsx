// Mirror of ProtectedRoute: keeps a signed-in owner out of the auth screen; the two never both fire.
// Never clears the session_expired or returnTo flags: AuthPage is their only owner.

import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import CoinSpinner from '../../../fintrack/loader/coin/CoinSpinner';
import { INITIAL_PAGE_ADDRESS } from '../../../fintrack/helpers/constants';

const PublicOnlyRoute = () => {
 const { isAuthenticated, isCheckingAuth } = useAuth();

 // Wait for the auth check: deciding earlier would flash the login form at a signed-in owner.
 if (isCheckingAuth) {
  return <CoinSpinner />;
 }

 if (isAuthenticated) {
  return <Navigate to={INITIAL_PAGE_ADDRESS} replace />;
 }

 return <Outlet />;
};

export default PublicOnlyRoute;

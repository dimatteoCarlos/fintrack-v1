// Guard for the authenticated routes: a spinner while auth is checked, an expired session sent
// to the auth route with intent, any other visitor sent to "/".
// Never clears the session_expired or returnTo flags: AuthPage is their only owner.

import { Navigate, useLocation, Outlet } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import CoinSpinner from '../../../fintrack/loader/coin/CoinSpinner';
import { AUTH_ROUTE } from '../../auth_constants/constants';

const ProtectedRoute = () => {
  const location = useLocation();
  const { isAuthenticated, isCheckingAuth , sessionExpired } = useAuth();

  if (isCheckingAuth) {
    return <CoinSpinner />;
  }

 const redirectToHomeMenu = '/';

  if (!isAuthenticated) {
  if (sessionExpired ) {
    return (
     <Navigate
       to={AUTH_ROUTE}
       replace
       state={{
         authEvent: 'session_expired',
         from: location.pathname,
       }}
     />
      );
   }
  return (
   <Navigate
      to= {redirectToHomeMenu || "/"}
      replace
      state={{ from: location.pathname }}
    />
   );
  }

  return <Outlet />;
};

export default ProtectedRoute;

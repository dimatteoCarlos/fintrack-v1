import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '../../../auth/hooks/useAuth';
import UserProfileMenu from '../../../auth/components/userProfileMenu/UserProfileMenu';

import Logo from '../../../assets/logo.svg';
import { MdOutlineEditNote } from 'react-icons/md';
import { BsArrowRight } from 'react-icons/bs';
import './logoMenuIcon.css';
import { notifySuccess } from '../../../auth/auth_utils/notification';

import { AUTH_ROUTE } from '../../../auth/auth_constants/constants';

function LogoMenuIcon() {
  const { pathname } = useLocation();
  const navigateTo = useNavigate();

  const { handleSignOut, clearError, clearSuccessMessage, isAuthenticated } =
    useAuth();

  const handleSignOutClick = async() => {
    clearError();
    clearSuccessMessage();
    await handleSignOut();

    notifySuccess('Signed out successfully');
    navigateTo(AUTH_ROUTE, {
      replace: true,
      state: { authEvent: 'user_logged_out' as const }
    });
  };

  return (
    <div className='header__logoAndIcon'>
      <Logo />
     <div
      className='menuBox '
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        width: '35%',
        alignSelf: 'center',
        gap: '0.5rem',
      }}
      >
     <Link to='accounting' className='' state={{ originRoute: pathname }} viewTransition>
       <div className='iconContainer edit  '>
        <MdOutlineEditNote
          style={{
           color: 'black',
           fontSize: '32px',
           border: '3px solid black',
           borderRadius: '8px',
          }}
         />
       </div>
     </Link>

        {isAuthenticated && (
          <div className='iconContainer'>
            <UserProfileMenu />
          </div>
        )}

        <button
          onClick={handleSignOutClick}
          className=''
          style={{ border: 'none' }}
        >
          <div className='iconContainer exit '>
            <BsArrowRight
              style={{
                color: 'black',
                fontSize: '30px',
                fontWeight: 'bold',
                paddingLeft: '8px',

                border: '3px solid black',
                borderRight: '0px solid white',
                borderRadius: '8px',
              }}
            />
          </div>
        </button>
      </div>
    </div>
  );
}

export default LogoMenuIcon;

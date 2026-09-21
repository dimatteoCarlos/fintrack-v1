// Coordinates the avatar, the profile menu and the profile forms it opens.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../stores/useAuthStore';

import UserAvatar from './UserAvatar';
import UpdateProfileContainer from '../updateProfileForm/UpdateProfileContainer';

import styles from './styles/userProfileMenu.module.css';

// '?react' suffix: a bare .svg import is typed `string` and cannot take a
// className, so the glyph could not inherit the row's colour.
import ArchiveSvg from '../../../assets/userProfileMenuSvg/archiveSvg.svg?react';
import CloseSvg from '../../../assets/userProfileMenuSvg/closeSvg.svg?react';
import CoinsSvg from '../../../assets/userProfileMenuSvg/coinsSvg.svg?react';
import EditSvg from '../../../assets/userProfileMenuSvg/editSvg.svg?react';
import LockSvg from '../../../assets/userProfileMenuSvg/lockSvg.svg?react';
import TimezoneSvg from '../../../assets/userProfileMenuSvg/timezoneSvg.svg?react';

import { CurrencyType } from '../../../fintrack/types/types';
import { DEFAULT_CURRENCY } from '../../../fintrack/helpers/constants';
import ChangePasswordContainer from '../passwordChangeForm/ChangePasswordContainer';

type ModalStateType = 'none' | 'menu' | 'userForm' | 'changePasswordForm';

type UserInfoType = {
  initial: string;
  userName?: string;
  userEmail?: string;
  currency: CurrencyType;
  timeZone: string;
};

// Closed-account registry route. A closed account is removed from user_accounts, so
// no dashboard list shows it; the profile menu is where that history is reachable.
const CLOSED_ACCOUNTS_ROUTE = '/fintrack/account/closed';

const UserProfileMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const userData = useAuthStore((state) => state.userData);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [modalState, setModalState] = useState<ModalStateType>('none');

  const getUserInfo = useCallback((): UserInfoType => {
    if (!userData) {
      return {
        initial: 'U',
        currency: DEFAULT_CURRENCY,
        timeZone: '',
      };
    }

    const userLabel =
      userData.user_firstname || userData.user_lastname || userData.username;

    return {
      initial: userLabel ? userLabel.charAt(0).toUpperCase() : 'U',
      userName: userData.username,
      userEmail: userData.email,
      currency: userData.currency || DEFAULT_CURRENCY,
      // City segment only: the badge sits beside the currency one and a full zone
      // id such as 'America/Bogota' would wrap onto a second line.
      timeZone: (userData.timezone || '').split('/').pop()?.replace(/_/g, ' ') ?? '',
    };
  }, [userData]);

  const userInfo = getUserInfo();

  const handleAvatarClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    setModalState('menu');
  }, []);
  const handleEditProfile = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setModalState('userForm');

    },
    [],
  );

  const handleChangePassword = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setModalState('changePasswordForm');
    },
    [],
  );

  // The menu closes before navigating: an open dialog behind the new page would
  // trap the owner's next Escape on a screen they have left.
  const handleOpenClosedAccounts = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setModalState('none');
      // The current location travels in state so the registry's back arrow returns
      // here; this menu is mounted on every screen, so no constant could name it.
      navigate(CLOSED_ACCOUNTS_ROUTE, {
        viewTransition: true,
        state: { previousRoute: `${location.pathname}${location.search}` },
      });
    },
    [navigate, location.pathname, location.search],
  );

  const handleCloseCurrentModal = useCallback((): void => {
    setModalState('none');
  }, []);

  const handleNavigateBack = useCallback((): void => {
    if (modalState === 'userForm' || modalState === 'changePasswordForm') {
      setModalState('menu');
    }
  }, [modalState]);
  useEffect(() => {
  }, [modalState]);

  // Escape steps back one level: form, then menu, then closed.
  useEffect(() => {
    if (modalState === 'none') return;

    const handleEscapeKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();

      switch (modalState) {
        case 'userForm':
        case 'changePasswordForm':
          setModalState('menu');
          break;

        case 'menu':
          setModalState('none');
          break;

        default:
          break;
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [modalState]);

  // A press outside the open menu closes it; outside an open form it returns to the menu.
  useEffect(() => {
    if (modalState === 'none') return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;

      const clickedOutsideMenu =
        menuRef.current && !menuRef.current.contains(target);

      if (modalState === 'menu' && clickedOutsideMenu) {
        setModalState('none');
      }

      if (
        (modalState === 'userForm' || modalState === 'changePasswordForm') &&
        formRef.current &&
        !formRef.current.contains(target)
      ) {
        setModalState('menu');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modalState]);

  if (!isAuthenticated || !userData) {
    return null;
  }

  return (
    <>
      <UserAvatar
        initial={userInfo.initial}
        onClickFn={handleAvatarClick}
        isTooltipDisabled={modalState !== 'none'}
        userName={userInfo.userName}
        userEmail={userInfo.userEmail}
        id='user-profile-avatar'
      />

      {modalState !== 'none' && (
        <div
          className={`${styles.menuOverlay} ${modalState !== 'menu' ? styles.hidden : ''}`}
        >
          <div
            className={styles.menuContainer}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={styles.profileMenu}
              role='dialog'
              aria-modal='true'
              aria-labelledby='profile-menu-title'
            >
              <div className={styles.menuHeader} tabIndex={0}>
                <div className={styles.menuAvatar}>{userInfo.initial}</div>

                <div className={styles.menuUserInfo}>
                  <span id='profile-menu-title' className={styles.menuUserName}>
                    {userInfo.userName}
                  </span>
                  <span className={styles.menuUserEmail}>
                    {userInfo.userEmail}
                  </span>
                </div>

                <button
                  className={styles.closeButton}
                  onClick={handleCloseCurrentModal}
                  aria-label='Close profile menu'
                >
                  <CloseSvg
                    className={styles.closeIcon}
                    aria-hidden='true'
                  />
                </button>
              </div>

              <div className={styles.menuDivider} />

              <button
                className={styles.menuItem}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditProfile(e);
                }}
                aria-label='Edit user profile'
              >
                <EditSvg
                  className={styles.menuItemIcon}
                  aria-hidden='true'
                />
                <span className={styles.menuItemText}>Edit Profile</span>
              </button>

              <button
                className={styles.menuItem}
                onClick={handleChangePassword}
                aria-label='Change password'
              >
                <LockSvg
                  className={styles.menuItemIcon}
                  aria-hidden='true'
                />
                <span className={styles.menuItemText}>Change Password</span>
              </button>

              <button
                className={styles.menuItem}
                onClick={handleOpenClosedAccounts}
                aria-label='Open the closed-account registry'
              >
                <ArchiveSvg
                  className={styles.menuItemIcon}
                  aria-hidden='true'
                />
                <span className={styles.menuItemText}>Closed Accounts</span>
              </button>

              <div className={styles.menuDivider} />

              <div className={styles.menuFooter}>
                <span className={styles.currencyBadge}>
                  <CoinsSvg
                    className={`${styles.currencyIcon} ${styles.light}`}
                    aria-hidden='true'
                  />
                  Currency: <strong>{userInfo.currency.toLowerCase()}</strong>
                </span>

                {userInfo.timeZone && (
                 <span className={styles.currencyBadge}>
                  <TimezoneSvg
                   className={`${styles.currencyIcon} ${styles.light}`}
                   aria-hidden='true'
                  />
                  Time Zone: <strong>{userInfo.timeZone}</strong>
                 </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {modalState === 'userForm' && (
        <div className={styles.modalOverlay} data-testid='update-form-overlay'>
          <div
            className={styles.modalContainer}
            ref={formRef}
            onClick={(e) => e.stopPropagation()}
          >
            <UpdateProfileContainer
              onClose={handleNavigateBack}
              onSuccess={handleCloseCurrentModal}
            />
          </div>
        </div>
      )}

      {modalState === 'changePasswordForm' && (
        <div
          className={styles.modalOverlay}
          data-testid='changePassword-form-overlay'
        >
          <div
            className={styles.modalContainer}
            ref={formRef}
            onClick={(e) => e.stopPropagation()}
          >
            <ChangePasswordContainer
              onClose={() => {
                handleNavigateBack();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default UserProfileMenu;

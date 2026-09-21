import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { INITIAL_PAGE_ADDRESS } from '../../helpers/constants';
import { url_get_all_accounting_accounts } from '../../../urlConfig';
import AccountingBox from './AccountingBox';
import LeftArrowSvg from '../../../assets/LeftArrowSvg.svg';
// '?react' and not a bare import: only that specifier carries a React
// component type, so the icon can take a className.
import BankAccountSvg from '../../../assets/accountingDashboardSvg/bankAccountSvg.svg?react';
import DebtsAccountsSvg from '../../../assets/accountingDashboardSvg/debtsAccountsSvg.svg?react';
import ExpenseAccountsSvg from '../../../assets/accountingDashboardSvg/expenseAccountsSvg.svg?react';
import IncomeAccountsSvg from '../../../assets/accountingDashboardSvg/incomeAccountsSvg.svg?react';
import InvestmentAccountsSvg from '../../../assets/accountingDashboardSvg/investmentAccountsSvg.svg?react';
// The disclosure affordance of every group heading. One asset, rotated when
// the group opens, rather than a second drawing for the open state.
import ArrowDownLightSvg from '../../../assets/ArrowDownLightSvg.svg?react';
import ScrollJump from '../../general_components/scrollJump/ScrollJump';
// The two halves of the filter field. Both draw with currentColor, so they
// take the field's colour rather than declaring one.
import SearchSvg from '../../../assets/budgetListControlsSvg/SearchSvg.svg?react';
import ClearSvg from '../../../assets/budgetListControlsSvg/ClearSvg.svg?react';
// Institution with an action badge: names what the empty state lacks rather than
// repeating the plus every other create control on this screen wears.
import OpenAccountSvg from '../../../assets/openAccountSvg.svg?react';
import Toast from '../../editionAndDeletion/components/toast/Toast';
import AccountActionsMenu from '../../editionAndDeletion/components/accountActionMenu/AccountActionsMenu';
import {
  AccountByTypeResponseType,
  AccountListType,
  CategoryBudgetAccountListType,
} from '../../types/responseApiTypes';
import { capitalize } from '../../helpers/functions';
import { isCategoryBudgetAccount } from '../../editionAndDeletion/utils/categoryBudgetCalculations';
import './styles/accountingDashboard-styles.css';

// Drawings and not emoji: an emoji renders in the OS emoji font, so it never
// takes the colour of the heading it sits in.
const ACCOUNT_TYPE_DATA = {
  bank: { Icon: BankAccountSvg, name: 'bank' },
  investment: { Icon: InvestmentAccountsSvg, name: 'investment' },
  debtor: { Icon: DebtsAccountsSvg, name: 'debtor' },
  category_budget: { Icon: ExpenseAccountsSvg, name: 'category_budget' },
  income_source: { Icon: IncomeAccountsSvg, name: 'income_source' },
  // No drawing of its own yet; borrows the debtor glyph.
  other: { Icon: DebtsAccountsSvg, name: 'other' },
};

const ACCOUNT_TYPE_DETAIL_PAGE: { [key: string]: string } = {
  bank: '/fintrack/overview/accounts',
  income_source: '/fintrack/overview/accounts',
  investment: '/fintrack/overview/accounts',
  debtor: '/fintrack/debts/debtors',
  category_budget: `/fintrack/budget/account`,
};

// Opens the account creation form from this board; both links pass previousRoute for its back link. The form
// offers bank, investment and income_source only (debtor and category_budget keep their own forms).
const OPEN_ACCOUNT_ROUTE = '/fintrack/overview/new_account';
type AccountType = keyof typeof ACCOUNT_TYPE_DATA;
type ToastMessageType = 'success' | 'error' | 'info' | 'warning';

// Strips accents and case so 'Café' matches 'cafe'; localeCompare's sensitivity
// option does this for sorting but has no substring equivalent.
const normalizeForSearch = (value: string): string =>
 value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const groupAccountsBytype = (
  accounts: AccountListType[],
): Partial<Record<AccountType, AccountListType[]>> => {
  const groups: Partial<Record<AccountType, AccountListType[]>> = {};

  accounts.forEach((account) => {
    const accountType = ACCOUNT_TYPE_DATA[
      account.account_type_name as AccountType
    ]
      ? (account.account_type_name as AccountType)
      : 'other';

    (groups[accountType] ||= []).push(account);
  });

  // Alphabetical, not by balance: a group can pass a hundred accounts, where name
  // order is the only navigable one. 'es' with base sensitivity keeps ñ and
  // á where a reader expects them, whatever the database collation.
  Object.values(groups).forEach((accountsOfType) =>
    accountsOfType?.sort((first, second) =>
      first.account_name.localeCompare(second.account_name, 'es', {
        sensitivity: 'base',
      }),
    ),
  );

  return groups;
};
const AccountingDashboard = () => {
  const location = useLocation();
  const navigateTo = useNavigate();

  const originRoute = location.state?.originRoute || INITIAL_PAGE_ADDRESS;

  // Return route handed to every destination screen. The acted-on account rides in
  // the query string, not location.state, because each destination forwards this
  // string verbatim into a <Link to> or navigateTo.
  const buildReturnRoute = (accountId: number | string) =>
    `${location.pathname}?focus=${accountId}`;

  // The card to come back to, read from the URL the destination sent us to.
  // A one-shot instruction, so it is not held in state.
  const focusedAccountId = new URLSearchParams(location.search).get('focus');

  const { apiData, isLoading, error } = useFetch<AccountByTypeResponseType>(
    `${url_get_all_accounting_accounts}`,
  );
  // Collapsed by default: the dashboard is an index of account types, and every
  // group open at once is a long scroll. A Set, not a record, so a type absent
  // from the inventory has no entry.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
   () => new Set(),
  );

  const toggleGroup = (accountType: string) => {
   setExpandedGroups((previous) => {
    const next = new Set(previous);

    if (next.has(accountType)) {
     next.delete(accountType);
    } else {
     next.add(accountType);
    }

    return next;
   });
  };
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    account: AccountListType | null;
  }>({ isOpen: false, account: null });
  const [toast, setToast] = useState<{
    message: string;
    type: ToastMessageType;
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  const showToast = useCallback(
    (message: string, type: ToastMessageType = 'info') => {
      setToast({ message, type, visible: true });
    },
    [],
  );

  const hideToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };
  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => {
        hideToast();
      }, 2500);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [toast.visible]);
  const groupResponseMessage = useMemo(
    () => ({
      error: `Error loading accounts:`,
      notFound: `No accounts found. Create first account! 🎯`,
    }),
    [],
  ); // stable reference: the effect below lists it as a dependency

  useEffect(() => {
    if (error) {
      console.log(error);
      showToast(`${groupResponseMessage.error} ${error}`, 'error');
    }

    // No loading toast: the skeleton already reports the wait, and a toast for
    // it fires on every mount and covers the jump button while it shows.

    if (apiData?.data.accountList.length === 0) {
      showToast(`${groupResponseMessage.notFound}`, 'warning');
    }
  }, [error, apiData, showToast, groupResponseMessage]);
  const getAccountTypeIconAndName = (accountType: AccountType) => {
    return ACCOUNT_TYPE_DATA[accountType] || ACCOUNT_TYPE_DATA['other'];
  };
  const formatAccountTypeName = (accountType: AccountType): string => {
    return capitalize(accountType.replace('_', ' '));
  };

  const groupedAccounts = useMemo(() => {
    if (!apiData?.data.accountList.length) {
      return {};
    }
    return groupAccountsBytype(apiData?.data?.accountList);
  }, [apiData?.data.accountList]);
  // Filtered client-side: the inventory already arrives whole in one payload, so
  // the filter costs no request and answers on the keystroke.
  const [searchTerm, setSearchTerm] = useState('');
  const searchQuery = normalizeForSearch(searchTerm.trim());

  const visibleGroups = useMemo(() => {
    if (!searchQuery) {
      return groupedAccounts;
    }

    const matches: Partial<Record<AccountType, AccountListType[]>> = {};

    Object.entries(groupedAccounts).forEach(([accountType, accounts]) => {
      const hits = accounts?.filter((account) =>
        normalizeForSearch(account.account_name).includes(searchQuery),
      );

      // A group with no hit is dropped rather than shown empty: the heading
      // would otherwise claim a type that matched nothing.
      if (hits?.length) {
        matches[accountType as AccountType] = hits;
      }
    });

    return matches;
  }, [groupedAccounts, searchQuery]);
  // The anchored card sits in a collapsed group, so the group must open before the
  // scroll effect below can find the card in the DOM.
  useEffect(() => {
   if (!focusedAccountId) {
    return;
   }

   const groupHoldingFocus = Object.entries(groupedAccounts).find(
    ([, accounts]) =>
     accounts?.some(
      (account) => String(account.account_id) === focusedAccountId,
     ),
   )?.[0];

   if (!groupHoldingFocus) {
    return;
   }

   // Returning the same Set when it already holds the group: a fresh one every
   // pass would re-render forever.
   setExpandedGroups((previous) =>
    previous.has(groupHoldingFocus)
     ? previous
     : new Set(previous).add(groupHoldingFocus),
   );
  }, [focusedAccountId, groupedAccounts]);
  // Brings the acted-on card into view and focuses it. Depends on groupedAccounts
  // (the card is not in the DOM until the inventory resolves) and on
  // expandedGroups (a collapsed group renders no card).
  useEffect(() => {
    if (!focusedAccountId || Object.keys(groupedAccounts).length === 0) {
      return;
    }

    const card = document.getElementById(`account-card-${focusedAccountId}`);
    if (!card) {
      return;
    }

    // No `behavior`: the default defers to the scrolling box (the document here),
    // where :root in index.css declares smooth with a reduced-motion override.
    card.scrollIntoView({ block: 'center' });
    // The card is a div; its trigger is the only focusable node inside it.
    card.querySelector('button')?.focus({ preventScroll: true });

    // Consume the anchor: a refresh must not scroll again, and the id is not
    // part of an address worth sharing.
    navigateTo(location.pathname, { replace: true, state: location.state });
  }, [
    focusedAccountId,
    groupedAccounts,
    expandedGroups,
    location.pathname,
    location.state,
    navigateTo,
  ]);
  const handleMenuClick = (
    account: AccountListType,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();

    setMenuState({
      isOpen: true,
      account,
    });

  };
  const handleCloseMenu = () => {
    setMenuState((prev) => ({ ...prev, isOpen: false }));
  };
  const handleViewRegularAccountDetail = (account: AccountListType) => {
    const baseRoute =
      ACCOUNT_TYPE_DETAIL_PAGE[account.account_type_name] ||
      '/fintrack/overview/accounts';

    const detailRoute = `${baseRoute}/${account.account_id}`;
    const returnRoute = buildReturnRoute(account.account_id);
    console.log('regular', { detailRoute }, { account }, { returnRoute });

    navigateTo(detailRoute, {
      state: { previousRoute: returnRoute, detailedData: account },
      viewTransition: true,
    });
  };
  const handleViewCategoryBudgetAccountDetail = (
    account: CategoryBudgetAccountListType,
  ) => {
    const categoryDetailRoute = `${ACCOUNT_TYPE_DETAIL_PAGE[account.account_type_name]}/${account.account_id}`;
    const returnRoute = buildReturnRoute(account.account_id);

    console.log(
      'categoryRoute',
      { categoryDetailRoute },
      { account },
      'id',
      account.account_id,
      { returnRoute },
    );

    navigateTo(categoryDetailRoute, {
      state: { detailedData: null, previousRoute: returnRoute },
      viewTransition: true,
    });
  };
  const handleViewDetails = (account: AccountListType) => {
    if (isCategoryBudgetAccount(account)) {
      handleViewCategoryBudgetAccountDetail(account);
    } else {
      handleViewRegularAccountDetail(account);
    }
  };
  const handleEditAccount = (account: AccountListType) => {
    const editRoute = `/fintrack/account/${account.account_id}/edit`;

    navigateTo(editRoute, {
      state: {
        accountData: account,
        previousRoute: buildReturnRoute(account.account_id),
        originRoute: originRoute,
      },
      viewTransition: true,
    });
  };
  const handleDeleteAccount = (account: AccountListType) => {
    const deleteAccountPage = `/fintrack/account/${account.account_id}/delete`;

    navigateTo(deleteAccountPage, {
      state: {
        accountData: account,
        previousRoute: buildReturnRoute(account.account_id),
        originRoute: originRoute,
      },
    });
  };

  const renderAccountGroups = () => {
    // Two different empty states: an inventory with nothing in it asks for an
    // account, a filter that matched nothing asks for another word.
    if (Object.keys(visibleGroups).length === 0 && !isLoading) {
      const isFiltered = Boolean(searchQuery);

      return (
        <div className='accounting-empty'>
          <div className='accounting-empty__emoji'>
            {isFiltered ? '🔎' : '📁'}
          </div>
          <h3 className='accounting-empty__title'>
            {isFiltered ? 'No matching accounts' : 'No Accounts Found'}
          </h3>
          <p className='accounting-empty__message'>
            {isFiltered
              ? `No account name contains "${searchTerm.trim()}".`
              : 'Get started by creating your first account to manage your finances.'}
          </p>

          {/* Only on the truly empty state: a filter that matched nothing needs
              another word, not a new account. Carries the same return route as
              the header control. */}
          {!isFiltered && (
            <Link
              to={OPEN_ACCOUNT_ROUTE}
              state={{ previousRoute: location.pathname }}
              className='accounting-empty__action'
            >
              <OpenAccountSvg className='accounting-empty__actionIcon' />
              Add account
            </Link>
          )}
        </div>
      );
    }
    return Object.entries(visibleGroups).map(([accountType, accounts]) => {
      const safeAccountType = accountType as AccountType;
      const accountTypeData = getAccountTypeIconAndName(safeAccountType);
      // A capitalised binding: JSX reads a lowercase tag as an HTML element, so
      // accountTypeData.Icon cannot be rendered where it stands.
      const AccountTypeIcon = accountTypeData.Icon;
      // Bound once so the heading's aria-controls and the grid's id cannot
      // drift apart.
      const gridId = `account-group-grid-${accountType}`;
      // A search opens every group it matched: leaving them shut would hide
      // the very rows the filter just selected.
      const isExpanded =
        Boolean(searchQuery) || expandedGroups.has(accountType);

      return (
        <div className='account-group' key={accountType}>
          <h3 className='account-group__title'>
           <button
            type='button'
            className={`account-group__toggle${isExpanded ? ' is-active' : ''}`}
            onClick={() => toggleGroup(accountType)}
            aria-expanded={isExpanded}
            aria-controls={gridId}
           >
            {/* Decorative: the button around it is what answers the click, so
                the frame still declares no state of its own. */}
            <span className='account-group__icon-frame'>
             <AccountTypeIcon
              className='account-group__icon'
              aria-hidden='true'
              focusable='false'
             />
            </span>

            <span className='account-group__name'>
             {formatAccountTypeName(accountTypeData.name as AccountType)}
            </span>

            {/* Size of the group, readable while it is collapsed. */}
            <span className='account-group__count'>{accounts!.length}</span>

            <ArrowDownLightSvg
             className='account-group__chevron'
             aria-hidden='true'
             focusable='false'
            />
           </button>
          </h3>

          <div
           className={`account-group__grid${
            isExpanded ? '' : ' account-group__grid--collapsed'
           }`}
           id={gridId}
          >
            {/* Not rendered while shut, rather than hidden with CSS: a hidden card
                is still found by id, so the return anchor would fire on one it
                can neither scroll to nor focus. */}
            {isExpanded &&
             accounts!.map((account) => (
              <div
                className='account-card'
                id={`account-card-${account.account_id}`}
                key={account.account_id}
              >
                <AccountingBox
                  title={account.account_name.toUpperCase()}
                  amount={account.account_balance}
                  currency={account.currency_code}
                  // Read from the same map that chose this card's group; the row's
                  // own type name would label an unmapped type by its first word
                  // (a retired pocket read "(Pocket)" under a heading of Other).
                  account_type={`(${capitalize(
                    ACCOUNT_TYPE_DATA[
                      account.account_type_name as AccountType
                    ]?.name ?? ACCOUNT_TYPE_DATA['other'].name,
                  )})`}
                  onMenuClick={(e) => handleMenuClick(account, e)}
                  isMenuOpen={
                    menuState.isOpen &&
                    menuState.account?.account_id === account.account_id
                  }
                />
              </div>
             ))}
          </div>
        </div>
      );
    });
  };

  return (
    <>
      {/* No TopWhiteSpace here: the top space is inside .accounting__stickyHead
          so the header docks from the first pixel instead of travelling to it. */}
      <section className='accounting__layout'>
        <div className='accounting__container'>
          {/* The title and the filter travel as one pinned box. Two sticky
              siblings would need the second offset by the first's height, and
              that height is not a constant. */}
          <div className='accounting__stickyHead'>
            {/* Three siblings, not one link wrapping the row: the create control cannot nest in the back
                link (anchor in anchor is invalid), so only the arrow links back. */}
            <div className='accounting__header'>
             <Link
              to={originRoute}
              className='backArrow backArrow--dark'
              aria-label='Back'
             >
              <LeftArrowSvg />
             </Link>

             <div className='accounting__title'>{'Accounting'}</div>

             {/* Icon only: the title is centred on the row, and a label here
                 would push it off centre at 360px. The same drawing the empty
                 state uses, so one mark carries one meaning on this screen. */}
             <Link
              to={OPEN_ACCOUNT_ROUTE}
              state={{ previousRoute: location.pathname }}
              className='accounting__openAccount'
              aria-label='Open a new account'
             >
              <OpenAccountSvg
               className='accounting__openAccount-glyph'
               aria-hidden='true'
               focusable='false'
              />

              {/* A node, not ::after with attr(data-tip): the pseudo-element never painted although :hover
                  did. aria-hidden because the aria-label above already says this. */}
              <span className='accounting__openAccount-tip' aria-hidden='true'>
               {'Open a new account'}
              </span>
             </Link>
            </div>

            {/* Always rendered: a field appearing past a threshold would shift every group down.
                type='text', not 'search', so the browser draws no second clear button beside ours. */}
            <div className='accountingSearch'>
              <SearchSvg
                className='accountingSearch__icon'
                aria-hidden='true'
                focusable='false'
              />
              <input
                type='text'
                className='accountingSearch__field'
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder='Search accounts'
                aria-label='Search accounts by name'
              />
              {searchTerm && (
                <button
                  type='button'
                  className='accountingSearch__clear'
                  onClick={() => setSearchTerm('')}
                  aria-label='Clear search'
                >
                  <ClearSvg
                    className='accountingSearch__clear-glyph'
                    aria-hidden='true'
                    focusable='false'
                  />
                </button>
              )}
            </div>
          </div>

          {renderAccountGroups()}
        </div>

        {/* Sits outside the container so its offsets are measured against the
            viewport and not against a column that is capped and centred. It
            unmounts itself when there is nothing to scroll. */}
        <ScrollJump subject='list' />

        <Toast
          message={toast.message}
          type={toast.type}
          visible={toast.visible}
          onClose={hideToast}
          duration={3000}
        />

        {menuState.isOpen && menuState.account && (
          <AccountActionsMenu
            accountName={menuState.account.account_name}
            isOpen={menuState.isOpen}
            onClose={handleCloseMenu}
            onViewDetails={() => handleViewDetails(menuState.account!)}
            onEditAccount={() => handleEditAccount(menuState.account!)}
            onDeleteAccount={() => {
              if (menuState.account) {
                handleDeleteAccount(menuState.account);
              }
            }}
          />
        )}
      </section>
    </>
  );
};

export default AccountingDashboard;

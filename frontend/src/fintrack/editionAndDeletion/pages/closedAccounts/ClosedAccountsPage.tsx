import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useClosedAccounts } from '../../hooks/useClosedAccounts.ts';
import { useLanguageTranslation } from '../../hooks/useLangTranslation.ts';
import {
 defaultLanguage,
 DictionaryDataType,
 isLanguageTypeValid,
 LanguageKeyType,
} from '../../utils/languages.ts';

import {
 ClosedAccountRowType,
 ClosedAccountSortKeyType,
} from '../../types/closedAccountsTypes.ts';

import { formatDateToDDMMYYYY } from '../../../helpers/functions.ts';

import { getAccountTypeIcon } from '../../utils/accountTypeIcons.ts';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg?react';
// Toolbar icons shared with the pocket module.
import SearchSvg from '../../../../assets/pocketSvg/SearchSvg.svg?react';
import SortDirectionSvg from '../../../../assets/pocketSvg/SortDirectionSvg.svg?react';

// Shared download control: it owns the menu and the in-flight flag; this page supplies the scope.
import ExportMenu from '../../../general_components/exportMenu/ExportMenu.tsx';
import { downloadClosedAccountsExport } from '../../../api/exportApi.ts';

import './closedAccounts.css';
import ClosedAccountsCountBadge from './ClosedAccountsCountBadge.tsx';

// Duplicated from AccountDeletionPage rather than imported: a page does not depend on a
// sibling page for a route.
const ACCOUNTING_DASHBOARD_ROUTE = '/fintrack/tracker/accounting';

// Closing an account deletes its `user_accounts` row in the transaction that writes `account_registry`,
// so this screen is the only place a closed account's name, reason and date are readable.
// Empty is two states (nothing closed, or no filter match); only the second offers a way back.

// The closable account types offered as filters. `boundary` is absent on purpose: the
// compensation account cannot be closed by any method (the engine refuses it with a 403),
// so filtering by it could only return nothing.
const FILTERABLE_ACCOUNT_TYPES = [
 'bank',
 'investment',
 'debtor',
 'category_budget',
 'income_source',
] as const;

const SORT_OPTIONS: {
 key: ClosedAccountSortKeyType;
 labelKey:
  | 'closedAccountsSortClosedAt'
  | 'closedAccountsSortName'
  | 'closedAccountsSortType'
  | 'closedAccountsSortCreatedAt';
}[] = [
 { key: 'closed_at', labelKey: 'closedAccountsSortClosedAt' },
 { key: 'account_name', labelKey: 'closedAccountsSortName' },
 { key: 'account_type_name', labelKey: 'closedAccountsSortType' },
 { key: 'account_created_at', labelKey: 'closedAccountsSortCreatedAt' },
];

// Fewer rows than the page size on purpose: five read as a list arriving, twenty as one
// already there.
const SKELETON_ROW_COUNT = 5;

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// Dictionary key per type so the pill is translated ("Banco", not "bank"); an unmapped
// type shows its raw name.
const ACCOUNT_TYPE_LABEL_KEYS: Record<string, keyof DictionaryDataType> = {
 bank: 'bank',
 cash: 'cash',
 investment: 'investment',
 debtor: 'debtor',
 category_budget: 'category_budget',
 income_source: 'income_source',
 pocket_saving: 'pocket_saving',
};

export const ClosedAccountsPage = () => {
 // The registry is opened from the profile menu, mounted on every screen, so the return
 // route is passed as router state by the caller; the fallback covers an arrival without
 // state (reload, pasted link) and matches the link at the foot of the page.
 const location = useLocation();
 const previousRoute =
  (location.state as { previousRoute?: string } | null)?.previousRoute ??
  ACCOUNTING_DASHBOARD_ROUTE;

 // Language persists in localStorage under 'userLang', as on the module's other screens;
 // an invalid stored value falls back to the default instead of throwing.
 const [language, setLanguage] = useState<LanguageKeyType>(defaultLanguage);

 useEffect(() => {
  const savedLang = localStorage.getItem('userLang');
  if (savedLang && isLanguageTypeValid(savedLang)) {
   setLanguage(savedLang);
  }
 }, []);

 const { translateText: t } = useLanguageTranslation(language);

 const searchFieldId = useId();
 const typeFieldId = useId();
 const sortFieldId = useId();
 const limitFieldId = useId();

 const {
  query,
  isFiltered,
  accountList,
  total,
  pageCount,
  isLoading,
  error,
  refetch,
  setSearch,
  setType,
  setSort,
  setOrder,
  setPage,
  setLimit,
  resetFilters,
 } = useClosedAccounts();

 // Amounts arrive as text and render as received. A missing one is a dash, never 0: an
 // account whose starting amount was never stamped did not start at nothing.
 const renderAmount = (row: ClosedAccountRowType) => {
  if (!row.accountStartingAmount) return '—';
  return row.currencyCode
   ? `${row.accountStartingAmount} ${row.currencyCode.toUpperCase()}`
   : row.accountStartingAmount;
 };

 const renderCategory = (row: ClosedAccountRowType) => {
  if (!row.categoryName) return '—';
  return row.subcategory
   ? `${row.categoryName} / ${row.subcategory}`
   : row.categoryName;
 };

 return (
  <main className='closed-accounts'>
   <header className='closed-accounts__header'>
    {/* Back arrow, out of flow at the left so the heading stays centred on the full width.
        It returns to where the reader came from; the link at the foot of the page always
        goes to the accounting dashboard. */}
    <div className='closed-accounts__title-row'>
     <Link
      to={previousRoute}
      viewTransition
      className='backArrow backArrow--dark'
      aria-label={t('closedAccountsBackButton')}
     >
      <LeftArrowLightSvg aria-hidden='true' />
     </Link>

     <h1 className='closed-accounts__title'>{t('closedAccountsPageTitle')}</h1>
    </div>

    <p className='closed-accounts__lede'>{t('closedAccountsLede')}</p>
   </header>

   <section className='closed-accounts__toolbar' aria-label={t('closedAccountsSearchLabel')}>
    <div className='closed-accounts__field closed-accounts__field--search'>
     <label className='closed-accounts__label' htmlFor={searchFieldId}>
      {t('closedAccountsSearchLabel')}
     </label>
     {/* Icon inside the field: the label already names the control. */}
     <span className='closed-accounts__input-wrap'>
      <SearchSvg className='closed-accounts__input-icon' aria-hidden='true' />
      <input
       id={searchFieldId}
       className='closed-accounts__input closed-accounts__input--with-icon'
       type='search'
       value={query.search}
       onChange={(event) => setSearch(event.target.value)}
       placeholder={t('closedAccountsSearchPlaceholder')}
      />
     </span>
    </div>

    <div className='closed-accounts__field closed-accounts__field--type'>
     <label className='closed-accounts__label' htmlFor={typeFieldId}>
      {t('closedAccountsTypeLabel')}
     </label>
     <select
      id={typeFieldId}
      className='closed-accounts__select'
      value={query.type}
      onChange={(event) => setType(event.target.value)}
     >
      <option value=''>{t('closedAccountsTypeAll')}</option>
      {FILTERABLE_ACCOUNT_TYPES.map((accountType) => (
       <option key={accountType} value={accountType}>
        {accountType.replace(/_/g, ' ')}
       </option>
      ))}
     </select>
    </div>

    {/* Beside the type filter so the two narrow fields share one row on a phone, and the
        sort key ends up next to the direction that modifies it. */}
    <div className='closed-accounts__field closed-accounts__field--limit'>
     <label className='closed-accounts__label' htmlFor={limitFieldId}>
      {t('closedAccountsPerPage')}
     </label>
     <select
      id={limitFieldId}
      className='closed-accounts__select'
      value={query.limit}
      onChange={(event) => setLimit(Number(event.target.value))}
     >
      {PAGE_SIZE_OPTIONS.map((size) => (
       <option key={size} value={size}>
        {size}
       </option>
      ))}
     </select>
    </div>

    {/* Sort key and direction are one decision, so one group. */}
    <div className='closed-accounts__field closed-accounts__field--sort'>
     <label className='closed-accounts__label' htmlFor={sortFieldId}>
      {t('closedAccountsSortLabel')}
     </label>
     <div className='closed-accounts__sort-row'>
      <select
       id={sortFieldId}
       className='closed-accounts__select'
       value={query.sort}
       onChange={(event) =>
        setSort(event.target.value as ClosedAccountSortKeyType)
       }
      >
       {SORT_OPTIONS.map((option) => (
        <option key={option.key} value={option.key}>
         {t(option.labelKey)}
        </option>
       ))}
      </select>

      {/* A button, not a second select: two states, and it shows which is active without
          an extra click. */}
      <button
       type='button'
       className='closed-accounts__order'
       onClick={() => setOrder(query.order === 'desc' ? 'asc' : 'desc')}
       // Visible text is the short DESC/ASC; the aria-label carries the full sentence for
       // screen readers, which cannot read an abbreviation.
       aria-label={`${t('closedAccountsOrderToggle')}: ${
        query.order === 'desc'
         ? t('closedAccountsOrderDesc')
         : t('closedAccountsOrderAsc')
       }`}
      >
       {/* One chevron rotated instead of two icons, so direction reads from orientation. */}
       <SortDirectionSvg
        className={`closed-accounts__order-icon${
         query.order === 'asc' ? ' is-ascending' : ''
        }`}
        aria-hidden='true'
       />
       <span className='closed-accounts__order-text' aria-hidden='true'>
        {query.order === 'desc'
         ? t('closedAccountsOrderDescShort')
         : t('closedAccountsOrderAscShort')}
       </span>
      </button>
     </div>
    </div>

    {/* The download carries the search, type filter and sort as they stand, so the file is
        the list on screen. The page size does not travel: the file holds every matching
        row, not the screenful being read. */}
    <div className='closed-accounts__export'>
     <ExportMenu
      subject='the closed-account registry'
      surface='dark'
      disabled={isLoading}
      onExport={(format) =>
       downloadClosedAccountsExport({
        format,
        search: query.search,
        type: query.type,
        sort: query.sort,
        order: query.order,
       })
      }
     />
    </div>
   </section>

   {/* Skeleton rows instead of a spinner, so the layout does not jump when data arrives. */}
   {isLoading && (
    <ul className='closed-accounts__list' aria-busy='true'>
     {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <li key={index} className='closed-accounts__row closed-accounts__row--skeleton'>
       <span className='closed-accounts__skeleton-bar' />
       <span className='closed-accounts__skeleton-bar closed-accounts__skeleton-bar--short' />
      </li>
     ))}
    </ul>
   )}

   {!isLoading && error && (
    <div className='closed-accounts__notice' role='alert'>
     <p className='closed-accounts__notice-message'>
      {t('closedAccountsErrorMessage')}
     </p>
     <button
      type='button'
      className='closed-accounts__notice-action'
      onClick={refetch}
     >
      {t('closedAccountsRetry')}
     </button>
    </div>
   )}

   {/* Two empty states: a filter that matched nothing offers a way back; an owner with no
       closures is told what the page is for. */}
   {!isLoading && !error && accountList.length === 0 && (
    <div className='closed-accounts__notice' role='status'>
     <p className='closed-accounts__notice-title'>
      {isFiltered
       ? t('closedAccountsNoMatchTitle')
       : t('closedAccountsEmptyTitle')}
     </p>
     <p className='closed-accounts__notice-message'>
      {isFiltered
       ? t('closedAccountsNoMatchMessage')
       : t('closedAccountsEmptyMessage')}
     </p>
     {isFiltered && (
      <button
       type='button'
       className='closed-accounts__notice-action'
       onClick={resetFilters}
      >
       {t('closedAccountsClearFilters')}
      </button>
     )}
    </div>
   )}

   {!isLoading && !error && accountList.length > 0 && (
     <ClosedAccountsCountBadge
       total={total}
       label={t('closedAccountsTotal')}
     />
   )}

   {/* A list, not a table: the same markup is a card on a phone and a row on a wide
       screen, and a table cannot stack without losing its headers. */}
   {!isLoading && !error && accountList.length > 0 && (
    <ul className='closed-accounts__list'>
     {accountList.map((row) => {
      const TypeIcon = getAccountTypeIcon(row.accountTypeName);

      return (
      <li key={row.accountId} className='closed-accounts__row'>
       <div className='closed-accounts__identity'>
        <span className='closed-accounts__badge' aria-hidden='true'>
         <TypeIcon className='closed-accounts__badge-icon' />
        </span>

        <span className='closed-accounts__identity-text'>
         <span
          className={`closed-accounts__name${
           row.accountName ? '' : ' closed-accounts__name--unknown'
          }`}
         >
          {row.accountName ?? t('closedAccountsNameUnknown')}
         </span>
         <span className='closed-accounts__type'>
          {row.accountTypeName
           ? ACCOUNT_TYPE_LABEL_KEYS[row.accountTypeName]
            ? t(ACCOUNT_TYPE_LABEL_KEYS[row.accountTypeName])
            : row.accountTypeName.replace(/_/g, ' ')
           : t('closedAccountsTypeUnknown')}
         </span>
        </span>
       </div>

       <dl className='closed-accounts__facts'>
        <div className='closed-accounts__fact'>
         <dt className='closed-accounts__fact-label'>
          {t('closedAccountsColumnClosedAt')}
         </dt>
         {/* The closing date is what every row is here for, so it alone gets weight. */}
         <dd className='closed-accounts__fact-value closed-accounts__fact-value--key'>
          {formatDateToDDMMYYYY(row.closedAt)}
         </dd>
        </div>

        <div className='closed-accounts__fact'>
         <dt className='closed-accounts__fact-label'>
          {t('closedAccountsColumnOpened')}
         </dt>
         <dd className='closed-accounts__fact-value'>
          {row.accountCreatedAt
           ? formatDateToDDMMYYYY(row.accountCreatedAt)
           : '—'}
         </dd>
        </div>

        <div className='closed-accounts__fact'>
         <dt className='closed-accounts__fact-label'>
          {t('closedAccountsColumnStartingAmount')}
         </dt>
         <dd className='closed-accounts__fact-value'>{renderAmount(row)}</dd>
        </div>

        {/* Only a category budget has a category, so other types omit the line instead of
            showing an empty one. */}
        {row.categoryName && (
         <div className='closed-accounts__fact'>
          <dt className='closed-accounts__fact-label'>
           {t('closedAccountsColumnCategory')}
          </dt>
          <dd className='closed-accounts__fact-value'>
           {renderCategory(row)}
          </dd>
         </div>
        )}
       </dl>

       <p className='closed-accounts__reason'>
        <span className='closed-accounts__fact-label'>
         {t('closedAccountsColumnReason')}
        </span>
        {row.closeReason}
       </p>
      </li>
      );
     })}
    </ul>
   )}

   {/* Not a duplicate of the header arrow: that returns to the screen the reader came from,
       this always goes to the accounting dashboard, which a reader who arrived from Budget
       has no other control to reach. Outside the pager, which hides itself on a single page. */}
   <Link
    to={ACCOUNTING_DASHBOARD_ROUTE}
    viewTransition
    className='closed-accounts__back'
   >
    {t('closedAccountsBackButton')}
   </Link>

   {/* Hidden on a single page rather than shown disabled: a control that can never act is noise. */}
   {!isLoading && !error && pageCount > 1 && (
    <footer className='closed-accounts__pager'>
     <div className='closed-accounts__pager-controls'>
      <button
       type='button'
       className='closed-accounts__page-button'
       onClick={() => setPage(query.page - 1)}
       disabled={query.page <= 1}
      >
       {t('closedAccountsPreviousPage')}
      </button>

      {/* The sentence is split on its placeholders so the two numbers can be bold and each
          language keeps its own word order. */}
      <span className='closed-accounts__page-status'>
       {t('closedAccountsPageStatus')
        .split(/(\{page\}|\{pageCount\})/)
        .map((part, index) =>
         part === '{page}' ? (
          <strong key={index}>{query.page}</strong>
         ) : part === '{pageCount}' ? (
          <strong key={index}>{pageCount}</strong>
         ) : (
          part
         ),
        )}
      </span>

      <button
       type='button'
       className='closed-accounts__page-button'
       onClick={() => setPage(query.page + 1)}
       disabled={query.page >= pageCount}
      >
       {t('closedAccountsNextPage')}
      </button>
     </div>
    </footer>
   )}
  </main>
 );
};

export default ClosedAccountsPage;

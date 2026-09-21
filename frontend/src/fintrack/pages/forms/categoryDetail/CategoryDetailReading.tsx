// Budget's account screen: CategoryDetail.tsx without the record card, kept separate so the two can diverge.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import AccountBalanceSummary from '../accountDetailSharedComponents/accountBalanceSummary/AccountBalanceSummary.tsx';
import AccountTransactionsList from '../accountDetailSharedComponents/accountTransactionsList/AccountTransactionsList.tsx';
import AccountEditLink from '../../../general_components/accountEditLink/AccountEditLink.tsx';
import SummaryDetailBox from '../accountDetailSharedComponents/summaryDetailBox/SummaryDetailBox.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import MonthPicker from '../../../general_components/monthPicker/MonthPicker.tsx';

import { AccountTransactionDetailModal } from '../accountDetailSharedComponents/accountTransactionDetailModal/AccountTransactionDetailModal.tsx';
import BudgetEditModal from '../../budget/components/budgetEditModal/BudgetEditModal.tsx';

// '?react': a bare .svg import is typed `string` and cannot take a className.
import EditSvg from '../../../../assets/pencil02Svg.svg?react';

import { setCurrentBudget } from '../../../api/budgetApi.ts';
import { normalizeBudgetError } from '../../../helpers/normalizeBudgetError.ts';
import {
  BudgetErrorResponse,
  BudgetWriteRequest,
} from '../../../types/budgetTypes.ts';
import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { useCurrencyStore } from '../../../stores/useCurrencyStore.ts';
import { useFetch } from '../../../hooks/useFetch.ts';
import { useTransactionDetail } from '../../../hooks/useTransactionDetail.ts';
import {
  url_get_account_by_id,
  url_get_transactions_by_account_id,
} from '../../../../urlConfig.ts';

import {
  CategoryBudgetAccountsResponseType,
  TransactionsAccountApiResponseType,
} from '../../../types/responseApiTypes.ts';

import {
  capitalize,
  formatDateToDDMMYYYY,
  withMonthParam,
} from '../../../helpers/functions.ts';

import '../styles/forms-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';
import './styles/categoryDetail-styles.css';

import '../accountDetailSharedComponents/accountTransactionsList/styles/accountDetailPeriodInfo-styles.css';

// Feature flag: the budget pencil is hidden while the account editor is the single
// write path for a budget. Restoring it also needs the `dark` modifier on the
// button, since its box is no longer the cream panel its colours assume.
const SHOW_BUDGET_PENCIL = false;

function CategoryDetailReading() {
  const { accountId: rawAccountId, categoryName } = useParams<{
    accountId?: string;
    categoryName?: string;
  }>();
  const accountId = (rawAccountId || '').trim();
  if (!accountId) {
    throw new Error('Invalid account ID parameter');
  }
  const location = useLocation();
  const state = location.state ?? {};
  const { previousRoute: previousRouteFromState } = state;

  const previousRoute =
    previousRouteFromState ??
    (categoryName
      ? `/fintrack/budget/category/${categoryName}`
      : '/fintrack/budget');

  const budgetAccounts = useBudgetStatusStore((state) => state.accounts);
  const referenceMonth = useBudgetStatusStore((state) => state.referenceMonth);
  const currentMonth = useBudgetStatusStore((state) => state.currentMonth);
  const isLoadingStatus = useBudgetStatusStore((state) => state.isLoading);
  const errorStatus = useBudgetStatusStore((state) => state.error);
  const fetchStatus = useBudgetStatusStore((state) => state.fetchStatus);
  const refreshStatus = useBudgetStatusStore((state) => state.refreshStatus);

  // Read from this screen's own URL: the route sits beside the budget layout, so
  // no mounted parent supplies a month.
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  // The picker writes the month into the URL; `replace` keeps month browsing from
  // stacking history entries.
  const selectMonth = useCallback(
    (month: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('month', month);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Either entry point can be the first screen of the session. The store's
  // guard makes this a no-op when the month is already loaded.
  useEffect(() => {
    fetchStatus(monthParam ?? undefined);
  }, [fetchStatus, monthParam]);

  const rates = useCurrencyStore((state) => state.rates);
  const fetchRates = useCurrencyStore((state) => state.fetchRates);

  useEffect(() => {
    if (Object.keys(rates).length === 0) fetchRates();
  }, [rates, fetchRates]);

  const budgetAccount = useMemo(
    () =>
      budgetAccounts.find(
        (account) => String(account.accountId) === accountId,
      ) ?? null,
    [budgetAccounts, accountId],
  );
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<BudgetErrorResponse | null>(null);

  const canEdit =
    SHOW_BUDGET_PENCIL &&
    referenceMonth !== null &&
    currentMonth !== null &&
    referenceMonth >= currentMonth;

  const closeEditor = () => {
    setIsEditingBudget(false);
    setSaveError(null);
  };

  const handleSaveBudget = async ({
    amount,
    currency,
    month,
    appliesUntil,
  }: BudgetWriteRequest) => {
    if (!budgetAccount) return null;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await setCurrentBudget(budgetAccount.accountId, {
        amount,
        currency,
        month,
        appliesUntil,
      });

      await refreshStatus();

      return response;
    } catch (err: unknown) {
      setSaveError(normalizeBudgetError(err));
      return null;
    } finally {
      setIsSaving(false);
    }
  };
  const urlAccountById = `${url_get_account_by_id}/${accountId}`;

  const {
    apiData: accountsDataFromFetch,
    isLoading: isLoadingAccount,
    error: errorAccount,
  } = useFetch<CategoryBudgetAccountsResponseType>(urlAccountById);

  const accountRecord = accountsDataFromFetch?.data?.accountList[0];

  // Floor for the month picker. Parsed by parts, never via new Date on a string:
  // an ISO midnight is the previous day west of Greenwich, and on the 1st that is
  // the previous month. Null only means the record has not loaded yet.
  const accountStartMonth = (() => {
    const raw = accountRecord?.account_start_date;
    if (!raw) return null;

    if (typeof raw === 'string') return raw.slice(0, 7);

    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}`;
  })();
  const summaryData = budgetAccount
    ? {
        title: 'Budget',
        amount: budgetAccount.budgetAmount,
        subtitle1: 'Spent',
        amount1: budgetAccount.actualSpent,
        status: budgetAccount.isOverBudget,
        amount2: budgetAccount.remainingBudget,
        currency_code: budgetAccount.currency,
        executionPercentage: budgetAccount.executionPercentage,
      }
    : null;
  const month = referenceMonth ? referenceMonth.slice(0, 7) : null;
  const urlTransactionsAccountById = month
    ? `${url_get_transactions_by_account_id}/${accountId}/?month=${month}`
    : null;

  const {
    apiData: transactionAccountApiResponse,
    isLoading: isLoadingTransactions,
    error: errorTransactions,
  } = useFetch<TransactionsAccountApiResponseType>(urlTransactionsAccountById);

  const transactions = transactionAccountApiResponse?.data.transactions ?? [];

  const {
    selectedTransaction,
    isLoading: isLoadingTransactionDetail,
    openTransaction,
    closeTransaction,
  } = useTransactionDetail();

  const summaryAccountBalance =
    transactionAccountApiResponse?.data.summary ?? null;

  const isLoading = isLoadingStatus || isLoadingAccount || isLoadingTransactions;
  const error = errorStatus ?? errorAccount ?? errorTransactions;
  return (
    <>
      <section className='page__container page__container--budget'>
        <TopWhiteSpace variant={'dark'} />

        <div className='budgetDetail__content'>
          <div className='page__content'>
            <div className='main__title--container'>
              <Link
                to={withMonthParam(previousRoute, monthParam)}
                relative='path'
                className='backArrow backArrow--dark'
              >
                <LeftArrowLightSvg />
              </Link>

              <div className='form__title form__title--recordName'>
                {capitalize(
                  budgetAccount?.accountName ?? accountRecord?.account_name
                )}
              </div>

              {accountId && (
                <AccountEditLink
                  accountId={accountId}
                  returnRoute={`${location.pathname}${location.search}`}
                  accountName={String(
                    budgetAccount?.accountName ?? accountRecord?.account_name ?? '',
                  )}
                  originRoute={previousRoute}
                />
              )}
            </div>
          </div>

          <MonthPicker
            month={referenceMonth}
            currentMonth={currentMonth}
            minMonth={accountStartMonth}
            surface='dark'
            onSelect={selectMonth}
          />

          {summaryData && budgetAccount && (
            <div className='budgetDetail__summary'>
              <SummaryDetailBox
                bubleInfo={summaryData}
                surface='dark'
                // Absent, not hidden, in a past month: a control that can only
                // refuse is noise, and the title comes first so nothing shifts.
                action={
                  canEdit ? (
                    <button
                      type='button'
                      className='budgetDetail__editBudget'
                      onClick={() => setIsEditingBudget(true)}
                      aria-label={`Edit budget for ${budgetAccount.subcategory ?? budgetAccount.accountName}`}
                      title='Edit budget'
                    >
                      <EditSvg />
                    </button>
                  ) : undefined
                }
              />

              {budgetAccount.nextMonthBudget !== budgetAccount.budgetAmount && (
                <div className='budgetDetail__summaryActions'>
                  <span
                    className='budgetDetail__exception'
                    title='This amount applies to this month only'
                  >
                    this month only
                  </span>
                </div>
              )}
            </div>
          )}

          <article className='form__box'>
            <div
              className='account-transactions__container '
              style={{ margin: '1rem 0' }}
            >
              {summaryAccountBalance && (
                <>
                  <div className='period-info'>
                    <div className='period-info__label'>Period</div>
                    <span className='period-info__dates  '>
                      {formatDateToDDMMYYYY(
                        summaryAccountBalance.periodStartDate
                      )}
                      {'  '} / {'  '}{' '}
                      {formatDateToDDMMYYYY(summaryAccountBalance.periodEndDate)}
                    </span>
                  </div>

                  <AccountBalanceSummary
                    summaryAccountBalance={summaryAccountBalance}
                  />
                </>
              )}

              <div className='presentation__card__title__container '>
                <CardTitle>{'Last Movements'}</CardTitle>
              </div>

              {isLoading && <CoinSpinner />}

              {!isLoading && !error && transactions.length === 0 && (
                <p className='box__subtitle box__subtitle--message'>
                  No transactions in this account for the period.
                </p>
              )}

              {!isLoading && !error && transactions.length > 0 && (
                <AccountTransactionsList
                  transactions={transactions}
                  onTransactionClick={openTransaction}
                  monthBudget={budgetAccount?.budgetAmount}
                />
              )}
            </div>
          </article>

          {!isLoading && error && (
            <p className='box__subtitle box__subtitle--message'>
              Error fetching account info: {error}
            </p>
          )}
        </div>
      </section>

      {isLoadingTransactionDetail && <CoinSpinner />}

      <AccountTransactionDetailModal
        transaction={selectedTransaction}
        onClose={closeTransaction}
      />

      {isEditingBudget && budgetAccount && (
        <BudgetEditModal
          accountName={budgetAccount.subcategory ?? budgetAccount.accountName}
          nature={budgetAccount.nature}
          month={referenceMonth ?? ''}
          currency={budgetAccount.currency}
          currentAmount={budgetAccount.budgetAmount}
          nextMonthBudget={budgetAccount.nextMonthBudget}
          actualSpent={budgetAccount.actualSpent}
          remainingBudget={budgetAccount.remainingBudget}
          executionPercentage={budgetAccount.executionPercentage}
          isOverBudget={budgetAccount.isOverBudget}
          isSaving={isSaving}
          error={saveError}
          onClose={closeEditor}
          onSave={handleSaveBudget}
        />
      )}
    </>
  );
}

export default CategoryDetailReading;

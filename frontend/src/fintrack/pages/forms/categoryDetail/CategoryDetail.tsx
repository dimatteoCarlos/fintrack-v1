import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import AccountBalanceSummary from '../accountDetailSharedComponents/accountBalanceSummary/AccountBalanceSummary.tsx';
import AccountTransactionsList from '../accountDetailSharedComponents/accountTransactionsList/AccountTransactionsList.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import AccountEditLink from '../../../general_components/accountEditLink/AccountEditLink.tsx';
import SummaryDetailBox from '../accountDetailSharedComponents/summaryDetailBox/SummaryDetailBox.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import MonthPicker from '../../../general_components/monthPicker/MonthPicker.tsx';

import { AccountTransactionDetailModal } from '../accountDetailSharedComponents/accountTransactionDetailModal/AccountTransactionDetailModal.tsx';
import BudgetEditModal from '../../budget/components/budgetEditModal/BudgetEditModal.tsx';

// '?react' and not a bare import: a bare .svg is typed `string` and cannot take a
// className. The glyph is the app's generic edit icon.
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
  currencyFormat,
  formatDateToDDMMYYYY,
  withMonthParam,
} from '../../../helpers/functions.ts';

import { DEFAULT_CURRENCY, VARIANT_FORM } from '../../../helpers/constants.ts';

import '../styles/forms-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';
import './styles/categoryDetail-styles.css';

import '../accountDetailSharedComponents/accountTransactionsList/styles/accountDetailPeriodInfo-styles.css';

// Feature flag: the budget pencil stays wired but hidden while the account editor
// is the single write path for a budget. To restore it, set true and give the
// button the `dark` modifier, since the surrounding box is no longer the cream panel.
const SHOW_BUDGET_PENCIL = false;

function CategoryDetail() {
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

  // Read from the module's payload, never rebuilt here: this screen has two entry
  // points (the category list and the accounting dashboard) and the second
  // arrives with nothing in location.state.
  const budgetAccounts = useBudgetStatusStore((state) => state.accounts);
  const referenceMonth = useBudgetStatusStore((state) => state.referenceMonth);
  const currentMonth = useBudgetStatusStore((state) => state.currentMonth);
  const isLoadingStatus = useBudgetStatusStore((state) => state.isLoading);
  const errorStatus = useBudgetStatusStore((state) => state.error);
  const fetchStatus = useBudgetStatusStore((state) => state.fetchStatus);
  const refreshStatus = useBudgetStatusStore((state) => state.refreshStatus);

  // Read from this screen's own URL: this route is declared beside the budget
  // layout, so nothing above it is still mounted to inherit a month from.
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  // The picker writes the month into the URL and the effect below reads it back.
  // replace, so browsing five months does not bury the previous screen under
  // five history entries.
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

  // CurrencyInitializer is mounted inside <Layout /> and this route is declared
  // beside it, so on a reload nothing has asked for the rates when this screen
  // renders; without them the editor's conversion preview resolves to null.
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
  // A boolean and not an id: this screen holds one account, so the flag has no
  // row to name.
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // The whole envelope, not a sentence: the modal puts each issue beside the
  // field it names, and a 400's own message is the constant 'Validation Error'.
  const [saveError, setSaveError] = useState<BudgetErrorResponse | null>(null);

  // 'YYYY-MM-01' text on both sides, so >= compares them correctly; no new Date(),
  // which parses as UTC midnight and shows the previous month west of Greenwich.
  // The server accepts writing a past month; this is what refuses to offer it.
  const canEdit =
    SHOW_BUDGET_PENCIL &&
    referenceMonth !== null &&
    currentMonth !== null &&
    referenceMonth >= currentMonth;

  const closeEditor = () => {
    setIsEditingBudget(false);
    setSaveError(null);
  };

  // Does NOT close the modal on success: the modal is what decides whether
  // there is a confirmation to render, and closing here makes that unreachable.
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
  // The budget contract carries figures, not the account record: this request
  // exists only for the account type and the opening date, which are not budget
  // facts.
  const urlAccountById = `${url_get_account_by_id}/${accountId}`;

  const {
    apiData: accountsDataFromFetch,
    isLoading: isLoadingAccount,
    error: errorAccount,
  } = useFetch<CategoryBudgetAccountsResponseType>(urlAccountById);

  const accountRecord = accountsDataFromFetch?.data?.accountList[0];

  const currency_code =
    budgetAccount?.currency ?? accountRecord?.currency_code ?? DEFAULT_CURRENCY;

  // The account cannot report a month it did not exist in. Parsed by parts, not new Date on a
  // string: an ISO midnight is the previous day west of Greenwich. Null means the record is pending.
  const accountStartMonth = (() => {
    const raw = accountRecord?.account_start_date;
    if (!raw) return null;

    if (typeof raw === 'string') return raw.slice(0, 7);

    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}`;
  })();
  // Withheld rather than zeroed while the payload is still on the wire: a
  // budget that has not arrived is not a budget of zero.
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
  // The month the figures above are about, resolved by the server on the owner's
  // calendar. Null until the payload lands, so the request waits: with no month
  // the endpoint falls back to a two-month window from its own clock.
  const month = referenceMonth ? referenceMonth.slice(0, 7) : null;
  const urlTransactionsAccountById = month
    ? `${url_get_transactions_by_account_id}/${accountId}/?month=${month}`
    : null;

  const {
    apiData: transactionAccountApiResponse, //{status, message, data}
    isLoading: isLoadingTransactions,
    error: errorTransactions,
  } = useFetch<TransactionsAccountApiResponseType>(urlTransactionsAccountById);

  const transactions = transactionAccountApiResponse?.data.transactions ?? [];

  // Owned here and not in the list, which is shared by other screens that must
  // stay presentational.
  const {
    selectedTransaction,
    isLoading: isLoadingTransactionDetail,
    openTransaction,
    closeTransaction,
  } = useTransactionDetail();

  // Null, not a zeroed shape: the period line and the balance pair are
  // withheld until the answer lands rather than stating a balance of 0 on a
  // period of ''.
  const summaryAccountBalance =
    transactionAccountApiResponse?.data.summary ?? null;

  const isLoading = isLoadingStatus || isLoadingAccount || isLoadingTransactions;
  const error = errorStatus ?? errorAccount ?? errorTransactions;
  return (
    <>
      <section className='page__container page__container--budget'>
        <TopWhiteSpace variant={'dark'} />

        {/* The column that puts this screen's rows at the same x as level 1's.
            The spacer above stays outside it. */}
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

              {/* The month lives in the query string, so the return address
                  carries it: coming back without it would drop the month the
                  user was looking at. */}
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

          {/* The month is a control here, not a label: it writes the URL and the
              effect refetches. Dark, because it lands on the app surface. The
              picker renders its own skeleton while the answer is in flight. */}
          <MonthPicker
            month={referenceMonth}
            currentMonth={currentMonth}
            minMonth={accountStartMonth}
            surface='dark'
            onSelect={selectMonth}
          />

          {/* The control sits in the box's title row: it acts on the word 'Budget',
              and a button under the panel would not say which figure it edits. The
              marker stays below as a caption qualifying the amount. */}
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
            <div className='form__container'>
              <div className='input__box'>
                {/* The balance at the close of the month being reported, not
                    today's. The month is selectable now, and a figure that
                    ignores it states another month's fact under this one. */}
                <label className='label forms__label'>
                  {summaryAccountBalance
                    ? `Balance (${formatDateToDDMMYYYY(
                        summaryAccountBalance.finalBalance.date,
                      )})`
                    : 'Balance'}
                </label>

                <div className='input__container' style={{ padding: '0.5rem' }}>
                  {/* A dash and not a zero: a balance still on the wire is not
                      a balance of nothing. */}
                  {summaryAccountBalance
                    ? currencyFormat(
                        currency_code,
                        summaryAccountBalance.finalBalance.amount,
                      )
                    : '—'}
                </div>
              </div>

              <div className='input__box'>
                <label className='label forms__label'>{'Account Type'}</label>

                <p className='input__container' style={{ padding: '0.5rem' }}>
                  {accountRecord?.account_type_name}
                </p>
              </div>

              <div className='account__dateAndCurrency'>
                <div className='account__date'>
                  <label className='label forms__label'>
                    {'Starting Point'}
                  </label>
                  <div
                    className='form__datepicker__container'
                    style={{ textAlign: 'center', color: 'white' }}
                  >
                    {formatDateToDDMMYYYY(accountRecord?.account_start_date)}
                  </div>
                </div>

                <div className='account__currency'>
                  <div className='label forms__label'>{'Currency'}</div>

                  <CurrencyBadge
                    variant={VARIANT_FORM}
                    currency={currency_code}
                  />
                </div>
              </div>
            </div>

            <div
              className='account-transactions__container '
              style={{ margin: '1rem 0' }}
            >
              {/* The month the budget figures above are about, as the server
                  bounded it on the owner's calendar. */}
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

              {/* Loading, error and empty are three states: a month still on the
                  wire is not a month without movements. */}
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

      {/* Shows the request is in flight: a click with no feedback reads as a
          dead row. */}
      {isLoadingTransactionDetail && <CoinSpinner />}

      <AccountTransactionDetailModal
        transaction={selectedTransaction}
        onClose={closeTransaction}
      />

      {/* Mounted outside <section>: the board is a frame with its own scroll,
          and a panel inside it would scroll with the list instead of over it. */}
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

export default CategoryDetail;

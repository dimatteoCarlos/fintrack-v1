import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import MonthPicker from '../../../general_components/monthPicker/MonthPicker.tsx';
import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import AccountEditLink from '../../../general_components/accountEditLink/AccountEditLink.tsx';
import { CardTitle } from '../../../general_components/CardTitle.tsx';

import { DEFAULT_CURRENCY, VARIANT_FORM } from '../../../helpers/constants.ts';
import {
  AccountByTypeResponseType,
  AccountListType,
  AccountSummaryBalanceType,
  AccountTransactionType,
  DebtorListType,
  TransactionsAccountApiResponseType,
} from '../../../types/responseApiTypes.ts';
import {
  url_get_account_by_id,
  url_get_transactions_by_account_id,
} from '../../../../urlConfig.ts';
import { useFetch } from '../../../hooks/useFetch.ts';
import {
  capitalize,
  formatDateToDDMMYYYY,
  numberFormatCurrency,
  toCalendarDay,
} from '../../../helpers/functions.ts';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import AccountBalanceSummary from '../accountDetailSharedComponents/accountBalanceSummary/AccountBalanceSummary.tsx';
import AccountTransactionsList from '../accountDetailSharedComponents/accountTransactionsList/AccountTransactionsList.tsx';
import SummaryDebtorDetailBox from './summaryDebtorDetailBox/SummaryDebtorDetailBox.tsx';
import { AccountTransactionDetailModal } from '../accountDetailSharedComponents/accountTransactionDetailModal/AccountTransactionDetailModal.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import { useTransactionDetail } from '../../../hooks/useTransactionDetail.ts';

import '../styles/forms-styles.css';
import '../accountDetailSharedComponents/accountTransactionsList/styles/accountDetailPeriodInfo-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';
import './styles/debtorDetail-styles.css';

type LocationStateType = {
  previousRoute: string;
  debtorDetailedData: DebtorListType;
};

// Placeholder for a figure or date the answer did not carry; never a fabricated value.
const DASH = '—';

// Rebuilds the list row from the account detail so a direct load has real data. Direction is
// read off the balance sign (GET /account/:accountId serves no debt position): positive is a
// receivable, negative a payable (kept negative), zero settled.
function getBubleInfoFromAccountDetail(
  accountDetail: AccountListType,
): DebtorListType {
  const balance = accountDetail.account_balance;

  return {
    account_name: accountDetail.account_name,
    account_id: accountDetail.account_id,
    currency_code: accountDetail.currency_code,
    total_debt_balance: balance,
    debt_receivable: balance > 0 ? balance : 0,
    debt_payable: balance < 0 ? balance : 0,
    creditor: balance < 0 ? 1 : 0,
    debtor: balance > 0 ? 1 : 0,
  };
}

function DebtorDetail() {
  const location = useLocation();
  const state = location.state as LocationStateType | null;
  const debtorDetailedData = state?.debtorDetailedData;
  // Where the back arrow and the editor return to: the list sends it in link state;
  // a direct load falls back to the canonical list URL.
  const previousRoute = state?.previousRoute ?? '/fintrack/debts/debtors';
  const { debtorId: accountId } = useParams();

  const urlAccountById = `${url_get_account_by_id}/${accountId}`;

  const {
    apiData: accountsData,
    isLoading,
    error,
    status,
    refetch,
  } = useFetch<AccountByTypeResponseType>(urlAccountById);

  // Sending the month makes the server resolve it on the account owner's calendar, not the
  // device's. Held in the URL because state would not survive the editor/back-arrow round trip.
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  const selectMonth = (month: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('month', month);
    // replace: browsing months must not stack history entries.
    setSearchParams(nextParams, { replace: true });
  };

  // The device clock picks only which month is requested; the server sets its boundaries.
  // Residual: an owner in a distant zone can be a day off at a month's edge.
  const currentMonth = toCalendarDay(new Date()).slice(0, 7);
  const reportedMonth = monthParam ?? currentMonth;

  const urlTransactionsAccountById = `${url_get_transactions_by_account_id}/${accountId}/?month=${reportedMonth}`;

  const {
    apiData: transactionAccountApiResponse,
    isLoading: isLoadingTransactions,
    error: errorTransactions,
    status: statusTransactions,
    refetch: refetchTransactions,
  } = useFetch<TransactionsAccountApiResponseType>(urlTransactionsAccountById);

  // Read straight from the answers, never seeded or copied into state: a sample
  // account would stand as the debtor after a failed fetch, and a copy adds a render
  // between an answer arriving and the copy updating.
  const accountDetail: AccountListType | null =
    accountsData?.data?.accountList?.[0] ?? null;

  // The list's row from link state paints the bubble until the account answers; null
  // on a direct load or refresh, where the fetch is the only source.
  const bubleInfo: DebtorListType | null = accountDetail
    ? getBubleInfoFromAccountDetail(accountDetail)
    : debtorDetailedData ?? null;

  // null is "no answer yet"; an empty array is "the window holds no movement".
  const statementData = transactionAccountApiResponse?.data ?? null;
  const transactions: AccountTransactionType[] | null =
    statementData?.transactions ?? null;
  const summaryAccountBalance: AccountSummaryBalanceType | null =
    statementData?.summary ?? null;

  // Owned here, not in the list: the list is presentational and shared by the other
  // detail screens.
  const {
    selectedTransaction,
    isLoading: isLoadingTransactionDetail,
    openTransaction,
    closeTransaction,
  } = useTransactionDetail();

  // The hook starts idle and raises isLoading inside its effect, so a status or an
  // error is what says an answer has actually come back.
  const hasAccountAnswer = status !== null || error !== null;

  // A 404 means the debtor is gone (deleted here or in another tab): its own state,
  // not an empty screen.
  const isAccountMissing = status === 404;
  const hasAccountFailed = Boolean(error) && !isAccountMissing;
  const isAccountPending =
    !isAccountMissing && !hasAccountFailed && (isLoading || !hasAccountAnswer);

  const hasStatementAnswer =
    statusTransactions !== null || errorTransactions !== null;
  const hasStatementFailed = Boolean(errorTransactions);
  const isStatementPending =
    !hasStatementFailed && (isLoadingTransactions || !hasStatementAnswer);

  // Also the last branch of each chain below: an answer carrying no account or no
  // statement is a failure, so the screen says so instead of showing a skeleton
  // that never resolves.
  const accountErrorPanel = (
    <article className='form__box debtorDetail__state'>
      <p className='debtorDetail__stateText'>
        This debtor could not be loaded.
      </p>

      <button type='button' className='debtorDetail__retry' onClick={refetch}>
        Try again
      </button>
    </article>
  );

  const statementErrorPanel = (
    <div className='debtorDetail__state'>
      <p className='debtorDetail__stateText'>
        The statement could not be loaded.
      </p>

      <button
        type='button'
        className='debtorDetail__retry'
        onClick={refetchTransactions}
      >
        Try again
      </button>
    </div>
  );

  return (
    <>
      <section className='page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          <div className='main__title--container '>
            {/* The glyph-only link needs a name; "Go back" and not the destination,
                because previousRoute is whatever the caller handed over. */}
            <Link
              to={previousRoute}
              relative='path'
              className='backArrow backArrow--dark'
              aria-label='Go back'
            >
              <LeftArrowLightSvg aria-hidden='true' />
            </Link>
            {/* The page's h1; every rule for this class selects the class, so the
                tag can be a heading without a visual change. */}
            <h1 className='form__title'>
              {/* No name for an account that is gone or failed to load: the screen
                  cannot state it. */}
              {bubleInfo && !isAccountMissing && !hasAccountFailed ? (
                String(bubleInfo.account_name).toUpperCase()
              ) : (
                <span
                  className='debtorDetail__skeletonBar debtorDetail__skeletonBar--title'
                  aria-hidden='true'
                ></span>
              )}
            </h1>
            {/* The editor returns to this card, not to the originating list; offered
                only once the account is known to exist. */}
            {accountId && accountDetail && (
              <AccountEditLink
                accountId={accountId}
                returnRoute={location.pathname}
                accountName={String(accountDetail.account_name)}
                originRoute={previousRoute}
              />
            )}
          </div>

          {isAccountMissing ? (
            <article className='form__box debtorDetail__state'>
              <p className='debtorDetail__stateText'>
                This debtor no longer exists. It may have been deleted from
                another screen.
              </p>

              <Link to={previousRoute} className='debtorDetail__stateLink'>
                Back to the debtor list
              </Link>
            </article>
          ) : hasAccountFailed ? (
            accountErrorPanel
          ) : isAccountPending ? (
            <article
              className='form__box debtorDetail__skeleton'
              aria-hidden='true'
            >
              <div className='debtorDetail__skeletonBar debtorDetail__skeletonBar--amount'></div>
              <div className='debtorDetail__skeletonBar'></div>
              <div className='debtorDetail__skeletonBar'></div>
              <div className='debtorDetail__skeletonBar debtorDetail__skeletonBar--wide'></div>
            </article>
          ) : !accountDetail || !bubleInfo ? (
            accountErrorPanel
          ) : (
            <>
              <SummaryDebtorDetailBox
                bubleInfo={bubleInfo}
              ></SummaryDebtorDetailBox>

              <article className='form__box'>
                <div className='form__container'>
                  <div className='input__box'>
                    <label className='label forms__label'>{`Current Balance`}</label>

                    <div
                      className='input__container'
                      style={{ padding: '0.5rem' }}
                    >
                      {numberFormatCurrency(accountDetail.account_balance)}
                    </div>
                  </div>

                  <div className='input__box'>
                    <label className='label forms__label'>
                      {'Account Type'}
                    </label>

                    <p
                      className='input__container'
                      style={{ padding: '0.5rem' }}
                    >
                      {capitalize(
                        accountDetail.account_type_name!.toLocaleString(),
                      )}
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
                        {/* The server's calendar label in the owner's zone, not the
                            raw instant: formatDateToDDMMYYYY reads UTC parts, which
                            shows the next day for an account opened in the evening. */}
                        {accountDetail.account_start_local_date
                          ? formatDateToDDMMYYYY(
                              accountDetail.account_start_local_date,
                            )
                          : DASH}
                      </div>
                    </div>

                    <div className='account__currency'>
                      <div className='label forms__label'>{'Currency'}</div>

                      <CurrencyBadge
                        variant={VARIANT_FORM}
                        currency={accountDetail.currency_code ?? DEFAULT_CURRENCY}
                      />
                    </div>
                  </div>
                </div>

                {/* Own three states: the statement is a second request and can fail
                    while the account itself is on screen. */}
                <div
                  className='account-transactions__container '
                  style={{ margin: '1rem 0' }}
                >
                  {/* Outside the three states so it stays on screen while a month loads.
                      Floor is the account's opening month; ceiling the current month. */}
                  <MonthPicker
                    month={`${reportedMonth}-01`}
                    currentMonth={`${currentMonth}-01`}
                    minMonth={
                      accountDetail?.account_start_local_date
                        ? String(accountDetail.account_start_local_date).slice(
                            0,
                            7,
                          )
                        : null
                    }
                    surface='dark'
                    onSelect={selectMonth}
                  />

                  {hasStatementFailed ? (
                    statementErrorPanel
                  ) : isStatementPending ? (
                    <div className='debtorDetail__skeleton' aria-hidden='true'>
                      <div className='debtorDetail__skeletonBar debtorDetail__skeletonBar--wide'></div>
                      <div className='debtorDetail__skeletonBar'></div>
                      <div className='debtorDetail__skeletonBar'></div>
                    </div>
                  ) : !summaryAccountBalance || !transactions ? (
                    statementErrorPanel
                  ) : (
                    <>
                      <div className='period-info'>
                        <div className='period-info__label'>Period</div>
                        <span className='period-info__dates  '>
                          {formatDateToDDMMYYYY(
                            summaryAccountBalance.periodStartDate,
                          )}
                          {'  '} / {'  '}{' '}
                          {formatDateToDDMMYYYY(
                            summaryAccountBalance.periodEndDate,
                          )}
                        </span>
                      </div>

                      <AccountBalanceSummary
                        summaryAccountBalance={summaryAccountBalance}
                      />

                      <div className='presentation__card__title__container '>
                        <CardTitle>{'Last Movements'}</CardTitle>
                      </div>

                      <AccountTransactionsList
                        transactions={transactions}
                        onTransactionClick={openTransaction}
                      />
                    </>
                  )}
                </div>
              </article>
            </>
          )}
        </div>
      </section>

      {/* Shown while the movement's detail loads; without it a click reads as a
          dead row. */}
      {isLoadingTransactionDetail && <CoinSpinner />}

      <AccountTransactionDetailModal
        transaction={selectedTransaction}
        onClose={closeTransaction}
      />
    </>
  );
}

export default DebtorDetail;

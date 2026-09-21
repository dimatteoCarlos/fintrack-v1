// Overview's own account screen: AccountDetail.tsx without the record card
// (balance, type, opening date, currency), kept as a separate component so the
// two screens can diverge independently.
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useFetch } from '../../../hooks/useFetch.ts';

import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import AccountEditLink from '../../../general_components/accountEditLink/AccountEditLink.tsx';
import MonthPicker from '../../../general_components/monthPicker/MonthPicker.tsx';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import AccountBalanceSummary from '../accountDetailSharedComponents/accountBalanceSummary/AccountBalanceSummary.tsx';
import AccountTransactionsList from '../accountDetailSharedComponents/accountTransactionsList/AccountTransactionsList.tsx';
import { AccountTransactionDetailModal } from '../accountDetailSharedComponents/accountTransactionDetailModal/AccountTransactionDetailModal.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import { useTransactionDetail } from '../../../hooks/useTransactionDetail.ts';

import { DEFAULT_ACCOUNT_TRANSACTIONS } from '../../../helpers/constants.ts';
import {
  capitalize,
  formatDateToDDMMYYYY,
  toCalendarDay,
} from '../../../helpers/functions.ts';

import {
  AccountByTypeResponseType,
  AccountListType,
  TransactionsAccountApiResponseType,
  AccountTransactionType,
  AccountSummaryBalanceType,
} from '../../../types/responseApiTypes.ts';

import {
  url_get_account_by_id,
  url_get_transactions_by_account_id,
} from '../../../../urlConfig.ts';

import '../styles/forms-styles.css';

import '../accountDetailSharedComponents/accountTransactionsList/styles/accountDetailPeriodInfo-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';

type LocationStateType = {
  previousRoute: string;
  detailedData: AccountListType;
};
// No placeholder account: a default object would print real-looking zeros for
// figures the server has not sent.
const initialAccountTransactionsData = DEFAULT_ACCOUNT_TRANSACTIONS['data'];
function OverviewAccountReading() {
  const location = useLocation();
  const { accountId } = useParams();
  const state = location.state as LocationStateType | null;
  const accountDetailedFromState = state?.detailedData;
  const previousRouteFromState = state?.previousRoute || '/fintrack/overview';

  const [previousRoute, setPreviousRoute] = useState<string>(
    previousRouteFromState,
  );

  // Nullable so the render can tell "answer not arrived" apart from data.
  const [accountDetail, setAccountDetail] = useState<AccountListType | null>(
    null,
  );

  const [transactions, setTransactions] = useState<AccountTransactionType[]>(
    initialAccountTransactionsData.transactions,
  );

  const [summaryAccountBalance, setSummaryAccountBalance] =
    useState<AccountSummaryBalanceType>(initialAccountTransactionsData.summary);
  // Always fetched by id, even when the account rides in location.state: the
  // list route serves only eight columns and the by-id route the whole row plus
  // derived fields, and a missing key looks like a field the owner never filled.
  const urlAccountById = `${url_get_account_by_id}/${accountId}`;

  const {
    apiData: accountsDataFromFetch,
    isLoading,
    error,
  } = useFetch<AccountByTypeResponseType>(urlAccountById);

  // The fetched account wins; the one in state is an optimistic first paint.
  const accountsData =
    accountsDataFromFetch?.data?.accountList[0] ?? accountDetailedFromState;

  // The statement endpoint resolves ?month= on the account owner's calendar, so
  // the period is a month control and not a window built from the device clock.
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  const selectMonth = (month: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('month', month);
    // replace, so browsing months does not stack history entries.
    setSearchParams(nextParams, { replace: true });
  };

  const currentMonth = toCalendarDay(new Date()).slice(0, 7);
  const reportedMonth = monthParam ?? currentMonth;

  const urlTransactionsAccountById = `${url_get_transactions_by_account_id}/${accountId}/?month=${reportedMonth}`;

  const {
    apiData: transactionAccountApiResponse,
    isLoading: isLoadingTransactions,
    error: errorTransactions,
  } = useFetch<TransactionsAccountApiResponseType>(urlTransactionsAccountById);
  useEffect(() => {
    if (transactionAccountApiResponse?.data.transactions) {
      setTransactions(transactionAccountApiResponse?.data.transactions);
      setSummaryAccountBalance(transactionAccountApiResponse?.data.summary);
    }
  }, [transactionAccountApiResponse]);
  useEffect(() => {
    if (accountsData) {
      setAccountDetail(accountsData);
      setPreviousRoute(previousRouteFromState);
    }
  }, [accountsData, previousRouteFromState]);

  const {
    selectedTransaction,
    isLoading: isLoadingTransactionDetail,
    openTransaction,
    closeTransaction,
  } = useTransactionDetail();
  return (
    <>
      <section className='page__container'>
        <TopWhiteSpace variant={'dark'} />

        <div className='page__content'>
          <div className='main__title--container'>
            <Link to={previousRoute} relative='path' className='backArrow backArrow--dark'>
              <LeftArrowLightSvg />
            </Link>

            <div className='form__title'>
              {accountDetail
                ? capitalize(accountDetail.account_name).toUpperCase()
                : 'Loading...'}
            </div>

            {accountId && (
              <AccountEditLink
                accountId={accountId}
                returnRoute={location.pathname}
                accountName={accountDetail?.account_name ?? ''}
                originRoute={previousRoute}
              />
            )}
          </div>

          <form className='form__box'>
            <div
              className='account-transactions__container '
              style={{ margin: '1rem 0' }}
            >
              {/* Floor is the account's opening month, ceiling the current one, so
                  the picker cannot select a month the server refuses with 422. */}
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

              <div className='period-info'>
                <div className='period-info__label'>Period</div>
                <span className='period-info__dates  '>
                  {formatDateToDDMMYYYY(summaryAccountBalance.periodStartDate)}
                  {'  '} / {'  '}{' '}
                  {formatDateToDDMMYYYY(summaryAccountBalance.periodEndDate)}
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
            </div>
          </form>

          {(isLoading || isLoadingTransactions) && <p>Loading...</p>}
          {(error || errorTransactions) && (
            <p>Error fetching account info: {error ?? errorTransactions}</p>
          )}
        </div>
      </section>

      {isLoadingTransactionDetail && <CoinSpinner />}

      <AccountTransactionDetailModal
        transaction={selectedTransaction}
        onClose={closeTransaction}
      />
    </>
  );
}

export default OverviewAccountReading;

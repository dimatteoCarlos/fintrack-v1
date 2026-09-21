// Debts' own account screen (reached from ListOfDebtors.tsx): DebtorDetail.tsx
// without the record card, kept separate so the two can diverge independently.
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
  formatDateToDDMMYYYY,
  toCalendarDay,
} from '../../../helpers/functions.ts';
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

// Rebuilds the board's list row from the detail endpoint's account so the bubble
// holds real data on a direct load.
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

function DebtorDetailReading() {
  const location = useLocation();
  const state = location.state as LocationStateType | null;
  const debtorDetailedData = state?.debtorDetailedData;
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

  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  const selectMonth = (month: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('month', month);
    setSearchParams(nextParams, { replace: true });
  };

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
  const accountDetail: AccountListType | null =
    accountsData?.data?.accountList?.[0] ?? null;

  const bubleInfo: DebtorListType | null = accountDetail
    ? getBubleInfoFromAccountDetail(accountDetail)
    : debtorDetailedData ?? null;

  const statementData = transactionAccountApiResponse?.data ?? null;
  const transactions: AccountTransactionType[] | null =
    statementData?.transactions ?? null;
  const summaryAccountBalance: AccountSummaryBalanceType | null =
    statementData?.summary ?? null;

  const {
    selectedTransaction,
    isLoading: isLoadingTransactionDetail,
    openTransaction,
    closeTransaction,
  } = useTransactionDetail();

  const hasAccountAnswer = status !== null || error !== null;

  const isAccountMissing = status === 404;
  const hasAccountFailed = Boolean(error) && !isAccountMissing;
  const isAccountPending =
    !isAccountMissing && !hasAccountFailed && (isLoading || !hasAccountAnswer);

  const hasStatementAnswer =
    statusTransactions !== null || errorTransactions !== null;
  const hasStatementFailed = Boolean(errorTransactions);
  const isStatementPending =
    !hasStatementFailed && (isLoadingTransactions || !hasStatementAnswer);

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
            <Link
              to={previousRoute}
              relative='path'
              className='backArrow backArrow--dark'
              aria-label='Go back'
            >
              <LeftArrowLightSvg aria-hidden='true' />
            </Link>
            <h1 className='form__title'>
              {bubleInfo && !isAccountMissing && !hasAccountFailed ? (
                String(bubleInfo.account_name).toUpperCase()
              ) : (
                <span
                  className='debtorDetail__skeletonBar debtorDetail__skeletonBar--title'
                  aria-hidden='true'
                ></span>
              )}
            </h1>
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
                {/* The record card (balance, account type, opening date, currency)
                    lives only in DebtorDetail.tsx. */}

                <div
                  className='account-transactions__container '
                  style={{ margin: '1rem 0' }}
                >
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

      {isLoadingTransactionDetail && <CoinSpinner />}

      <AccountTransactionDetailModal
        transaction={selectedTransaction}
        onClose={closeTransaction}
      />
    </>
  );
}

export default DebtorDetailReading;

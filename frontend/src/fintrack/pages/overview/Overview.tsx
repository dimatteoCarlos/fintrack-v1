import { useEffect, useState } from 'react';

import {
  Link,
  NavigateFunction,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import useAuth from '../../../auth/hooks/useAuth.ts';
import { useFetch } from '../../hooks/useFetch.ts';

import AccountBalance from './components/AccountBalance.tsx';
import ConsolidatedCard from './components/ConsolidatedCard.tsx';
import DomainCards from './components/DomainCards.tsx';
import FinancialGoals from './components/FinancialGoals.tsx';
import MonthlySnapshot from './components/MonthlySnapshot.tsx';
import TrendCharts from './components/TrendCharts.tsx';
import ExpenseByCategory from './components/ExpenseByCategory.tsx';
import RecentActivity from './components/RecentActivity.tsx';
import InvestmentAccountBalance from './components/InvestmentAccBalance.tsx';
import OpenAddEditBtn from '../../general_components/OpenAddEditBtn.tsx';
import CoinSpinner from '../../loader/coin/CoinSpinner.tsx';
import { CardTitle } from '../../general_components/CardTitle.tsx';
import { useOverviewStore } from '../../stores/useOverviewStore.ts';
import { monthLabel } from './helpers/monthLabel.ts';

import { url_get_accounts_by_type } from '../../../urlConfig.ts';

import {
  AccountByTypeResponseType,
  FinancialDataRespType,
  LastMovementRespType,
} from '../../types/responseApiTypes.ts';

export type CreateNewAccountPropType = {
  originRoute: string;
  createNewAccount(originRoute: string): void;
};
export type ApiRespDataType = {
  MonthlyTotalAmountByType: FinancialDataRespType | null;
  MovementExpenseTransactions: LastMovementRespType | null;
  MovementDebtTransactions: LastMovementRespType | null;
  MovementIncomeTransactions: LastMovementRespType | null;
  MovementInvestmentTransactions: LastMovementRespType | null;
  MovementPnLTransactions: LastMovementRespType | null;
};
function Overview() {
  const navigateTo: NavigateFunction = useNavigate();
  const location = useLocation();
  const originRoute = location.pathname;

  const [isLoading, setIsLoading] = useState(true);

  const { isAuthenticated, isCheckingAuth } = useAuth();

  // A month with no movement in any of the six domains: every count is cut to the
  // month, so all six at 0 would draw zero cards and empty categories. Null while
  // the payload is on the wire, since not yet is not empty.
  const domainCards = useOverviewStore((state) => state.domainCards);
  const referenceMonth = useOverviewStore((state) => state.referenceMonth);
  const currentMonth = useOverviewStore((state) => state.currentMonth);
  const isMonthEmpty =
    domainCards !== null &&
    Object.values(domainCards).every((card) => card.transactionCount === 0);

  // One request serves both account cards: the route answers bank_and_investment,
  // and each card takes its own type out of that one answer.
  const urlAccountsByType =
    !isCheckingAuth && isAuthenticated
      ? `${url_get_accounts_by_type}/?type=bank_and_investment`
      : null;

  const {
    apiData: accountsByTypeData,
    isLoading: accountsLoading,
    error: accountsError,
    refetch: refetchAccounts,
  } = useFetch<AccountByTypeResponseType>(urlAccountsByType);

  // Split here and not inside each card: a card filtering its own share would have
  // to know what the other takes. Null while nothing has arrived, so a card can
  // tell "not yet" from "none of this type".
  const accountList = accountsByTypeData?.data?.accountList ?? null;

  // The shared statement orders by type then name, so each card re-sorts: bank by balance
  // ascending, investment by magnitude descending. filter copies, so accountList is untouched.
  const bankAccounts =
    accountList
      ?.filter((acc) => acc.account_type_name === 'bank')
      .sort((a, b) => a.account_balance - b.account_balance) ?? null;

  const investmentAccounts =
    accountList
      ?.filter((acc) => acc.account_type_name === 'investment')
      .sort((a, b) => Math.abs(b.account_balance) - Math.abs(a.account_balance)) ??
    null;
  function createNewAccount(originRoute: string) {
    navigateTo(originRoute + '/new_account', {
      state: { previousRoute: originRoute },
      viewTransition: true,
    });
  }

  useEffect(() => {
    if (isCheckingAuth || !isAuthenticated) {
      return;
    }

    // No request of this component's own: the figures come from the /overview
    // payload the layout fetches, and the account panels have their own useFetch.
    setIsLoading(false);
  }, [isAuthenticated, isCheckingAuth]);

  if (isCheckingAuth) {
    return <CoinSpinner />;
  }

  return (
    <section className='content__presentation'>
      <div className='cards__presentation'>
        {isLoading && (
          <div
            className='loader__container'
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              zIndex: '1',
            }}
          >
            <CoinSpinner />
          </div>
        )}

        {/* Not in the layout header: it is positioned from a constant height, so a second child
            would shift every absolute box below. createNewAccount and originRoute live here. */}
        <OpenAddEditBtn
          btnFunction={createNewAccount}
          btnFunctionArg={originRoute}
          btnPreviousRoute={originRoute}
        >
          <div className='open__btn__label'>Add Account</div>
        </OpenAddEditBtn>

        {/* The two account panels come first, directly under the button that opens
            the account form: they list what that button produces. */}
        {
          <AccountBalance
            previousRoute={originRoute}
            accounts={bankAccounts}
            isLoading={accountsLoading}
            error={accountsError}
            onRetry={refetchAccounts}
          />
        }

        {
          <InvestmentAccountBalance
            previousRoute={originRoute}
            accounts={investmentAccounts}
            isLoading={accountsLoading}
            error={accountsError}
            onRetry={refetchAccounts}
          />
        }

        {/* The six domain cards answer what the month did; everything below is
            detail on part of that answer. DomainCards takes no props and reads
            the store the layout has filled. Each card folds on its own. */}
        {isMonthEmpty ? (
          // Balances and goals are not cut to the month, so only the blocks that
          // measure the month give way.
          <div className='flex-col-sb boardState' role='status'>
            <p className='boardState__text'>
              No movements recorded in {monthLabel(referenceMonth)}.
            </p>
            <Link className='boardState__action' to='/fintrack/tracker/expense' viewTransition>
              Record a movement
            </Link>
          </div>
        ) : (
          <>
            {/* The month every card below is read for. Guarded on the value DomainCards returns
                null for, so the heading never stands alone. */}
            {domainCards !== null && (
              <div className='presentation__card__title__container flx-row-sb'>
                {/* The running month has not closed, so its position is today's,
                    the cut Global Financial Goals states for the same figures. */}
                <CardTitle
                  subtitle={
                    referenceMonth !== null &&
                    currentMonth !== null &&
                    referenceMonth.slice(0, 7) === currentMonth.slice(0, 7)
                      ? 'Flow is measured across the month so far; position is read to date'
                      : 'Flow is measured across the month; position is read at its close'
                  }
                >
                  {monthLabel(referenceMonth)}
                </CardTitle>
              </div>
            )}

            {/* The month consolidated, above the cards that break it down. */}
            <ConsolidatedCard />

            <DomainCards />

            {/* No props: the widget subscribes to useOverviewStore, which the
                layout has already filled for the month on screen. A month
                fetched here would drift from the picker's. */}
            <MonthlySnapshot />
          </>
        )}

        {/* Goals are read at the close of the same month the cards above are cut
            to. Store-backed like them, so the page adds no request. */}
        <FinancialGoals />

        <TrendCharts />

        {/* Store-backed: the ranking is already in the level-1 answer, so no request is added. */}
        {!isMonthEmpty && <ExpenseByCategory />}
        {/* One list for every domain, fetching GET /overview/activity itself. The only block not
            bounded by the reference month: the period is the reader's. */}
        <RecentActivity />
      </div>
    </section>
  );
}
export default Overview;
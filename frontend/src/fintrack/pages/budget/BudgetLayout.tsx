import { useCallback, useEffect, useMemo } from 'react';
import { TitleHeader } from '../../general_components/titleHeader/TitleHeader.tsx';
import { useBudgetStatusStore } from '../../stores/useBudgetStatusStore.ts';
import BudgetBigBoxResult from './components/BudgetBigBoxResult.tsx';
import MonthPicker from '../../general_components/monthPicker/MonthPicker.tsx';
import ExportMenu from '../../general_components/exportMenu/ExportMenu.tsx';
import { downloadBudgetExport } from '../../api/exportApi.ts';
import './styles/budget-styles.css';
import CoinSpinner from '../../loader/coin/CoinSpinner.tsx';
import { Outlet, useSearchParams } from 'react-router-dom';

function BudgetLayout() {
  // The module's single request. This header and the category list below are
  // both drawn from it, which is why it is issued here and not in either one.
  const totals = useBudgetStatusStore((state) => state.totals);
  const notices = useBudgetStatusStore((state) => state.notices);
  const referenceMonth = useBudgetStatusStore((state) => state.referenceMonth);
  const currentMonth = useBudgetStatusStore((state) => state.currentMonth);
  const isLoading = useBudgetStatusStore((state) => state.isLoading);
  const error = useBudgetStatusStore((state) => state.error);
  const fetchStatus = useBudgetStatusStore((state) => state.fetchStatus);

  // The month lives in the URL, so it survives the drill-down: levels 2 and 3
  // are routes beside this layout, not children of it, and a month held here
  // would die the moment a category is opened.
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  // Absent, nothing is sent and the server resolves the current month on the
  // owner's calendar. Only a month the user picked ever travels.
  useEffect(() => {
    fetchStatus(monthParam ?? undefined);
  }, [fetchStatus, monthParam]);

  // Replaced, not pushed, so back does not step month by month; merged, not written whole,
  // because the list below keeps its search term and sort key in this same query string.
  const selectMonth = useCallback(
    (month: string) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('month', month);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The same argument the effect above sends, so pressing the button asks for
  // the month on screen and not for whatever the server would resolve today.
  const retry = useCallback(() => {
    fetchStatus(monthParam ?? undefined);
  }, [fetchStatus, monthParam]);
  // Served, never summed here, so header and list cannot disagree. null passes through:
  // 0 would announce a zero budget in flight and in the mixed-currency case (totals withheld).
  const {
    budgetAmount,
    actualSpent,
    remainingBudget,
    executionPercentage,
    currency,
    isOverBudget,
  } = useMemo(
    () => ({
      budgetAmount: totals?.budgetAmount ?? null,
      actualSpent: totals?.actualSpent ?? null,
      remainingBudget: totals?.remainingBudget ?? null,
      executionPercentage: totals?.executionPercentage ?? null,
      currency: totals?.currency ?? undefined,
      // Derived here because BudgetStatusTotals carries no flag: the server
      // serves isOverBudget per category row, not for the total.
      isOverBudget: totals ? totals.remainingBudget < 0 : null,
    }),
    [totals],
  );

  // Only the totals-level notice belongs in the header. A category-level one
  // names its category and belongs beside it, in the list below.
  const notice =
    totals !== null && totals.currency === null ? notices[0] ?? null : null;

  return (
    <>
      <div className='budgetLayout'>
        <div className='layout__header'>
          <div className='headerContent__container'>
            <TitleHeader></TitleHeader>

            {/* The action bar is out of the header's flow: the header has a constant height, so extra
                height would move every absolute box below. The month label is the server-resolved one. */}
            <div className='headerActionBar'>
              <MonthPicker
                month={referenceMonth}
                currentMonth={currentMonth}
                onSelect={selectMonth}
              />

              {/* The month on screen travels as both bounds, so the file is the
                  month being read. Absent, nothing is sent and the server
                  resolves the current month, the rule the module follows. */}
              <ExportMenu
                subject='the budget'
                disabled={isLoading}
                onExport={(format) =>
                  downloadBudgetExport(
                    monthParam
                      ? { format, from: monthParam, to: monthParam }
                      : { format },
                  )
                }
              />
            </div>
          </div>
        </div>

        {isLoading && (
          <div
            className='loader__container'
            style={{
              position: 'absolute',
              left: '50%',
              top: '20%',
              zIndex: '1',
            }}
          >
            <CoinSpinner />
          </div>
        )}

        {/* The failure takes the hero's own place, like the debts board. No figure
            survives a failed request, so none is drawn. */}
        {error ? (
          <div className='total__container flex-col-sb boardState' role='alert'>
            <p className='boardState__text'>
              The budget summary could not be loaded.
            </p>

            <button type='button' className='boardState__retry' onClick={retry}>
              Try again
            </button>
          </div>
        ) : (
          <BudgetBigBoxResult
            budgetAmount={budgetAmount}
            actualSpent={actualSpent}
            remainingBudget={remainingBudget}
            executionPercentage={executionPercentage}
            currency={currency}
            isOverBudget={isOverBudget}
            notice={notice}
          />
        )}

        <Outlet />
      </div>
    </>
  );
}

export default BudgetLayout;

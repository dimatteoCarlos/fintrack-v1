// The three figures at the top of Overview for one month, from a single /overview request.

import { useCallback, useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';

import { BigBoxResult } from './components/BigBoxResult.tsx';
import HeroIndicators from './components/HeroIndicators.tsx';
import PeriodStatementButton from './components/PeriodStatementButton.tsx';
import { TitleHeader } from '../../general_components/titleHeader/TitleHeader.tsx';
import MonthPicker from '../../general_components/monthPicker/MonthPicker.tsx';
import ScrollJump from '../../general_components/scrollJump/ScrollJump';
import CoinSpinner from '../../loader/coin/CoinSpinner.tsx';
import { useOverviewStore } from '../../stores/useOverviewStore.ts';

import './styles/overview-styles.css';

function OverviewLayout() {
 // The page's single request. This header and every block the Outlet renders are
 // drawn from it, which is why it is issued here rather than per component.
 const hero = useOverviewStore((state) => state.hero);
 const domainCards = useOverviewStore((state) => state.domainCards);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);
 const currentMonth = useOverviewStore((state) => state.currentMonth);
 const isMonthToDate = useOverviewStore(
  (state) => state.window?.isCurrentMonth ?? false,
 );
 const isLoading = useOverviewStore((state) => state.isLoading);
 const error = useOverviewStore((state) => state.error);
 const fetchOverview = useOverviewStore((state) => state.fetchOverview);

 // The month lives in the URL, as on the budget and pocket boards, not in state:
 // the account and level-3 destinations are routes declared beside this layout,
 // so a month in state would be lost the moment one of them is opened.
 const [searchParams, setSearchParams] = useSearchParams();
 const monthParam = searchParams.get('month');

 // Absent, nothing is sent and the server resolves the current month on the
 // owner's calendar. Only a month the reader stepped to ever travels.
 useEffect(() => {
  fetchOverview(monthParam ?? undefined);
 }, [fetchOverview, monthParam]);

 // Replaced, not pushed: the month is the scope of the page, not a step the back
 // button should walk through one month at a time. Merged rather than written
 // whole, so a query parameter another block owns is not cleared by picking one.
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

 // The same argument the effect sends, so the button asks for the month on
 // screen and not for whatever the server would resolve today.
 const retry = useCallback(() => {
  fetchOverview(monthParam ?? undefined);
 }, [fetchOverview, monthParam]);

 // null, never 0: BigBoxResult renders null as a dash. Income is not negated (it is a flow).
 // savingsRate is excluded: a 0-1 rate among amounts would be formatted as $0.23.
 const bigScreenInfo = [
  // What is owned, receivable leg included.
  { title: 'net worth', amount: hero?.netWorth ?? null },
  { title: 'income', amount: domainCards?.income.totalAmount ?? null },
  { title: 'expenses', amount: domainCards?.expense.totalAmount ?? null },
 ];

 return (
  <main className='overviewLayout '>
   <div className='layout__header'>
    <div className='headerContent__container '>
     <TitleHeader />

     {/* Out of the header's flow (.statementBar, overview-styles.css): the header has a constant height.
         currentMonth is the server's 422 ceiling; a local copy would let the forward arrow overshoot. */}
     <div className='statementBar'>
      <MonthPicker
       month={referenceMonth}
       currentMonth={currentMonth}
       surface='cream'
       withSteppers
       isLoading={isLoading}
       isMonthToDate={isMonthToDate}
       onSelect={selectMonth}
      />

      <PeriodStatementButton month={referenceMonth} disabled={isLoading || referenceMonth === null} />
     </div>
    </div>
   </div>

   {isLoading && (
    <div
     className='loader__container'
     style={{ position: 'absolute', left: '50%', top: '20%', zIndex: '1' }}
    >
     <CoinSpinner />
    </div>
   )}

   {/* The failure takes the figures' place, as on the pocket and debts boards: no
       figure survives a failed request, so none is drawn. */}
   {error ? (
    <div className='total__container flex-col-sb boardState' role='alert'>
     <p className='boardState__text'>The overview could not be loaded.</p>

     {/* The failure's own message: a month later than the current one answers 422
         naming the ceiling, which a generic sentence would lose. */}
     <p className='boardState__detail'>{error}</p>

     <button type='button' className='boardState__retry' onClick={retry}>
      Try again
     </button>
    </div>
   ) : (
    <>
     {/* The accounting currency comes from the payload, not a constant; every
         figure in the rows is from that same answer. */}
     <BigBoxResult
      bigScreenInfo={bigScreenInfo}
      currency={hero?.currency ?? null}
     />

     {/* Inside the same branch as the hero: its four figures come from the same
         payload, so a failed request must not leave a card opening onto dashes. */}
     <HeroIndicators />
    </>
   )}

   <Outlet />

   {/* Outside the Outlet so one viewport-fixed control serves every screen of the
       module, not a copy per route. Overview runs past a viewport on real data
       and otherwise has no way back to the month picker but scrolling. */}
   <ScrollJump />
  </main>
 );
}

export default OverviewLayout;

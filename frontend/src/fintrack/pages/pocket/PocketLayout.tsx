import { useCallback, useEffect } from 'react';
import { TitleHeader } from '../../general_components/titleHeader/TitleHeader.tsx';
import { usePocketBoardStore } from '../../stores/usePocketBoardStore.ts';
import PocketBigBoxResult from './components/PocketBigBoxResult.tsx';
import MonthPicker from '../../general_components/monthPicker/MonthPicker.tsx';
import ExportMenu from '../../general_components/exportMenu/ExportMenu.tsx';
import { downloadPocketExport } from '../../api/exportApi.ts';

import './styles/pocket-styles.css';
import CoinSpinner from '../../loader/coin/CoinSpinner.tsx';
import { Outlet, useSearchParams } from 'react-router-dom';

function PocketLayout() {
 // The module's single request: the header and the list below are both drawn
 // from it, so it is issued here and not in either one.
 const summary = usePocketBoardStore((state) => state.summary);
 const notices = usePocketBoardStore((state) => state.notices);
 const referenceMonth = usePocketBoardStore((state) => state.referenceMonth);
 const currentMonth = usePocketBoardStore((state) => state.currentMonth);
 // The back arrow's floor, held by the store and not recomputed from the rows on
 // screen: a month before the first plan has no rows and would lose the floor.
 const earliestPlanMonth = usePocketBoardStore(
  (state) => state.earliestPlanMonth,
 );
 const isLoading = usePocketBoardStore((state) => state.isLoading);
 const error = usePocketBoardStore((state) => state.error);
 const fetchBoard = usePocketBoardStore((state) => state.fetchBoard);

 // The month lives in the URL, not in state: the pocket detail is a route beside
 // this layout, so a month held here would be lost when a pocket is opened.
 const [searchParams, setSearchParams] = useSearchParams();
 const monthParam = searchParams.get('month');

 // Absent, nothing is sent and the server resolves the current month on the
 // owner's calendar; only a month stepped back to travels.
 useEffect(() => {
  fetchBoard(monthParam ?? undefined);
 }, [fetchBoard, monthParam]);

 // Replaced, not pushed, so the back button does not step through months. Merged
 // into the existing params because the list keeps its search, sort and filter
 // in this same query string.
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

 // Same argument as the effect above: retries the month on screen, not today's.
 const retry = useCallback(() => {
  fetchBoard(monthParam ?? undefined);
 }, [fetchBoard, monthParam]);

 // The summary goes through whole, nulls included, and nothing is summed here:
 // the server folds the same rows the list renders, so header and list agree.

 // Raised only when the board holds pockets it could not fold. An empty board
 // also serves a null currency, which is not a mix: the hero states it as empty.
 const notice =
  summary !== null && summary.pocketCount > 0 && summary.currency === null
   ? notices[0] ?? null
   : null;

 return (
  <>
   <div className='pocketLayout'>
    <div className='layout__header'>
     <div className='headerContent__container'>
      <TitleHeader></TitleHeader>

      {/* CSS floats this row out of the header's flow: the header has a constant height, so a child
          adding to it would move every absolute box below. Steppers are MonthPicker's opt-in prop. */}
      <div className='headerActionBar'>
       <MonthPicker
        month={referenceMonth}
        currentMonth={currentMonth}
        minMonth={earliestPlanMonth}
        surface='dark'
        withSteppers
        isLoading={isLoading}
        onSelect={selectMonth}
       />

       {/* Only a month the reader stepped back to travels, spelled as the
           first of that month by the api client. */}
       <ExportMenu
        subject='the pocket board'
        disabled={isLoading}
        onExport={(format) =>
         downloadPocketExport(
          monthParam ? { format, month: monthParam } : { format },
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

    {/* The failure replaces the hero: no figure survives a failed request, so
        none is drawn. */}
    {error ? (
     <div className='total__container flex-col-sb boardState' role='alert'>
      <p className='boardState__text'>
       The pocket summary could not be loaded.
      </p>

      {/* The store's error message, verbatim, so different failures (no route,
          expired session, unparseable payload) do not all read the same. */}
      <p className='boardState__detail'>{error}</p>

      <button type='button' className='boardState__retry' onClick={retry}>
       Try again
      </button>
     </div>
    ) : (
     <PocketBigBoxResult
      summary={summary}
      referenceMonth={referenceMonth}
      currentMonth={currentMonth}
      notice={notice}
     />
    )}

    <Outlet />
   </div>
  </>
 );
}

export default PocketLayout;

import { NavigateFunction, useLocation, useNavigate } from 'react-router-dom';

import OpenAddEditBtn from '../../general_components/OpenAddEditBtn';
import ListPocket from './components/ListPocket';
import { PocketBoardReadings } from './components/PocketBigBoxResult';
import { useCompactHeroOnScroll } from './hooks/useCompactHeroOnScroll';

function Pocket() {
 const location = useLocation();
 const originRoute = location.pathname;
 // Where a card's back arrow returns: the board with its month, filters and
 // open cards, which all live in the query string.
 const returnRoute = `${location.pathname}${location.search}`;
 const navigateTo: NavigateFunction = useNavigate();
 const handleScroll = useCompactHeroOnScroll();

 const createNewPocket = (originRoute: string) => {
  navigateTo(originRoute + '/new_pocket', {
   state: { previousRoute: originRoute },
   viewTransition: true,
  });
 };
 return (
  <>
   <section className='content__presentation'>
    <div className='cards__presentation '>
     {/* The page's one scroller, under the progress bar. The list has no overflow of its own:
         a nested scroller would win and the toolbar would never move. */}
     <div className='pocketBoard__scroller' onScroll={handleScroll}>
      <PocketBoardReadings />

      <ListPocket previousRoute={returnRoute} />
     </div>

     {/* Outside the scroller: the page's primary action must stay in view. */}
     <OpenAddEditBtn
      btnFunction={createNewPocket}
      btnFunctionArg={originRoute}
      btnPreviousRoute={originRoute}
     >
      <div className='open__btn__label'>New Pocket</div>
     </OpenAddEditBtn>
    </div>
   </section>
  </>
 );
}

export default Pocket;

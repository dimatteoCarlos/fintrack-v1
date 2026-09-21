import { NavigateFunction, useLocation, useNavigate } from 'react-router-dom';

import OpenAddEditBtn from '../../general_components/OpenAddEditBtn';
import ListPocket from './components/ListPocket';
import { PocketBoardReadings } from './components/PocketBigBoxResult';

function Pocket() {
 const originRoute = useLocation().pathname;
 const navigateTo: NavigateFunction = useNavigate();

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
     {/* The page's one scroller; the list has no overflow of its own because a
         nested scroller would win and the toolbar would never move. */}
     <div className='pocketBoard__scroller'>
      <PocketBoardReadings />

      <ListPocket previousRoute={originRoute} />
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

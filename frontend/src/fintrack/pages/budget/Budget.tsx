import { NavigateFunction, useLocation, useNavigate } from 'react-router-dom';

import { CardTitle } from '../../general_components/CardTitle';
import OpenAddEditBtn from '../../general_components/OpenAddEditBtn';
import ListCategory from './components/ListCategory';

function Budget() {
  const originRoute = useLocation().pathname;
  const navigateTo: NavigateFunction = useNavigate();

  const createNewCategory = (originRoute: string) => {
    navigateTo(originRoute + '/new_category', {
      state: { previousRoute: originRoute },
      viewTransition: true,
    });
  };

  return (
    <>
      <section className='content__presentation'>
        <div className='cards__presentation '>
          {/* Four labels for the four cells of a row: name and amounts on the
              first line, remainder and share on the second. */}
          <CardTitle
            legend='Spent / Budget'
            subtitle='Remaining over / left'
            subLegend='% of spent budget'
          >
            Category List
          </CardTitle>

          <ListCategory previousRoute={originRoute} />

          {/* After the list, outside the scroll, so the action is always in view. */}
          <OpenAddEditBtn
            btnFunction={createNewCategory}
            btnFunctionArg={originRoute}
            btnPreviousRoute={originRoute}
          >
            <div className='open__btn__label'>New Category</div>
          </OpenAddEditBtn>

        </div>
      </section>
    </>
  );
}

export default Budget;

import ExpenseSvg from '../../../../assets/trackerNavbarSvg/ExpenseSvg.svg';
import { NavLink } from 'react-router-dom';

function TrackerExpenseButton() {
  return (
    <>
      <div className='trackerStateButton__container '>
        {/* The icon has no title; labelling by the visible caption below gives the
            link its accessible name without a duplicate aria-label. */}
        <NavLink
          to='/fintrack/tracker/expense'
          viewTransition
          aria-labelledby='trackerTabLabel-expense'
          className={`flx-col-center trackerStateIconButton  ${(isActive: {
            isActive: boolean;
          }) => (isActive ? 'active' : '')}`}
        >
          <ExpenseSvg />
        </NavLink>

        <div
          id='trackerTabLabel-expense'
          className='trackerStateButton__state--title'
        >
          {'Expense'}
        </div>
      </div>
    </>
  );
}

export default TrackerExpenseButton;

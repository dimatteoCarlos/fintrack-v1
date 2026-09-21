import DebtsSvg from '../../../../assets/trackerNavbarSvg/DebtsSvg.svg';
import { NavLink } from 'react-router-dom';

function TrackerDebtsButton() {
  return (
    <>
      <div className='trackerStateButton__container'>
        {/* The icon has no title; labelling by the visible caption below gives the
            link its accessible name without a duplicate aria-label. */}
        <NavLink
          to={'debts'}
          viewTransition
          aria-labelledby='trackerTabLabel-debts'
          className={`flx-col-center trackerStateIconButton  ${(isActive: {
            isActive: boolean;
          }) => (isActive ? 'active' : '')}`}
        >
          <DebtsSvg />
        </NavLink>
        <div
          id='trackerTabLabel-debts'
          className='trackerStateButton__state--title'
        >
          {'Debts'}
        </div>
      </div>
    </>
  );
}

export default TrackerDebtsButton;

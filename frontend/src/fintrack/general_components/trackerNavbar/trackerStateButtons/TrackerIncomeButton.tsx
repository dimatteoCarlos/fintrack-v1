import IncomeSvg from '../../../../assets/trackerNavbarSvg/IncomeSvg.svg';

import { NavLink } from 'react-router-dom';
function TrackerIncomeButton() {
  return (
    <>
      <div className='trackerStateButton__container'>
        <div className={`trackerStateButton`}>
          {/* The icon has no title; labelling by the visible caption below gives
              the link its accessible name without a duplicate aria-label. */}
          <NavLink
            to={'income'}
            viewTransition
            aria-labelledby='trackerTabLabel-income'
            className={`trackerStateIconButton flx-col-center ${(isActive: {
              isActive: boolean;
            }) => (isActive ? 'active' : '')}`}
          >
            <IncomeSvg />
          </NavLink>
        </div>
        <div
          id='trackerTabLabel-income'
          className='trackerStateButton__state--title'
        >
          {'Income'}
        </div>
      </div>
    </>
  );
}

export default TrackerIncomeButton;

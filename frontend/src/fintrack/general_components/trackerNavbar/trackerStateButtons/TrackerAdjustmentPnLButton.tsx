import AdjustSvg from '../../../../assets/trackerNavbarSvg/AdjustSvg.svg';
import { NavLink } from 'react-router-dom';

function TrackerInvestmentButton() {
  const classNavLink = `trackerStateIconButton flx-col-center ${({
    isActive,
  }: {
    isActive: boolean;
  }) => (isActive ? 'active' : '')}`;

  return (
    <>
      <div className='trackerStateButton__container'>
        {/* The icon has no title; labelling by the visible caption below gives the
            link its accessible name without a duplicate aria-label. */}
        <NavLink
          to='pnl'
          viewTransition
          aria-labelledby='trackerTabLabel-pnl'
          className={classNavLink}
        >
          <AdjustSvg />
        </NavLink>
        <div
          id='trackerTabLabel-pnl'
          className='trackerStateButton__state--title'
        >
          {'PnL'}
        </div>
      </div>
    </>
  );
}

export default TrackerInvestmentButton;

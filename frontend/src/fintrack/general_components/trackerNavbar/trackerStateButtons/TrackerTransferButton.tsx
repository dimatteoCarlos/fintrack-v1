import TransferSvg from '../../../../assets/trackerNavbarSvg/TransferSvg.svg';

import { NavLink } from 'react-router-dom';

function TrackerTransferButton() {
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
          to='transfer'
          viewTransition
          aria-labelledby='trackerTabLabel-transfer'
          className={classNavLink}
        >
          <TransferSvg />
        </NavLink>
        <div
          id='trackerTabLabel-transfer'
          className='trackerStateButton__state--title'
        >
          {'Transfer'}
        </div>
      </div>
    </>
  );
}

export default TrackerTransferButton;

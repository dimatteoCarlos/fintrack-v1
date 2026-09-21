import TrackerDebtsButton from './trackerStateButtons/TrackerDebtsButton.tsx';
import TrackerExpenseButton from './trackerStateButtons/TrackerExpenseButton.tsx';
import TrackerIncomeButton from './trackerStateButtons/TrackerIncomeButton.tsx';
import TrackerTransferButton from './trackerStateButtons/TrackerTransferButton.tsx';
import TrackerAdjustmentPnLButton from './trackerStateButtons/TrackerAdjustmentPnLButton.tsx';

import './trackerStateButtons/trackerStateButton.css';

function TrackerNavbar() {
  return (
    <nav className='trackerNavbar__container'>
      <TrackerExpenseButton />
      <TrackerIncomeButton />
      <TrackerTransferButton />
      <TrackerDebtsButton />
      {/* PnL: profit and loss adjustment on bank and investment accounts */}
      <TrackerAdjustmentPnLButton />
    </nav>
  );
}

export default TrackerNavbar;

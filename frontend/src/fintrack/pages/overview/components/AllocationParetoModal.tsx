// frontend/src/fintrack/pages/overview/components/AllocationParetoModal.tsx
// The pocket Pareto opened from Global Financial Goals, drawn by the same ParetoBar as the expense block.
// Not portalled: ParetoBar's rules live under .overviewLayout, so the dialog stays inside it.

import ParetoBar, { ParetoRow } from './ParetoBar';
import { useModalDialog } from '../../../../hooks/useModalDialog';

type AllocationParetoModalProps = {
 rows: ParetoRow[];
 currency: string;
 // goalsTotalBalance, the figure the running shares were taken against.
 total: number;
 // The block's own scope line, so the dialog names the same cut.
 scope: string;
 onClose: () => void;
};

function AllocationParetoModal({
 rows,
 currency,
 total,
 scope,
 onClose,
}: AllocationParetoModalProps) {
 const { titleId, dialogProps } = useModalDialog({
  onClose,
  lockPageBehind: false,
 });

 return (
  <div className='allocationPareto__overlay' onClick={onClose}>
   <div
    className='allocationPareto__panel'
    onClick={(event) => event.stopPropagation()}
    {...dialogProps}
   >
    <div className='allocationPareto__head'>
     <div className='allocationPareto__titles'>
      <h2 className='allocationPareto__title' id={titleId}>
       Allocated by pocket
      </h2>
      <p className='allocationPareto__scope'>{scope}</p>
     </div>

     <button
      type='button'
      className='allocationPareto__close'
      onClick={onClose}
      aria-label='Close'
     >
      ✕
     </button>
    </div>

    <ParetoBar
     rows={rows}
     currency={currency}
     total={total}
     totalLabel='allocated to pockets'
     unitLabel='pockets'
    />
   </div>
  </div>
 );
}

export default AllocationParetoModal;

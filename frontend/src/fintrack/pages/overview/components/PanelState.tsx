// Loading and error states of the two account panels; the empty state is not handled here.

import { CardTitle } from '../../../general_components/CardTitle';

// Placeholder tile count; the real count is unknown until the answer arrives.
const SKELETON_TILES = 3;

type PanelStateProps = {
 // Drawn in both states so the heading does not vanish and return.
 title: string;
 // Named in the error message so a reader with several panels knows which failed.
 subject: string;
 isLoading: boolean;
 error: string | null;
 // useFetch's refetch: it bumps an attempt counter so the same url is asked
 // again. The retry is what separates an error from an empty list.
 onRetry: () => void;
};

const PanelHeading = ({ title }: { title: string }) => (
 <div className='presentation__card__title__container flx-row-sb'>
  <CardTitle>{title}</CardTitle>
 </div>
);

// Returns null when there is nothing to say, so a caller can render this ahead
// of its own content. Empty is the caller's call: only it can tell an empty
// array from a null one.
function PanelState({
 title,
 subject,
 isLoading,
 error,
 onRetry,
}: PanelStateProps) {
 if (isLoading) {
  return (
   <>
    <PanelHeading title={title} />

    {/* A row of tiles matching the panel's shape, not the word "Loading".
        aria-hidden on the tiles; aria-busy on the region carries the state. */}
    <div className='panelState__skeleton' aria-busy='true'>
     {/* keys() yields the indexes directly; Array.from's mapper would bind an
         unused element name, which noUnusedLocals in tsconfig.app.json rejects. */}
     {[...Array(SKELETON_TILES).keys()].map((index) => (
      <span
       className='panelState__tile'
       key={`skeleton-${index}`}
       aria-hidden='true'
      />
     ))}
    </div>
   </>
  );
 }

 if (error) {
  return (
   <>
    <PanelHeading title={title} />

    <div className='panelState' role='alert'>
     <p className='panelState__text'>{subject} could not be loaded.</p>

     <button type='button' className='panelState__retry' onClick={onRetry}>
      Try again
     </button>
    </div>
   </>
  );
 }

 return null;
}

export default PanelState;

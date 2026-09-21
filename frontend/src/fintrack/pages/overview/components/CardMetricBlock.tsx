// The second reading a domain card states under its headline: head row, bar, foot row.
// CardMetricRow is exported alone for cards whose two legs need not sum to the headline,
// where a bar would state a proportion the data does not have.

import { ReactNode } from 'react';

import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents';
import {
 ProgressBar,
 ProgressTone,
} from '../../../general_components/progressBar/ProgressBar';

type CardMetricRowProps = {
 // A node, not a string: a foot line carries a status square inside its subject
 // so the mark wraps with the words it grades.
 subject: ReactNode;
 figure: ReactNode;
 // 'head' takes the heavier ink; the default is the quieter subtitle row.
 variant?: 'head' | 'foot';
};

// Subject on the left, figure on the right; every row lands on the same two edges.
export const CardMetricRow = ({
 subject,
 figure,
 variant = 'foot',
}: CardMetricRowProps) => (
 <div className={`domainCard__blockRow domainCard__blockRow--${variant}`}>
  {subject}
  {figure}
 </div>
);

type CardMetricBlockProps = {
 // The head: what is being measured, and the whole it is measured against.
 label: string;
 amount: string;
 // Percent of the whole, not a 0-1 ratio; it may exceed 100 (a month can spend
 // 142% of its budget). null when the whole is zero: there is no denominator, and
 // an empty track would claim nothing was spent, so the bar is omitted.
 progress: number | null;
 // What the bar is a share of, in words; without it a screen reader announces a
 // bare percentage.
 progressLabel: string;
 tone: ProgressTone;
 // The status mark, drawn on the foot line it grades. Typed as StatusSquare types
 // it: the narrower SquareClass would be wrong because budgetSquareState returns
 // a plain string and three cards share this block.
 square: string;
 // What is left of the whole, in the caller's own wording ("left" for a budget,
 // "still to allocate" for a pocket); the block never words it.
 remainder: string;
 // The share with its word ("spent"): a bare percentage beside a remainder reads
 // as the share left, the opposite figure.
 share: string;
 // Status class of the share; take it from the same call that chose square and
 // tone so the three marks cannot contradict each other.
 shareLevel: string;
};

export const CardMetricBlock = ({
 label,
 amount,
 progress,
 progressLabel,
 tone,
 square,
 remainder,
 share,
 shareLevel,
}: CardMetricBlockProps) => (
 <div className='domainCard__block'>
  <CardMetricRow
   variant='head'
   subject={<span className='domainCard__blockLabel'>{label}</span>}
   figure={<span className='domainCard__blockAmount'>{amount}</span>}
  />

  {progress !== null && (
   <ProgressBar value={progress} tone={tone} label={progressLabel} />
  )}

  <CardMetricRow
   subject={
    <span className='domainCard__blockLead'>
     <StatusSquare alert={square} />
     {remainder}
    </span>
   }
   figure={
    // Withheld with the bar: with no denominator there is no share to state.
    progress === null ? null : (
     <span className={`domainCard__share domainCard__share--${shareLevel}`}>
      {share}
     </span>
    )
   }
  />
 </div>
);

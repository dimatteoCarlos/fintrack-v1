// A part-of-whole bar, drawn only: the caller resolves the share and the tone, so the bar,
// the status square and the percentage on one row cannot light from separate decisions.

import './styles/progressBar-styles.css';

// The status vocabulary emitted by helpers/budgetStatus.ts and helpers/pocketStatus.ts, so
// a bar cannot show a tone that the square beside it lacks.
export type ProgressTone = 'neutral' | 'ok' | 'warning' | 'alert' | 'info';

type ProgressBarProps = {
 // 0-100, and values above 100 are expected (a month can spend 142% of its budget). The
 // fill is clamped because a bar cannot draw past its track; the announced figure is not
 // (aria-valuetext).
 value: number;
 // What the bar is a share of; required, since an unlabelled bar announces a bare percentage.
 label: string;
 tone?: ProgressTone;
};

export const ProgressBar = ({ value, label, tone = 'neutral' }: ProgressBarProps) => {
 const fill = Math.min(Math.max(value, 0), 100);

 return (
  <div
   className='progressBar'
   role='progressbar'
   aria-label={label}
   aria-valuemin={0}
   aria-valuemax={100}
   // Clamped: a value outside the declared range is invalid ARIA and assistive technology
   // may ignore the whole element. The real figure travels in valuetext.
   aria-valuenow={Math.min(Math.round(value), 100)}
   aria-valuetext={`${Math.round(value)}%`}
  >
   <div
    className={`progressBar__fill progressBar__fill--${tone}`}
    style={{ width: `${fill}%` }}
   />
  </div>
 );
};

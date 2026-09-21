// One figure over a list: what the rows below add up to. It never sums anything: the
// amount is a prop read off the server payload, because a browser-side total is a second
// answer that disagrees once the list is paged, filtered or cut at a different date.

import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../helpers/constants';
import { currencyFormat } from '../../helpers/functions';

import './styles/panelTotal-styles.css';

// Grouping and decimal marks are a locale, not a currency; the figure's currency arrives
// with it.
const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// No figure yet, or none reported. Never 0, which is a real total and would claim the
// accounts hold nothing.
const NO_FIGURE = '—';

type PanelTotalProps = {
 // What the figure is, in the reader's words; carries the scope when the list underneath
 // does not make it obvious.
 label: string;
 amount: number | null;
 // From the payload, never a constant: a component naming its own currency can label a
 // figure with a currency it is not in.
 currency: string;
 // When the figure was measured, or anything else needed to reconcile it with the rows.
 note?: string | null;
 // 'stacked': label and amount on one line, the note spanning both columns under them.
 // 'inline': the same three values on one line, for a total beside a heading.
 // One component, so both forms share the rule that null renders as a dash.
 variant?: 'stacked' | 'inline';
};

export const PanelTotal = ({
 label,
 amount,
 currency,
 note,
 variant = 'stacked',
}: PanelTotalProps) => (
 <div className={`panelTotal panelTotal--${variant}`}>
  <span className='panelTotal__label'>{label}</span>

  <span className='panelTotal__amount'>
   {amount === null ? NO_FIGURE : currencyFormat(currency, amount, formatNumberCountry)}
  </span>

  {note && <span className='panelTotal__note'>{note}</span>}
 </div>
);

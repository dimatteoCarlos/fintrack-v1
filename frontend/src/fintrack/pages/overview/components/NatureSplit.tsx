// How the month's spending splits across the four nature tags.

import { currencyFormat } from '../../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { countNoun, percent } from '../helpers/rankedBreakdown';
import { OverviewNatureSplit } from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

type NatureSplitProps = {
 split: OverviewNatureSplit;
 currency: string;
};

function NatureSplit({ split, currency }: NatureSplitProps) {
 const money = (value: number) =>
  currencyFormat(currency, value, formatNumberCountry);

 // The block follows the chart's selection (whole domain or one category), so
 // the scope is restated in the heading, every row and the caption: a share
 // with an unnamed denominator misleads.
 const scope = split.categoryName;
 // One scale for all eight bars, so the rows compare in money while the
 // percentage on each row carries the composition.
 const ceiling = Math.max(
  0,
  ...split.rows.map((row) => Math.max(row.spent, row.budget)),
 );
 const widthOf = (value: number) =>
  ceiling > 0 ? `${(value / ceiling) * 100}%` : '0%';

 return (
  <section
   className={`natureSplit${scope ? ' natureSplit--narrowed' : ''}`}
   aria-label={`Spending by nature${scope ? ` in ${scope}` : ''}`}
  >
   <div className='natureSplit__head'>
    <h4 className='natureSplit__title'>
     Spending by nature
     {scope && <span className='natureSplit__scope'>{` · ${scope}`}</span>}
    </h4>
    <span className='natureSplit__meta'>
     {`${money(split.spentTotal)} of ${money(split.budgetTotal)} budgeted`}
    </span>
   </div>

   {/* Four fixed rows in the server's catalog order, never re-sorted: a
       composition read against last month's four, not a ranking. */}
   <ul className='natureSplit__rows'>
    {split.rows.map((row) => {
     const empty = row.accountCount === 0;

     return (
      <li
       className={`natureSplit__row${empty ? ' natureSplit__row--empty' : ''}`}
       key={row.nature}
      >
       <span className='natureSplit__name'>{row.nature}</span>

       {/* The chart's own inks (solid spent, outline budget), no hue per nature:
           the semaphore colours are reserved for qualifying a figure. */}
       <span className='natureSplit__bars'>
        <span
         className='natureSplit__bar natureSplit__bar--spent'
         style={{ width: widthOf(row.spent) }}
        />
        <span
         className='natureSplit__bar natureSplit__bar--budget'
         style={{ width: widthOf(row.budget) }}
        />
       </span>

       <span className='natureSplit__figures'>
        {/* An unused nature keeps its row, so the block always shows four. */}
        {empty ? (
         <span className='natureSplit__none'>— no accounts</span>
        ) : (
         <>
          <span className='natureSplit__spent'>{money(row.spent)}</span>
          <span className='natureSplit__share'>
           {`${percent(row.share)}${scope ? ` of ${scope}` : ''}`}
          </span>
          <span className='natureSplit__budget'>
           {`of ${money(row.budget)} budgeted`}
          </span>
         </>
        )}
       </span>
      </li>
     );
    })}
   </ul>

   <p className='natureSplit__caption'>
    {`Each share is of the ${money(split.spentTotal)} spent ${
     scope ? `in ${scope}, not of the month` : 'across every expense category'
    }. Solid is spent, the outline is the budget, both on one scale.`}
    {/* Counted outside the four, not folded into 'other', which is a chosen
        value: an absent tag is a gap. */}
    {split.untaggedCount > 0 &&
     ` ${split.untaggedCount} ${countNoun(
      split.untaggedCount,
      'accounts',
     )} ${split.untaggedCount === 1 ? 'carries' : 'carry'} no nature and ${
      split.untaggedCount === 1 ? 'is' : 'are'
     } outside the four, holding ${money(split.untaggedSpent)}.`}
   </p>
  </section>
 );
}

export default NatureSplit;

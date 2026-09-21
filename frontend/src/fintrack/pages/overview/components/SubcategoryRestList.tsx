// The accounts folded into the flat ranking's tail bar, opened as a list.

import { currencyFormat } from '../../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { countNoun, percent } from '../helpers/rankedBreakdown';
import { OverviewExpenseSubcategory } from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

type SubcategoryRestListProps = {
 rows: OverviewExpenseSubcategory[];
 currency: string;
 // The scope's whole spending, so a row's share is of the month and not of the
 // fold — a share of the fold would call a small account large.
 spentTotal: number;
};

// A list, not a second Pareto: charting the small tail members would invite reading importance
// into them, and the share column keeps a concentrated tail visible. Every folded account is
// listed (no cut); the box scrolls.
function SubcategoryRestList({
 rows,
 currency,
 spentTotal,
}: SubcategoryRestListProps) {
 const money = (value: number) =>
  currencyFormat(currency, value, formatNumberCountry);

 return (
  <div className='restList'>
   <table className='restList__table'>
    <caption className='restList__caption'>
     {`The ${rows.length} ${countNoun(
      rows.length,
      'budget accounts',
     )} below the cut, ordered by spending`}
    </caption>
    <thead>
     <tr>
      <th className='restList__head' scope='col'>
       Account
      </th>
      <th className='restList__head restList__head--figure' scope='col'>
       Spent
      </th>
      <th className='restList__head restList__head--figure' scope='col'>
       Budget
      </th>
      <th className='restList__head restList__head--figure' scope='col'>
       Share
      </th>
     </tr>
    </thead>
    <tbody>
     {rows.map((row) => (
      <tr className='restList__row' key={row.accountId}>
       <td className='restList__cell'>
        <span className='restList__name'>
         {row.subcategoryName}
         {row.nature && (
          <span className='restList__nature'>{` (${row.nature})`}</span>
         )}
        </span>
        <span className='restList__category'>{row.categoryName ?? '—'}</span>
       </td>
       <td className='restList__cell restList__cell--figure'>
        {/* Nothing spent is said in words: a reader scanning a column of amounts
            for size would skip a zero. */}
        {row.actualSpent === 0 ? (
         <span className='restList__zero'>nothing spent</span>
        ) : (
         money(row.actualSpent)
        )}
       </td>
       <td className='restList__cell restList__cell--figure'>
        {row.budgetAmount > 0 ? (
         money(row.budgetAmount)
        ) : (
         <span className='restList__zero'>no budget</span>
        )}
        {row.isOverBudget && (
         <span className='restList__over'> · over</span>
        )}
       </td>
       <td className='restList__cell restList__cell--figure'>
        {spentTotal > 0 ? percent(row.actualSpent / spentTotal) : '—'}
       </td>
      </tr>
     ))}
    </tbody>
   </table>
  </div>
 );
}

export default SubcategoryRestList;

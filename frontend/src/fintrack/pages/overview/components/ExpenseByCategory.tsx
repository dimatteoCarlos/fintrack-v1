// Adapter from the server's expense rows to ParetoBar's shape; it holds no drawing, so the level-2 and
// level-3 screens mount the same bar. The rows arrive unconditionally as charts.expenseCategories
// (outside the withAnalysis spread: a running total is only correct over the complete set).

import ParetoBar, { ParetoRow } from './ParetoBar';
import DonutChart from './DonutChart';
import CollapsibleBlock from './CollapsibleBlock';
import { CardTitle } from '../../../general_components/CardTitle';
import { currencyFormat } from '../../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import { monthLabel } from '../helpers/monthLabel';
import {
 OverviewExpenseCard,
 OverviewExpenseCategory,
} from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// actualSpent is typed as a number and arrives null when the category's
// accounts span currencies - the row the server ranks last. Defended here
// rather than in ParetoBar so the drawing never receives a null at all.
const spentOf = (category: OverviewExpenseCategory) => category.actualSpent ?? 0;

// A row's share is the difference of two published running shares, never amount / total: a second
// arithmetic would let bar widths and printed percentages diverge at the fourth decimal.
const toParetoRows = (categories: OverviewExpenseCategory[]): ParetoRow[] =>
 categories.map((category, index) => ({
  // The category name and not the index: the ranking reorders every month, and
  // ExpenseCategoryStatus carries no id for the page to use instead. The name
  // is unique inside one owner's breakdown, which is what a key needs to be.
  key: category.categoryName,
  label: category.categoryName,
  amount: spentOf(category),
  share:
   category.cumulativePercentage -
   (index === 0 ? 0 : categories[index - 1].cumulativePercentage),
  cumulativeShare: category.cumulativePercentage,
  isFlagged: category.isOverBudget,
 }));

// Takes its rows and not a store, so the two screens do not repeat one reading:
// level 1 reads charts.expenseCategories off the page payload; level 2 mounts
// CategoryBudgetPareto instead.
type ExpenseByCategoryProps = {
 categories: OverviewExpenseCategory[];
 card: OverviewExpenseCard;
 // 'YYYY-MM-01', the month both titles name. A prop because level 2 reads it
 // off its own answer rather than off the store.
 referenceMonth: string | null;
};

// The store-backed level-1 mount. A wrapper and not a copy: the store read is
// the only thing that belongs to level 1, and the drawing below belongs to both.
function ExpenseByCategory() {
 const charts = useOverviewStore((state) => state.charts);
 const domainCards = useOverviewStore((state) => state.domainCards);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);

 if (!charts || !domainCards) return null;

 return (
  <ExpenseBreakdown
   categories={charts.expenseCategories}
   card={domainCards.expense}
   referenceMonth={referenceMonth}
  />
 );
}

export function ExpenseBreakdown({
 categories,
 card,
 referenceMonth,
}: ExpenseByCategoryProps) {
 // Empty is a real answer, not an error: with no categorised spending an empty
 // track would say the figures failed to arrive, and the expense card above
 // already states the month's total.
 if (categories.length === 0) return null;

 const expense = card;

 // The last row's running total is the denominator the server divided by, so the
 // figure above the bar and the percentages inside it come from one sum; taking
 // categorizedExpense from the card would put two paths behind one number.
 const total = categories[categories.length - 1].cumulativeActual;

 // Stated in words under the bar, not drawn as a segment: it sits outside the set
 // the server ranked, so a segment would make every width a share of one total
 // while the printed percentage stays a share of another.
 const uncategorized = expense.hasUncategorizedExpense
  ? currencyFormat(
     expense.currency,
     expense.totalAmount - expense.categorizedExpense,
     formatNumberCountry,
    )
  : null;

 const rows = toParetoRows(categories);

 // Stated once and handed to both drawings, so the advisory line cannot say one
 // thing under the bar and another under the ring.
 const caption = uncategorized
  ? `${uncategorized} more was spent without a category and is not ranked here`
  : undefined;

 // Two folds over one array (bar: how few categories carry the month; ring: each one's share); the
 // ring opens closed because the ranking is the primary reading.
 return (
  <>
   <CollapsibleBlock
    head={
     <CardTitle subtitle={monthLabel(referenceMonth, 'long')}>
      Expense by category
     </CardTitle>
    }
    isRuled
   >
    {/* Single-column modifier: the bar is one figure across the row, not one of
        a pair. */}
    <section className='domainCards domainCards--single'>
     <ParetoBar
      rows={rows}
      currency={expense.currency}
      total={total}
      totalLabel='categorised spending'
      unitLabel='categories'
      caption={caption}
     />
    </section>
   </CollapsibleBlock>

   <CollapsibleBlock
    head={
     <CardTitle subtitle={monthLabel(referenceMonth, 'long')}>
      Share of the month
     </CardTitle>
    }
    defaultOpen={false}
    isRuled
   >
    <section className='domainCards domainCards--single'>
     <DonutChart
      rows={rows}
      currency={expense.currency}
      total={total}
      totalLabel='categorised spending'
      unitLabel='categories'
      caption={caption}
     />
    </section>
   </CollapsibleBlock>
  </>
 );
}

export default ExpenseByCategory;

// Budget variance tornado chart: signed bars from a central axis, sorted by magnitude.
// `variance` is budget minus spent; the UI says `Remaining over / left`. Two levels: categories, or one
// category's subcategories, filtered from BudgetLayout's single call so the levels never disagree.

import {
 Link,
 useNavigate,
 useParams,
 useSearchParams,
} from 'react-router-dom';

// '?react' and not the bare form: only that import carries a React type, so the
// glyph can take a className and be sized by the stylesheet.
import ArrowLeftSolidSvg from '../../../assets/budgetSvg/ArrowLeftSolidSvg.svg?react';

import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../helpers/constants.ts';
import {
 currencyFormat,
 formatBudgetMonthLabel,
} from '../../helpers/functions.ts';
import { useBudgetStatusStore } from '../../stores/useBudgetStatusStore.ts';
import { BudgetCategoryStatus } from '../../types/budgetTypes.ts';
import './styles/budgetVariance.css';

// Budget minus spent, which is what the server already serves as
// remainingBudget: signed, negative once the line is past its plan. Read rather
// than recomputed, so this screen and the list cannot drift.
type VarianceRow = {
 key: string;
 label: string;
 variance: number;
 currency: BudgetCategoryStatus['currency'];
 // The category this row opens, or null when the row is already a subcategory
 // and has nothing under it.
 drillTo: string | null;
};

// `left` and `over`, not `favorable` and `unfavorable`: budgetRemainWord returns
// exactly these two and every category row on the board already ends in one, so
// a second vocabulary would make the reader learn the screen.
const remainWord = (variance: number) => (variance >= 0 ? 'left' : 'over');

// A category opens only when there is a comparison inside it. One bar drawn
// against itself fills half the track whatever its size, which states a
// magnitude the chart cannot support.
const MIN_ROWS_TO_DRILL = 2;

function BudgetVariance() {
 const [searchParams] = useSearchParams();
 const month = searchParams.get('month');
 const navigate = useNavigate();

 // Present only on budget/variance/:categoryName. useParams decodes the
 // segment, so a name with a space arrives here as it is stored.
 const { categoryName: drilledCategory } = useParams();

 const accounts = useBudgetStatusStore((state) => state.accounts);
 const referenceMonth = useBudgetStatusStore((state) => state.referenceMonth);
 const categories = useBudgetStatusStore((state) => state.categories);
 const isLoading = useBudgetStatusStore((state) => state.isLoading);
 const error = useBudgetStatusStore((state) => state.error);

 // A line with no budget has no plan to be away from, so it has no variance -
 // not a variance of zero, which would draw a bar at the axis and claim the
 // line landed exactly on a plan it never had.
 const budgetedAccounts = accounts.filter(
  (account) => account.budgetAmount > 0,
 );

 // Counted from accounts[], not the category's accountCount, which includes unbudgeted accounts and
 // would offer a drill into a chart with one bar or none.
 const drillableRows = budgetedAccounts.reduce<Record<string, number>>(
  (perCategory, account) => {
   perCategory[account.categoryName] =
    (perCategory[account.categoryName] ?? 0) + 1;
   return perCategory;
  },
  {},
 );

 const categoryRows: VarianceRow[] = categories
  .filter(
   (category): category is BudgetCategoryStatus & { remainingBudget: number } =>
    category.budgetAmount !== null &&
    category.budgetAmount > 0 &&
    category.remainingBudget !== null,
  )
  .map((category) => ({
   key: category.categoryName,
   label: category.categoryName,
   variance: category.remainingBudget,
   currency: category.currency,
   drillTo:
    (drillableRows[category.categoryName] ?? 0) >= MIN_ROWS_TO_DRILL
     ? category.categoryName
     : null,
  }));

 // subcategory ?? accountName is the same fallback level 2 of the list uses: the
 // column is nullable and the account name is what the owner typed, so the cell
 // is never blank.
 const subcategoryRows: VarianceRow[] = budgetedAccounts
  .filter((account) => account.categoryName === drilledCategory)
  .map((account) => ({
   key: String(account.accountId),
   label: account.subcategory ?? account.accountName,
   variance: account.remainingBudget,
   currency: account.currency,
   drillTo: null,
  }));

 const rows = (drilledCategory ? subcategoryRows : categoryRows).sort(
  (a, b) => Math.abs(b.variance) - Math.abs(a.variance),
 );

 const monthLabel = formatBudgetMonthLabel(referenceMonth);

 const levelWord = drilledCategory ? 'subcategory' : 'category';
 const levelWordPlural = drilledCategory ? 'subcategories' : 'categories';

 const unbudgeted = drilledCategory
  ? accounts.filter((account) => account.categoryName === drilledCategory)
    .length - rows.length
  : categories.length - rows.length;

 // Shared scale so bar lengths are comparable; recomputed per level, so a subcategory is compared
 // against its siblings, never against a category total that contains it.
 const widest = Math.max(0, ...rows.map((row) => Math.abs(row.variance)));

 // An object, not withMonthParam('..', month), which concatenates into '..?month=...'. One expression
 // serves both levels: relative='path' resolves against the URL, going up one level each time.
 const backTo = { pathname: '..', search: month ? `?month=${month}` : '' };
 const backLabel = drilledCategory ? 'All categories' : 'Category list';

 const openCategory = (categoryName: string) =>
  navigate({
   pathname: encodeURIComponent(categoryName),
   search: month ? `?month=${month}` : '',
  });

 return (
  <section className='budgetVariance' aria-label='Spent vs budget'>
   <div className='budgetVariance__head'>
    {/* Same wording as the list header (`Spent / Budget`); the drilled name is ochre to mark it as the
        reader's choice. */}
    <h2 className='budgetVariance__title'>
     Spent vs budget
     {drilledCategory && (
      <>
       {' · '}
       <span className='budgetVariance__subject'>{drilledCategory}</span>
      </>
     )}
    </h2>

    {/* After the heading in the DOM so reading and visual order agree. Relative, not absolute: the link
        works wherever the module is mounted. */}
    <Link className='budgetVariance__back' to={backTo} relative='path'>
     <ArrowLeftSolidSvg
      className='budgetVariance__backArrow'
      aria-hidden='true'
     />
     {backLabel}
    </Link>
   </div>

   {/* What a bar measures, in money, and when. `this month` would be a claim the
       screen cannot make, since the month picker can stand on any month; the
       label is the month the server resolved and returned. */}
   <p className='budgetVariance__caption'>
    {`The difference between budget and actual spending, per ${levelWord}`}
    {monthLabel && `, in ${monthLabel}`}.
   </p>

   {error && (
    <p className='budgetVariance__notice' role='alert'>
     The budget summary could not be loaded.
    </p>
   )}

   {!error && isLoading && (
    <p className='budgetVariance__notice' role='status'>
     Loading the month…
    </p>
   )}

   {!error && !isLoading && rows.length === 0 && (
    <p className='budgetVariance__notice'>
     {drilledCategory
      ? `No subcategory of ${drilledCategory} carries a budget this month, so there is no plan to measure against.`
      : 'No category carries a budget this month, so there is no plan to measure against.'}
    </p>
   )}

   {!error && !isLoading && rows.length > 0 && (
    <>
     {/* The level, named over the column that holds it, as the board heads its
         rows `Category List` and level 2 of the list heads its own `Subcategory`.
         Without it a reader cannot tell which level is being ranked. */}
     <div className='budgetVariance__columns'>
      <span>{drilledCategory ? 'Subcategory' : 'Category'}</span>

      {/* aria-hidden: each row already ends in `over` or `left` as text, so a
          reader who is not looking at the bars has the direction anyway. */}
      <span className='budgetVariance__columnAxis' aria-hidden='true'>
       Over / left
      </span>

      {/* `Remaining`, not `Balance`: the hero and the board use it for the same figure, and the phrase
          `Remaining over / left` is split across the two columns. */}
      <span className='budgetVariance__columnAmount'>Remaining</span>
     </div>

     <ol className='budgetVariance__rows'>
      {rows.map((row) => {
       const currencyCode = row.currency ?? DEFAULT_CURRENCY;
       const formatNumberCountry = CURRENCY_OPTIONS[currencyCode];
       const word = remainWord(row.variance);

       // Half the track is the widest variance, so a bar never crosses the
       // axis into the other half's meaning.
       const share = widest === 0 ? 0 : (Math.abs(row.variance) / widest) * 50;

       const cells = (
        <>
         <span className='budgetVariance__name'>
          <span className='budgetVariance__nameText'>{row.label}</span>
          {row.drillTo && (
           <span className='budgetVariance__chevron' aria-hidden='true'>
            ›
           </span>
          )}
         </span>

         {/* aria-hidden: the figure beside it already states the same fact in words and money. */}
         <span className='budgetVariance__track' aria-hidden='true'>
          <span className='budgetVariance__axis' />
          {/* No bar for zero variance: the stylesheet floors every bar at 2px, which would draw one. */}
          {row.variance !== 0 && (
           <span
            className={`budgetVariance__bar budgetVariance__bar--${word}`}
            style={{ inlineSize: `${share}%` }}
           />
          )}
         </span>

         <span
          className={`budgetVariance__amount budgetVariance__amount--${word}`}
         >
          {currencyFormat(
           currencyCode,
           Math.abs(row.variance),
           formatNumberCountry,
          )}
          {/* Absolute value above: the word carries the sign, as in the board's rows. */}
          <span className='budgetVariance__direction'>({word})</span>
         </span>
        </>
       );

       return (
        <li className='budgetVariance__row' key={row.key}>
         {/* A button, not a Link: its label names the action, since the three cells alone read as
             unconnected values to a screen reader. */}
         {row.drillTo ? (
          <button
           type='button'
           className='budgetVariance__cells budgetVariance__cells--drill'
           onClick={() => openCategory(row.drillTo as string)}
           aria-label={`Break ${row.label} down by subcategory`}
          >
           {cells}
          </button>
         ) : (
          <div className='budgetVariance__cells'>{cells}</div>
         )}
        </li>
       );
      })}
     </ol>

     {/* The denominator of the ranking, named. Without it a reader cannot tell
         whether the lines missing from the chart were left out or simply do
         not exist. */}
     <p className='budgetVariance__foot'>
      {`${rows.length} budgeted ${
       rows.length === 1 ? levelWord : levelWordPlural
      }, ranked by how far each landed from its plan`}
      {unbudgeted > 0 &&
       `. ${unbudgeted} more ${
        unbudgeted === 1 ? 'carries' : 'carry'
       } no budget and are not drawn`}
     </p>
    </>
   )}
  </section>
 );
}

export default BudgetVariance;

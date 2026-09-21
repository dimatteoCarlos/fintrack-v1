import {
  BoxRow,
  StatusSquare,
} from '../../../general_components/boxComponents/BoxComponents.tsx';
import {
  currencyFormat,
  numberFormatCurrency,
  withMonthParam,
} from '../../../helpers/functions.ts';

import { DEFAULT_CURRENCY, CURRENCY_OPTIONS } from '../../../helpers/constants.ts';
import {
  budgetRemainWord,
  budgetSquareState,
  budgetStatusLevel,
  isUnbudgeted,
} from '../../../helpers/budgetStatus.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';

import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { BudgetCategoryStatus } from '../../../types/budgetTypes.ts';
import {
  DEFAULT_SORT_DIRECTION,
  useBudgetListFilter,
  type BudgetQuickFilter,
  type BudgetSortDirection,
  type BudgetSortKey,
} from '../hooks/useBudgetListFilter.ts';
import BudgetListControls, {
  type BudgetListState,
  type BudgetSortOption,
} from './BudgetListControls.tsx';
type ListCategoryProp = { previousRoute: string };

// A figure the server could not compute renders as this, never as a zero.
const DASH = '—';

// Declared outside the component: useBudgetListFilter lists both in its dependency array, so a new
// arrow per render would defeat its memo.
const searchableText = (category: BudgetCategoryStatus) => [
  category.categoryName,
];
const sortName = (category: BudgetCategoryStatus) => category.categoryName;

// Keys this level offers; `subcategory` is absent because a category has none (level 2 lists accounts).
// A label names what the key orders, not the field behind it: `name` reads as "Category" here.
const SORT_OPTIONS: BudgetSortOption[] = [
  { value: 'name', label: 'Category' },
  { value: 'spent', label: 'Spent' },
  { value: 'remaining', label: 'Remaining' },
  // Abbreviates the header's "% of spent budget": this control has no room for the long form.
  { value: 'execution', label: '% spent' },
];

// A URL can hold anything; an unrecognised key would leave the select matching no option, so it falls
// back to the default.
const toSortKey = (value: string | null): BudgetSortKey =>
  SORT_OPTIONS.some((option) => option.value === value)
    ? (value as BudgetSortKey)
    : 'name';

// Absent means "not chosen", not "ascending": each key opens on the direction that puts the most
// relevant row first.
const toSortDirection = (
  value: string | null,
  sort: BudgetSortKey,
): BudgetSortDirection =>
  value === 'asc' || value === 'desc' ? value : DEFAULT_SORT_DIRECTION[sort];

// Only the narrowing filter travels in the URL; `all` is the default, so it is written as no parameter.
const toQuickFilter = (value: string | null): BudgetQuickFilter =>
  value === 'over' ? 'over' : 'all';

function ListCategory({ previousRoute }: ListCategoryProp) {
  // BudgetLayout issues the one request. The server folds accounts by category from the same rounded
  // rows level 2 renders, so a group header reconciles with the accounts under it.
  const categories = useBudgetStatusStore((state) => state.categories);
  const isLoading = useBudgetStatusStore((state) => state.isLoading);
  const error = useBudgetStatusStore((state) => state.error);

  // Level 2 is a sibling route that re-reads the month from its own URL; a link that dropped it would
  // report a different month from the row that was clicked.
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month');
  const navigate = useNavigate();

  // Filter state lives in the URL like the month: entering a category unmounts this list, so state would
  // not survive the trip back. Sliced as well as capped on the input, since maxLength does not cover a
  // hand-written URL.
  const search = (searchParams.get('q') ?? '').slice(
    0,
    NAME_MAX_LENGTHS.category_name,
  );
  const sort = toSortKey(searchParams.get('sort'));
  const direction = toSortDirection(searchParams.get('dir'), sort);
  const quickFilter = toQuickFilter(searchParams.get('status'));

  // Merged, never overwritten: month, q, sort and dir share one query string and a plain object would
  // replace all of it. Replaced in history, not pushed, so typing adds no entry per character. Takes a
  // set of keys because changing the sort must clear the direction in the same write.
  const setListParams = (values: Record<string, string>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) => {
          if (value) next.set(key, value);
          else next.delete(key);
        });
        return next;
      },
      { replace: true },
    );
  };

  const { rows, matched, total, isFiltered } = useBudgetListFilter({
    rows: categories,
    search,
    sort,
    direction,
    quickFilter,
    searchableText,
    sortName,
  });

  // A failed request and an empty month look the same to the bar: nothing to filter, so it hides.
  const listState: BudgetListState = error
    ? 'unavailable'
    : isLoading
    ? 'loading'
    : 'ready';

  return (
    <>
      <BudgetListControls
        search={search}
        onSearchChange={(value) => setListParams({ q: value })}
        searchLabel='Search categories'
        // A longer term could never match; the search is a substring match, so the cap hides no row.
        searchMaxLength={NAME_MAX_LENGTHS.category_name}
        sort={sort}
        // Direction is cleared, not carried: each key opens on its own default, else `Category` would
        // open at Z-A.
        onSortChange={(value) => setListParams({ sort: value, dir: '' })}
        sortOptions={SORT_OPTIONS}
        direction={direction}
        onDirectionChange={(value) => setListParams({ dir: value })}
        quickFilter={quickFilter}
        // 'all' is written as an empty value, which setListParams deletes, so the default leaves no parameter.
        onQuickFilterChange={(value) =>
          setListParams({ status: value === 'all' ? '' : value })
        }
        matched={matched}
        total={total}
        isFiltered={isFiltered}
        state={listState}
        // The month travels with the link, as in every category link below: the variance screen reads the
        // month it is handed, not the calendar's.
        onOpenVariance={() => navigate(withMonthParam('variance', month))}
      />

      {/* Own class for the scroll: list__main__container is rendered by six lists (budget, pocket, debts,
          account detail) and the stylesheets are global, so bounding it would confine all six. */}
      <article className='list__main__container categoryList'>
        {rows.map((category) => {
          const {
            categoryName,
            actualSpent,
            budgetAmount,
            remainingBudget,
            executionPercentage,
            isOverBudget,
            currency,
          } = category;

          const currency_code = currency ?? DEFAULT_CURRENCY;
          const formatNumberCountry = CURRENCY_OPTIONS[currency_code];

          // Nothing budgeted and nothing spent: no square, word or share. Decided in budgetStatus.ts so
          // this row and the header agree on what an unmeasured budget looks like.
          const unbudgeted = isUnbudgeted(budgetAmount, actualSpent);

          // Share of the budget used. Served, not derived: it is the percentage the sort orders by and
          // the header names, and a second division over the amounts could round differently.
          const usedText = unbudgeted
            ? ''
            : executionPercentage === null
            ? DASH
            : executionPercentage.toFixed(1) + '%';

          // Every figure is nullable for one case: accounts in more than one currency, which V1 does not
          // allow. Renders a dash, never a zero, if the model ever widens.
          const spentText =
            actualSpent === null
              ? DASH
              : currencyFormat(currency_code, actualSpent, formatNumberCountry);

          const budgetText =
            budgetAmount === null
              ? DASH
              : currencyFormat(currency_code, budgetAmount, formatNumberCountry);

          const remainText =
            remainingBudget === null
              ? DASH
              : numberFormatCurrency(
                  Math.abs(remainingBudget),
                  2,
                  currency_code,
                  formatNumberCountry,
                );

          const remainWord = budgetRemainWord(
            budgetAmount,
            actualSpent,
            remainingBudget,
          );

          return (
           <div className='box__container .flx-row-sb' key={categoryName}>
              <BoxRow>
                {/* Only the return path travels: level 2 reads the same store, so nothing carried in
                    state could be fresher. */}
                <Link
                  to={withMonthParam(`category/${categoryName}`, month)}
                  state={{
                    previousRoute,
                  }}
                >
                 <div className='box__title box__title--category__name hover '>
                     {categoryName}{' '}
                  </div>
                </Link>

                <div className='box__title--spent'>
                  {spentText}
                  &nbsp;/&nbsp;
                  {budgetText}
                </div>
              </BoxRow>

              {/* One BoxRow, not two nested: its space-between layout puts the remainder left and
                  the share right and needs both as siblings. */}
              <BoxRow>
                <div className='flx-row-sb'>
                  {!unbudgeted && (
                    <StatusSquare
                      alert={budgetSquareState(
                        executionPercentage,
                        isOverBudget,
                      )}
                    />
                  )}
                  <div className='box__subtitle'>
                    &nbsp;
                    {/* Absolute value: the word carries the sign, so a minus would state it twice. */}
                    {remainText}
                    &nbsp;
                    <span className='categoryRow__remainWord'>{remainWord}</span>
                    &nbsp;
                  </div>
                </div>

                {/* Under the amounts pair it is a share of; after `left` it read as the share remaining,
                    the opposite figure. Coloured from the same call as the square, so the two cannot
                    light differently. */}
                {usedText && (
                  <span
                    className={`categoryRow__used categoryRow__used--${budgetStatusLevel(
                      executionPercentage,
                      isOverBudget,
                    )}`}
                  >
                    {usedText}
                  </span>
                )}
              </BoxRow>
            </div>
          );
        })}
      </article>
    </>
  );
}

export default ListCategory;

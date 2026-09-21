// Searchable, sortable list of a category's budget accounts; rendered by CategoryAccountList.tsx.

import {
  BoxRow,
  StatusSquare,
} from '../../../general_components/boxComponents/BoxComponents.tsx';

import {
  capitalize,
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

import { Link, useSearchParams } from 'react-router-dom';
import { BudgetAccountStatus } from '../../../types/budgetTypes.ts';

// '?react': a bare .svg import is typed `string` and cannot take a className.
// Same asset as the pencil in CategoryDetailReading.tsx, so the two cannot diverge.
import EditSvg from '../../../../assets/pencil02Svg.svg?react';

import {
  DEFAULT_SORT_DIRECTION,
  useBudgetListFilter,
  type BudgetQuickFilter,
  type BudgetSortDirection,
  type BudgetSortKey,
} from '../../budget/hooks/useBudgetListFilter.ts';
import BudgetListControls, {
  type BudgetSortOption,
} from '../../budget/components/BudgetListControls.tsx';

import './styles/categoryDetail-styles.css';
type ListAccountOfCategoryProp = {
  previousRoute: string;
  accounts: BudgetAccountStatus[];
  // The row owns the control and the parent owns the panel: this list sits inside
  // a scrolling frame, so a modal opened from here would scroll with the rows.
  onEditAccount: (accountId: number) => void;
  canEdit: boolean;
};

// A figure the server could not compute renders as this, never as a zero.
const DASH = '—';

// Module-level: useBudgetListFilter lists this and sortName in its dependency array,
// so a fresh arrow per render would defeat its memo. Both names are searchable though
// only the subcategory is shown, so an account remembered by its composed name is found.
const searchableText = (account: BudgetAccountStatus) => [
  account.subcategory,
  account.accountName,
];

// The visible label, not the stored field: sorting by a string the row does not
// show would produce an order the reader cannot verify on screen.
const sortName = (account: BudgetAccountStatus) =>
  account.subcategory ?? account.accountName;

// Same four keys as ListCategory.tsx; `name` is labelled Subcategory because that is
// this list's left column, so a separate `subcategory` key would duplicate it.
const SORT_OPTIONS: BudgetSortOption[] = [
  { value: 'name', label: 'Subcategory' },
  { value: 'spent', label: 'Spent' },
  { value: 'remaining', label: 'Remaining' },
  { value: 'execution', label: '% spent' },
];

// A URL is typed by anyone. An unrecognised key would leave the select matching
// no option and showing an empty box, so it falls back to the default.
const toSortKey = (value: string | null): BudgetSortKey =>
  SORT_OPTIONS.some((option) => option.value === value)
    ? (value as BudgetSortKey)
    : 'name';

// Absent means "the reader has not chosen", not "ascending". Each key opens on
// the direction that puts the row worth reading first.
const toSortDirection = (
  value: string | null,
  sort: BudgetSortKey,
): BudgetSortDirection =>
  value === 'asc' || value === 'desc' ? value : DEFAULT_SORT_DIRECTION[sort];

// Only the narrowing filter travels in the URL; `all` is the default, so it
// leaves no parameter behind.
const toQuickFilter = (value: string | null): BudgetQuickFilter =>
  value === 'over' ? 'over' : 'all';

function ListAccountOfCategory({
  previousRoute,
  accounts,
  onEditAccount,
  canEdit,
}: ListAccountOfCategoryProp) {
  // The account screen is a standalone route that reads the month from its URL;
  // the row link carries it there.
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month');

  // The filter lives in the URL because entering an account unmounts this list
  // and state would not survive the trip back. Sliced as well as capped on the
  // input: maxLength does not limit a hand-written URL.
  const search = (searchParams.get('q') ?? '').slice(
    0,
    NAME_MAX_LENGTHS.account_name,
  );
  const sort = toSortKey(searchParams.get('sort'));
  const direction = toSortDirection(searchParams.get('dir'), sort);
  const quickFilter = toQuickFilter(searchParams.get('status'));

  // Merged, never overwritten: month, q, sort and dir share one query string and
  // a plain-object setSearchParams replaces all of it. `replace` avoids one
  // history entry per keystroke.
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
    rows: accounts,
    search,
    sort,
    direction,
    quickFilter,
    searchableText,
    sortName,
  });

  return (
    <>
      {/* No `state` prop: the parent owns loading, error and empty and mounts this
          list only once there are rows. */}
      <BudgetListControls
        search={search}
        onSearchChange={(value) => setListParams({ q: value })}
        searchLabel='Search accounts'
        searchMaxLength={NAME_MAX_LENGTHS.account_name}
        sort={sort}
        // The direction is cleared, not carried: each key opens on its own, and
        // keeping the previous one would open `Subcategory` at Z–A.
        onSortChange={(value) => setListParams({ sort: value, dir: '' })}
        sortOptions={SORT_OPTIONS}
        direction={direction}
        onDirectionChange={(value) => setListParams({ dir: value })}
        quickFilter={quickFilter}
        // 'all' is written as '' so setListParams deletes it: the default filter
        // leaves no parameter in the address bar.
        onQuickFilterChange={(value) =>
          setListParams({ status: value === 'all' ? '' : value })
        }
        matched={matched}
        total={total}
        isFiltered={isFiltered}
      />

      {/* categoryList carries the scroll, as in ListCategory.tsx. list__main__container
          is shared by six lists and the stylesheets are global, so bounding it there
          would confine all six. */}
      <article className='list__main__container categoryList'>
        {rows.map((account) => {
          const {
            accountId,
            accountName,
            subcategory,
            nature,
            currency,
            budgetAmount,
            nextMonthBudget,
            actualSpent,
            remainingBudget,
            executionPercentage,
            isOverBudget,
          } = account;

          const currency_code = currency ?? DEFAULT_CURRENCY;
          const formatNumberCountry = CURRENCY_OPTIONS[currency_code];

          // Nothing budgeted and nothing spent: no square, no word, no share. Decided
          // in budgetStatus.ts so all budget rows and summary boxes agree on it.
          const unbudgeted = isUnbudgeted(budgetAmount, actualSpent);

          // Share of the budget already used, as in ListCategory.tsx and the
          // `% spent` sort key, not the share still left.
          const usedText = unbudgeted
            ? ''
            : executionPercentage === null
            ? DASH
            : executionPercentage.toFixed(1) + '%';
          return (
            <div className='box__container .flx-row-sb' key={accountId}>
              <BoxRow>
                {/* Only the return path travels in state; passing the figures made
                    the account render NaN when opened from the accounting dashboard. */}
                <Link
                  to={withMonthParam(`account/${accountId}`, month)}
                  state={{
                    previousRoute,
                  }}
                >
                  {/* The subcategory alone: the category is already the screen title.
                      The nature is a second element, not a slash, which would
                      recompose the account_name being taken apart. */}
                  <div className='box__title box__title--category__name hover budgetDetail__accountLabel'>
                    {capitalize(subcategory ?? accountName)}

                    {nature && (
                      <span className='budgetDetail__natureTag'>{nature}</span>
                    )}
                  </div>
                </Link>

                {/* BoxRow stays at two children: .box-row is space-between, so a third would centre
                    the spent/budget pair. The button is outside the <Link>: nested in an anchor is invalid. */}
                <div className='budgetDetail__rowAmounts'>
                  <div className='box__title--spent'>
                    {currencyFormat(currency_code, actualSpent, formatNumberCountry)}
                    &nbsp;/&nbsp;
                    {currencyFormat(currency_code, budgetAmount, formatNumberCountry)}
                  </div>

                  {/* Absent, not hidden, in a past month: a hidden button kept
                      its width and pushed the pair off the percentage below. */}
                  {canEdit && (
                    <button
                      type='button'
                      className='budgetDetail__editBudget dark'
                      onClick={() => onEditAccount(accountId)}
                      aria-label={`Edit budget for ${subcategory ?? accountName}`}
                      title='Edit budget'
                    >
                      <EditSvg />
                    </button>
                  )}
                </div>
              </BoxRow>

              {/* One BoxRow, not two nested: its space-between layout needs the
                  remainder and the share as siblings. */}
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
                    {/* Absolute value: the word carries the sign, so a minus
                        in front of it would state the same thing twice. */}
                    {numberFormatCurrency(
                      Math.abs(remainingBudget),
                      2,
                      currency_code,
                      formatNumberCountry,
                    )}
                    &nbsp;
                    <span className='categoryRow__remainWord'>
                      {budgetRemainWord(
                        budgetAmount,
                        actualSpent,
                        remainingBudget,
                      )}
                    </span>
                    &nbsp;
                    {/* After the word, inside this subtitle: it qualifies that
                        sentence. Compared on the two amounts, not on whether a
                        row exists for next month. */}
                    {nextMonthBudget !== budgetAmount && (
                      <span
                        className='budgetDetail__exception'
                        title='This amount applies to this month only'
                      >
                        this month only
                      </span>
                    )}
                  </div>
                </div>

                {/* Sits under the spent/budget pair it is a share of; after `left` it
                    would read as the share remaining. Coloured by the same call as
                    the row's square, so the two cannot light differently. */}
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

export default ListAccountOfCategory;

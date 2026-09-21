import { BoxContainer, BoxRow } from './boxComponents.tsx';
import { currencyFormat } from '../../../helpers/functions.ts';
import { useFetch } from '../../../hooks/useFetch.ts';
import { url_summary_balance_ByType } from '../../../../urlConfig.ts';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents.tsx';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DebtorListSummaryType,
  DebtorListType,
} from '../../../types/responseApiTypes.ts';
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
} from '../../../helpers/constants.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';
import {
  DEFAULT_SORT_DIRECTION,
  useDebtorListFilter,
  type DebtorQuickFilter,
  type DebtorSortDirection,
  type DebtorSortKey,
} from '../hooks/useDebtorListFilter.ts';
import DebtsToolbar from './DebtsToolbar.tsx';

export type DebtsToRenderType = DebtorListType[];

type AccountPropType = { previousRoute: string; accountType: string };
const defaultCurrency = DEFAULT_CURRENCY;
const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];

// A figure the answer did not carry; never 0, since in a financial list a zero is a balance.
const DASH = '—';

// Placeholder rows of the loading state: enough to hold the list's place so the page does not jump when
// the answer lands, few enough not to claim a count the answer has not given yet.
const SKELETON_ROWS = 3;

// A URL can hold anything; an unrecognised key falls back to the value that changes nothing.
const SORT_KEYS: DebtorSortKey[] = ['balance', 'name'];
const toSortKey = (value: string | null): DebtorSortKey =>
  SORT_KEYS.includes(value as DebtorSortKey) ? (value as DebtorSortKey) : 'balance';

const FILTER_KEYS: DebtorQuickFilter[] = ['all', 'debtor', 'lender'];
const toQuickFilter = (value: string | null): DebtorQuickFilter =>
  FILTER_KEYS.includes(value as DebtorQuickFilter)
    ? (value as DebtorQuickFilter)
    : 'all';

const toSortDirection = (
  value: string | null,
  sort: DebtorSortKey,
): DebtorSortDirection =>
  value === 'asc' || value === 'desc' ? value : DEFAULT_SORT_DIRECTION[sort];

function ListOfDebtors({ previousRoute, accountType }: AccountPropType) {
  const { apiData, isLoading, error, status, refetch } =
    useFetch<DebtorListSummaryType>(
      `${url_summary_balance_ByType}?type=${accountType}`,
    );

  // Toolbar state lives in the URL, as in pocket and budget: opening a debtor's detail route unmounts
  // this list, and component state would not survive the trip back.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = (searchParams.get('q') ?? '').slice(
    0,
    NAME_MAX_LENGTHS.account_name,
  );
  const sort = toSortKey(searchParams.get('sort'));
  const direction = toSortDirection(searchParams.get('dir'), sort);
  const quickFilter = toQuickFilter(searchParams.get('status'));

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

  // The hook starts idle and raises isLoading inside its effect, so without this the empty state would
  // paint for a frame before the request leaves.
  const hasAnswer = status !== null || error !== null;

  // Called ahead of the state guards, since a hook cannot sit behind an early return; filtering an empty
  // or stale array while loading is harmless because the guards decide what renders.
  const {
    rows: visibleDebtors,
    matched,
    total,
    isFiltered,
  } = useDebtorListFilter({
    rows: apiData?.data ?? [],
    search,
    sort,
    direction,
    quickFilter,
  });

  // Four outcomes (failed, loading, no debtors, list); the first three must never render a fabricated
  // debtor row, which would be indistinguishable from a real one.
  if (error) {
    return (
      <article className='list__main__container debtorList'>
        <div className='debtorList__state'>
          <p className='debtorList__stateText'>
            The debtor list could not be loaded.
          </p>

          <button
            type='button'
            className='debtorList__retry'
            onClick={refetch}
          >
            Try again
          </button>
        </div>
      </article>
    );
  }

  if (isLoading || !hasAnswer) {
    return (
      <article className='list__main__container debtorList'>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div
            className='box__container debtorList__skeleton'
            key={`debtor-skeleton-${index}`}
            aria-hidden='true'
          >
            <div className='debtorList__skeletonRow'>
              <div className='debtorList__skeletonBar debtorList__skeletonBar--title'></div>
              <div className='debtorList__skeletonBar'></div>
            </div>

            <div className='debtorList__skeletonRow'>
              <div className='debtorList__skeletonBar debtorList__skeletonBar--status'></div>
            </div>
          </div>
        ))}
      </article>
    );
  }

  // The board's own empty state, not the toolbar's: an owner with no debtors is a different answer from
  // a search or filter that matched nothing, which is the toolbar's to word.
  if ((apiData?.data ?? []).length === 0) {
    return (
      <article className='list__main__container debtorList'>
        <div className='debtorList__state'>
          <p className='debtorList__stateText'>
            No debtors yet. Create one to track what is lent and what is owed.
          </p>
        </div>
      </article>
    );
  }

  return (
    <>
      <DebtsToolbar
        search={search}
        onSearchChange={(value) => setListParams({ q: value })}
        sort={sort}
        onSortChange={(value) =>
          setListParams({ sort: value === 'balance' ? '' : value, dir: '' })
        }
        direction={direction}
        onDirectionChange={(value) => setListParams({ dir: value })}
        quickFilter={quickFilter}
        onQuickFilterChange={(value) =>
          setListParams({ status: value === 'all' ? '' : value })
        }
        matched={matched}
        total={total}
        isFiltered={isFiltered}
      />

      <article className='list__main__container debtorList'>
        {visibleDebtors.map((debtor) => {
          const {
            account_name,
            account_id,
            currency_code,
            total_debt_balance,
          } = debtor;

          // The row's own net, not a sum of magnitudes: debt_payable and debt_receivable are both positive
          // on the contract, so adding them is a net only because one of them is zero per row. The hero
          // reads total_debt_balance for the same split.
          const transactionType = total_debt_balance < 0 ? 'lender' : 'debtor';

          return (
            <BoxContainer key={account_id}>
              <BoxRow>
                {/* Absolute: the detail route is declared once (/fintrack/debts/debtor/:debtorId); a
                    relative `to` would resolve against whichever route renders this list. */}
                <Link
                  to={`/fintrack/debts/debtor/${account_id}`}
                  state={{ previousRoute, debtorDetailedData: debtor }}
                >
                  <div className='debtor box__title hover'>{account_name}</div>
                </Link>
                {/* Unsigned and coloured by direction: the line below names the direction in words, so a
                    minus would say it twice and read as a negative debt. Colour is the second carrier,
                    never the only one. */}
                <div
                  className={`box__title debtorRow__amount--${
                    transactionType === 'lender' ? 'owing' : 'owed'
                  }`}
                >
                  {' '}
                  {typeof total_debt_balance === 'number'
                    ? currencyFormat(
                        currency_code ?? defaultCurrency,
                        Math.abs(total_debt_balance),
                        formatNumberCountry,
                      )
                    : DASH}
                </div>
              </BoxRow>

              <BoxRow>
                <BoxRow>
                  <div className='flx-row-sb'>
                    <StatusSquare
                      alert={transactionType == 'lender' ? 'alert' : ''}
                    />
                    <div className='box__subtitle'>
                      &nbsp; {transactionType}{' '}
                      {/* Own span because .box__subtitle capitalises every word, which the role above
                          wants and a sentence does not ("You Owe"). */}
                      <span className='debtorRow__direction'>
                        ·{' '}
                        {transactionType === 'lender'
                          ? 'You owe'
                          : `You're owed`}
                      </span>{' '}
                    </div>
                  </div>
                </BoxRow>
              </BoxRow>
            </BoxContainer>
          );
        })}
      </article>
    </>
  );
}

export default ListOfDebtors;

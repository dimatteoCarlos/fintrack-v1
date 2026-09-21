import {
  BoxContainer,
  BoxRow,
  StatusSquare,
} from '../../../../general_components/boxComponents/BoxComponents';
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
} from '../../../../helpers/constants';
import { BUDGET_NEAR_LIMIT_PERCENT } from '../../../../helpers/budgetStatus';
import {
  capitalize,
  currencyFormat,
  formatDateToDDMMYYYY,
} from '../../../../helpers/functions';
import { AccountTransactionType } from '../../../../types/responseApiTypes';

import './styles/accountTransactionsList-styles.css';

const defaultCurrency = DEFAULT_CURRENCY;
const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];

// What the row cannot state renders as this, never as blank space: a note the
// owner never wrote, or a date the server did not serve.
const DASH = '—';

// Direction of a movement, for the colour that reinforces the sign. Coerced, not
// type-tested: an amount can arrive as text (node-postgres serves DECIMAL that
// way), and a missing figure must colour as nothing rather than as an outflow.
const amountDirection = (amount: number | string | null | undefined) => {
  const value = amount === null || amount === undefined ? NaN : Number(amount);

  if (Number.isNaN(value) || value === 0) return 'flat';

  return value > 0 ? 'in' : 'out';
};

type AccountTransactionsListPropsType = {
  transactions: AccountTransactionType[];
  // Optional on purpose: a screen with no detail to open leaves its rows inert
  // rather than rendering a control that answers nothing.
  onTransactionClick?: (transactionId: number) => void;
  // The month's budget, so a row can state its share of it. Only a category has
  // one, which is the same account type the server serves the accumulator for.
  monthBudget?: number;
};
const AccountTransactionsList = ({
  transactions,
  onTransactionClick,
  monthBudget,
}: AccountTransactionsListPropsType) => {
  // Zero is a budget and spending against it is an overrun, as the summary above
  // this list states (served isOverBudget, red square). A missing denominator is
  // a separate question, handled at spentShare below.
  const budget =
    typeof monthBudget === 'number' && monthBudget >= 0 ? monthBudget : null;

  // The accumulator only ever adds, so a month crosses its budget once and
  // never comes back. The crossing is therefore the oldest row already past it,
  // and since the list runs newest first, it is the last one that qualifies.
  const crossingTransactionId =
    budget === null
      ? null
      : transactions.reduce<number | null>((crossing, item) => {
          const spent = item.month_cumulative_spent;
          return typeof spent === 'number' && spent > budget
            ? item.transaction_id
            : crossing;
        }, null);

  // The row where the month first reached the near-limit threshold, found like the crossing above.
  // A zero budget is excluded: its threshold is zero, so every row would qualify.
  const nearThreshold =
    budget !== null && budget > 0
      ? budget * (BUDGET_NEAR_LIMIT_PERCENT / 100)
      : null;

  const nearTransactionId =
    nearThreshold === null
      ? null
      : transactions.reduce<number | null>((near, item) => {
          const spent = item.month_cumulative_spent;
          return typeof spent === 'number' && spent >= nearThreshold
            ? item.transaction_id
            : near;
        }, null);

  return (
    <>
      <div className='list__main__container'>
        {transactions.length > 0 ? (
          transactions.map((item) => {
            const {
              transaction_id,
              movement_type_name,
              amount,
              currency_code,
              note,
              transaction_local_date,
              transaction_local_time,
              month_cumulative_spent,
              account_balance_after_tr,
            } = item;

            const isClickable = Boolean(onTransactionClick);
            const openDetail = () => onTransactionClick?.(transaction_id);

            // Share of the budget consumed by this row, matching the summary above. A zero budget
            // has no share (division would print '(Infinity%)'), as the server withholds it too.
            const spentShare =
              budget !== null &&
              budget > 0 &&
              typeof month_cumulative_spent === 'number'
                ? (month_cumulative_spent / budget) * 100
                : null;

            const isCrossing = transaction_id === crossingTransactionId;

            // A row that jumps straight past the budget is only the crossing:
            // two verdicts on one movement would be redundant, and the overrun wins.
            const isNear = transaction_id === nearTransactionId && !isCrossing;

            return (
              <BoxContainer
                key={transaction_id}
                className={[
                  'transaction-item',
                  isClickable ? 'transaction-item--clickable' : '',
                  isCrossing ? 'transaction-item--overBudget' : '',
                  isNear ? 'transaction-item--nearBudget' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={isClickable ? openDetail : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? (event) => {
                        // Space scrolls the page by default, which a row acting as
                        // a button must not do.
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDetail();
                        }
                      }
                    : undefined
                }
              >
                <BoxRow className='transaction-header'>
                  <div className='box__title transaction-movement-type'>
                    {capitalize(movement_type_name)}
                  </div>

                  {/* The sign stays: rows are deltas against the opening balance, so the sign is what
                      the owner needs to check the total. Colour only reinforces it. */}
                  <div
                    className={`box__title transactionRow__amount--${amountDirection(
                      amount,
                    )}`}
                    style={{ marginLeft: '0.8rem' }}
                  >
                    {currencyFormat(currency_code, amount, formatNumberCountry)}
                  </div>
                </BoxRow>
                <BoxRow>
                  <BoxRow>
                    <div
                      className='box__subtitle'
                      style={{
                        fontSize: '0.75rem',
                        // Not a lighter weight: a hairline at 12px renders thinner
                        // than the antialiasing drawing it.
                        fontWeight: '400',
                        lineHeight: '1rem',
                        letterSpacing: '0.4px',
                      }}
                    >
                      {/* The note alone, served already split from the narrative
                          (the detail modal still shows the full sentence). Not
                          capitalized: these are the owner's own words. */}
                      <div className='paragraph'>{note ?? DASH}</div>

                      {/* Resolved in SQL on the account owner's calendar; deriving
                          it here from the stored instant would name the
                          neighbouring day near midnight. */}
                      <div className='paragraph'>
                        {/* Day and hour both come from the server, so the stamp cannot name two days.
                            The time is omitted, not dashed, on rows that predate the column. */}
                        Date:{' '}
                        {transaction_local_date
                          ? `${formatDateToDDMMYYYY(transaction_local_date)}${
                              transaction_local_time
                                ? ` · ${transaction_local_time}`
                                : ''
                            }`
                          : DASH}
                      </div>
                    </div>
                  </BoxRow>
                </BoxRow>

                <BoxRow className='transaction-item__totals'>
                  <div className='transaction-item__figure'>
                    <span className='transaction-item__figureLabel'>
                      Balance
                    </span>
                    <div className='box__title transaction-balance-after'>
                      {currencyFormat(
                        currency_code,
                        account_balance_after_tr,
                        formatNumberCountry,
                      )}
                    </div>
                  </div>

                  {/* Only category_budget serves this, and only on the month window.
                      Omitted rather than dashed: an account with no budget has no
                      accumulated spend to withhold. */}
                  {typeof month_cumulative_spent === 'number' && (
                    <div className='transaction-item__figure'>
                      <span className='transaction-item__figureLabel'>
                        Accumulated spent
                      </span>
                      <div className='transaction-item__accumulated-spent'>
                        {currencyFormat(
                          currency_code,
                          month_cumulative_spent,
                          formatNumberCountry,
                        )}
                        {/* Coloured by the same rule as the summary above the list:
                            past the budget is red, short of it teal. */}
                        {spentShare !== null && (
                          <>
                            {' '}
                            <span
                              className={`transaction-item__spentShare ${
                                spentShare > 100
                                  ? 'transaction-item__spentShare--over'
                                  : 'transaction-item__spentShare--left'
                              }`}
                            >
                              ({spentShare.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </BoxRow>

                {/* Only on the row that crossed: the summary says the month ended
                    over budget, only this row says which movement broke it. */}
                {isCrossing && (
                  <BoxRow className='transaction-item__breakRow'>
                    <div className='transaction-item__budgetBreak'>
                      <StatusSquare alert='alert' />
                      Budget exceeded here
                    </div>
                  </BoxRow>
                )}

                {/* The percentage comes from BUDGET_NEAR_LIMIT_PERCENT in
                    budgetStatus.ts (the square and the pill read it too), never
                    hard-coded into the sentence. */}
                {isNear && (
                  <BoxRow className='transaction-item__nearRow'>
                    <div className='transaction-item__budgetNear'>
                      <StatusSquare alert='warning' />
                      {BUDGET_NEAR_LIMIT_PERCENT}% of budget reached here
                    </div>
                  </BoxRow>
                )}
              </BoxContainer>
            );
          })
        ) : (
          <p className='no-transactions'>No transactions found</p>
        )}
      </div>
    </>
  );
};

export default AccountTransactionsList;

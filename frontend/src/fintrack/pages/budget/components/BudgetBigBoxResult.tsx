// The budget hero: total, spent and remaining for the month on screen.
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { currencyFormat } from '../../../helpers/functions';
import { CurrencyType } from '../../../types/types';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents';
import {
  budgetRemainWord,
  budgetSquareState,
  isUnbudgeted,
} from '../../../helpers/budgetStatus';

// Every amount is nullable because the contract withholds them in two cases: the
// answer is still on the wire, or the accounts hold more than one currency and V1
// refuses to add them. Neither is an amount of zero.
type BudgetHeroPropType = {
  budgetAmount: number | null;
  actualSpent: number | null;
  remainingBudget: number | null;
  // Served by the module, never recomputed here. null when the budget is 0:
  // there is no percentage of zero, and its absence is the fact.
  executionPercentage: number | null;
  currency: CurrencyType | null | undefined;
  // Resolved by the parent, so the two squares below cannot disagree. null
  // while the answer is on the wire and in the mixed-currency case.
  isOverBudget: boolean | null;
  // Why the figures read as dashes, in the server's own words. null when there
  // is nothing to explain.
  notice: string | null;
};

const MISSING = '—';

function BudgetBigBoxResult({
  budgetAmount,
  actualSpent,
  remainingBudget,
  executionPercentage,
  currency,
  isOverBudget,
  notice,
}: BudgetHeroPropType) {
  const currency_code = currency ?? DEFAULT_CURRENCY;
  // The locale is the reader's, never the amount's. Taken from the amount's own
  // currency, Intl leaves every currency unmarked and the dollar, the Colombian
  // peso and the Mexican peso all narrow to '$'.
  const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

  const amount = (value: number | null) =>
    value === null
      ? MISSING
      : currencyFormat(currency_code, value, formatNumberCountry);

  const share = (value: number | null) =>
    value === null ? MISSING : `${Math.abs(value).toFixed(1)}%`;

  // Neither half states a share and neither states a side: a dash says a figure
  // was withheld, and here there is no figure to withhold. The two amounts
  // stay, because a spend of zero against a budget of zero is what happened.
  const unbudgeted = isUnbudgeted(budgetAmount, actualSpent);

  // Parenthesised like its neighbour below: both shares gloss the amount beside
  // them, so a mark on only one would read as an inconsistency.
  const spentShare = unbudgeted
    ? null
    : executionPercentage === null
      ? MISSING
      : `(${share(executionPercentage)})`;

  // Derived from the served percentage so it inherits the server's rounding. The parenthesis
  // qualifies the share by the word before it (61.3% over or 38.7% left). Same shape as SummaryDetailBox.
  const remainingShare = unbudgeted
    ? null
    : executionPercentage === null
      ? MISSING
      : `(${share(100 - executionPercentage)})`;

  const remainWord = budgetRemainWord(
    budgetAmount,
    actualSpent,
    remainingBudget,
  );

  const remainingAmount =
    remainingBudget === null ? MISSING : amount(Math.abs(remainingBudget));

  // The server withheld every total and said why; the sentence replaces the figures. Guarded on the
  // sentence, not the withheld figures, so unexplained withholding still shows dashes.
  if (notice) {
    return (
      <div className='total__container flex-col-sb'>
        <p className='displayScreen__notice'>{notice}</p>
      </div>
    );
  }

  return (
    <div className='total__container flex-col-sb'>
      <div className='total__amount'>{amount(budgetAmount)}</div>

      {/* One strip, not two: the pair are the halves of a single budget, and the
          saved strip is height the list gets back. */}
      <div className='displayScreen__rows'>
        <div className={`displayScreen budgetHero__figures ${'light'}`}>
          <div className='budgetHero__figure'>
            <div className={`displayScreen--concept ${'dark'}`}>Spent</div>

            <div className={`displayScreen--result ${'dark'}`}>
              {amount(actualSpent)}
              {spentShare && (
                <span className='displayScreen__percentage'>{spentShare}</span>
              )}
            </div>
          </div>

          <div className='budgetHero__figure'>
            <div className={`displayScreen--concept ${'dark'}`}>
              Remaining
              {/* Nothing budgeted is no budget, not a healthy one: isOverBudget arrives false
                  there (0 > 0), so the square would claim a reading nobody measured. */}
              {!unbudgeted && isOverBudget !== null && (
                <StatusSquare
                  alert={budgetSquareState(executionPercentage, isOverBudget)}
                />
              )}
            </div>

            <div className={`displayScreen--result ${'dark'}`}>
              {remainingAmount}
              {remainWord && (
                <span className='budgetHero__remainWord'>&nbsp;{remainWord}</span>
              )}
              {remainingShare && (
                <span className='displayScreen__percentage'>
                  {remainingShare}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BudgetBigBoxResult;

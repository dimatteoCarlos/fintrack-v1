// Level-1 cards: a headline plus one reading each. Income, Expense and PnL are FLOWS over the month;
// Debt, Pocket and Investment are POSITIONS at its close, all read from the shared /overview payload.
// Order: Income, Expense, Debt, Investment, PnL (the result over them), Pocket last (already set aside).

import { Link, useLocation } from 'react-router-dom';

import { currencyFormat } from '../../../helpers/functions';
import CollapsibleBlock from './CollapsibleBlock';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents';
import {
 budgetRemainWord,
 budgetSquareState,
 budgetStatusLevel,
 BudgetStatusLevel,
} from '../../../helpers/budgetStatus';
import { ProgressTone } from '../../../general_components/progressBar/ProgressBar';
import { CardMetricBlock, CardMetricRow } from './CardMetricBlock';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import {
 OverviewDomain,
 OverviewDomainCardBase,
 OverviewExpenseCard,
 OverviewPnlCard,
 OverviewPocketCard,
} from '../../../types/overviewTypes';

// The locale is the reader's, never the amount's: taken from the amount's own
// currency, Intl leaves currencies unmarked and narrows the dollar, Colombian peso
// and Mexican peso all to '$'.
const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// A whole absent clause says why instead of printing a dash: a dash at the head of
// a sentence reads as a stray character and has no neighbours to be read against.
// It means only "no prior month"; an incomplete prior month gets the caveat below.
const NO_PRIOR_MONTH = 'no prior month to compare';

// Qualifies a delta measured against a partial prior month. A span of its own so it wraps intact inside
// the flex row .domainCard__sub; the title carries the server's full explanation.
const PARTIAL_PRIOR_MONTH_TITLE =
 'The oldest account was opened during the prior month, so the change is measured against a partial month.';

const partialCaveat = (
 <span className='domainCard__caveat' title={PARTIAL_PRIOR_MONTH_TITLE}>
  (partial)
 </span>
);

// The four fields any change line reads; a Pick so the two functions below cannot
// reach for a field that only some domains have.
type DeltaFields = Pick<
 OverviewDomainCardBase,
 'delta' | 'priorTotalAmount' | 'priorPeriodCoverage' | 'currency'
>;

const money = (currency: string, value: number) =>
 currencyFormat(currency, value, formatNumberCountry);

// Past this many percent the share is dropped and the amount stands alone: a baseline of $13.05
// yielding "766533.1%" is true arithmetic but tells the reader nothing the amount does not.
const SHARE_CEILING = 1000;

// Change as a share of the prior month. The denominator is absolute because pnl and debt are signed:
// -100 to -50 divided by -100 would read -50%, a fall beside an up arrow. null when the prior month
// was 0 or no baseline was published ('Infinity%' and '100%' would be inventions).
const deltaShare = (delta: number, priorTotalAmount: number | null) => {
 if (priorTotalAmount === null || priorTotalAmount === 0) return null;

 const share = (delta / Math.abs(priorTotalAmount)) * 100;

 return Math.abs(share) >= SHARE_CEILING ? null : share;
};

// Share first (the reading), amount in parentheses (the evidence); one function so
// the plain and coloured lines below cannot format a comparison two ways.
const deltaFigures = (delta: number, priorTotalAmount: number | null, currency: string) => {
 const share = deltaShare(delta, priorTotalAmount);
 const amount = money(currency, Math.abs(delta));

 if (share === null) return amount;

 return `${Math.abs(share).toFixed(SHARE_DECIMALS)}% (${amount})`;
};

// The arrow carries the direction so the sign need not be read off the digits.
const deltaLine = ({ delta, priorTotalAmount, priorPeriodCoverage, currency }: DeltaFields) => {
 if (delta === null) return NO_PRIOR_MONTH;

 const caveat = priorPeriodCoverage === 'partial' ? <>{' '}{partialCaveat}</> : null;

 if (delta === 0) return <>no change vs prior month{caveat}</>;

 return (
  <>
   {delta > 0 ? '▲' : '▼'} {deltaFigures(delta, priorTotalAmount, currency)} vs prior month
   {caveat}
  </>
 );
};

// The pocket card's month, in the board hero's words (PocketBigBoxResult.tsx:363):
// its delta is the net committed inside the month, a movement, so it is stated
// as one and not compared with the prior month. Null only on an empty board.
const pocketMovementLine = ({ delta, currency }: DeltaFields) => {
 if (delta === null) return null;
 if (delta === 0) return 'No net movement';

 return delta > 0
  ? `${money(currency, delta)} net committed`
  : `${money(currency, Math.abs(delta))} net released`;
};

// The same clause with the arrow painted, for cards with no status square and one meaning of "up".
// Income, Debt (signed net) and Investment qualify; Expense, Pocket and PnL carry a square.
// Debt's arrow follows the signed net, not the amount owed, so an "up" arrow there is not bad news.
const coloredDeltaLine = (
 { delta, priorTotalAmount, priorPeriodCoverage, currency }: DeltaFields,
) => {
 if (delta === null) return NO_PRIOR_MONTH;

 const caveat = priorPeriodCoverage === 'partial' ? <>{' '}{partialCaveat}</> : null;

 if (delta === 0) return <>no change vs prior month{caveat}</>;

 const direction = delta > 0 ? 'up' : 'down';

 return (
  <>
   <span className={`domainCard__delta--${direction}`}>
    {delta > 0 ? '▲' : '▼'} {deltaFigures(delta, priorTotalAmount, currency)}
   </span>{' '}
   vs prior month
   {caveat}
  </>
 );
};

// Class the shared StatusSquare appends, in the vocabulary of helpers/pocketStatus.ts. '' is the bare
// square (nothing asked of the owner); 'unknown' is the addition: a card can lack the figure it reads.
// Income, Debt and Investment carry no square: none publishes a health statement; one would invent a rule.
type SquareClass = '' | 'neutral' | 'info' | 'warning' | 'alert' | 'unknown';

// Percent of the budget spent, the rate budgetStatus.ts reads its threshold against. Derived here because
// the card serves no share. null when no budget is in force (also a mixed-currency set) or it is zero.
const executionPercentage = (card: OverviewExpenseCard): number | null => {
 if (!card.budgetAmount) return null;

 // totalAmount, not categorizedExpense: the same universe budgetVariance is
 // measured over, so share and remainder cannot print "$5 left (140% spent)".
 return (card.totalAmount / card.budgetAmount) * 100;
};

// One decimal, the budget module's own precision for a share; the change against
// the prior month prints at the same precision so the two percentages on an
// Expense card are read on one scale.
const SHARE_DECIMALS = 1;

// The bar's tone from the same budgetStatusLevel call as the square and the
// percentage; ok/near/over is renamed into the bar's status vocabulary, never
// decided a second time.
const BAR_TONE: Record<BudgetStatusLevel, ProgressTone> = {
 ok: 'ok',
 near: 'warning',
 over: 'alert',
};

// The month's budget as a three-row block (amount, bar, remainder and share) so "$500 left" has a reference.
// The square sits on the remainder line it grades. The block is absent when no budget is in force or the
// category accounts span currencies (V1 does not add across them).
const BudgetBlock = ({ card }: { card: OverviewExpenseCard }) => {
 // budgetRemainWord is shared with budget screens and carries the sign, hence the absolute amount below.
 // It reads budgetAmount with totalAmount to tell an unbudgeted card from one at zero.
 const word = budgetRemainWord(
  card.budgetAmount,
  card.totalAmount,
  card.budgetVariance,
 );

 if (card.budgetAmount === null || !word) return null;

 const execution = executionPercentage(card);
 // budgetVariance is the budget minus the month's whole spending: negative means
 // exceeded, null means no budget in force (an absent decision, not a breach).
 const isOver = card.budgetVariance !== null && card.budgetVariance < 0;
 const level = budgetStatusLevel(execution, isOver);

 return (
  <CardMetricBlock
   label='Budget'
   amount={money(card.currency, card.budgetAmount)}
   progress={execution}
   progressLabel='Share of this budget spent this month'
   tone={BAR_TONE[level]}
   square={budgetSquareState(execution, isOver)}
   remainder={`${money(
    card.currency,
    Math.abs(card.budgetVariance ?? 0),
   )} ${word}`}
   // The share says "spent": beside the remainder a bare percentage reads as the
   // share left, the opposite figure. Empty when there is no share.
   share={execution === null ? '' : `${execution.toFixed(SHARE_DECIMALS)}% spent`}
   shareLevel={level}
  />
 );
};

// Spending in no live category, a plain datum with no verdict: expense alerts come only from the budget.
// The server publishes a flag, not the amount; the flag gates the clause because the subtraction alone
// can leave a float-error fraction of a cent and print a clause for spending that does not exist.
const uncategorizedClause = (card: OverviewExpenseCard) => {
 if (!card.hasUncategorizedExpense) return null;

 return `${money(
  card.currency,
  card.totalAmount - card.categorizedExpense,
 )} outside a category`;
};

// One leg of the month's realised result, named by where it landed. A row, not a block: the legs need not
// sum to the headline, so a bar would imply a whole. The sign is printed because a leg can be a loss.
const RealizedRow = ({
 currency,
 amount,
 where,
}: {
 currency: string;
 amount: number;
 where: string;
}) => (
 <CardMetricRow
  subject={<span className='domainCard__aside'>Realised on {where}</span>}
  figure={
   <span className='domainCard__aside'>
    {amount > 0 ? '+' : ''}
    {money(currency, amount)}
   </span>
  }
 />
);

// A losing month is the one health statement this card can make out of what it
// publishes, and it is the only card where the sign of the figure and the
// reading are the same thing.
const pnlSquare = (card: OverviewPnlCard): SquareClass =>
 card.totalAmount < 0 ? 'alert' : '';

// Pocket reading against target, on the helpers/pocketStatus.ts scale (inverted from the budget's: nearing
// target is the point). An aggregate has no pace, so ahead, onTrack and behind collapse to 'neutral'; at or
// past target is 'info'. progress is a percent, not a 0-1 ratio.
const POCKET_TARGET_REACHED = 100;

const pocketSquare = (card: OverviewPocketCard): SquareClass => {
 // A deadline that passed outranks every other reading, exactly as it does on
 // the pocket board.
 if (card.overdueCount > 0) return 'alert';
 if (!card.target) return 'unknown';
 if (card.progress >= POCKET_TARGET_REACHED) return 'info';

 // Uncovered is not a level: the board keeps coverage apart, and this card shows it in its counts line.
 return 'neutral';
};

// The bar takes the square's reading except 'neutral', which uses the warning
// colour so the everyday on-track state is not mistaken for an unmeasured one;
// alert and info still match the square.
const pocketBarTone = (square: SquareClass): ProgressTone =>
 square === 'unknown' || square === '' || square === 'neutral' ? 'warning' : square;

// Pocket goals shaped like BudgetBlock. No over-target branch: the server clamps remaining per pocket and
// progress is coverage capped at 100, so the aggregate cannot exceed its target. Absent when no pocket
// carries a target: with no whole there is no bar or square, and the card falls back to a sentence.
const PocketBlock = ({ card }: { card: OverviewPocketCard }) => {
 if (!card.target) return null;

 const square = pocketSquare(card);

 return (
  <CardMetricBlock
   // 'Total' because the card sits under a month heading, yet target_amount has no time bound
   // and the figures measured against it are cumulative to the close of the reference month.
   label='Total target, all pockets'
   amount={money(card.currency, card.target)}
   progress={card.progress}
   progressLabel='Share of the pocket targets allocated'
   tone={pocketBarTone(square)}
   square={square}
   remainder={`${money(card.currency, card.remaining)} still to allocate`}
   // 'overall progress', not 'allocated': progress is coverage, SUM(MIN(allocated, target)) / SUM(target),
   // which differs from the headline's allocated share, and one word must not name two figures.
   share={`${card.progress.toFixed(SHARE_DECIMALS)}% overall progress`}
   shareLevel={square === '' ? 'ok' : square}
  />
 );
};

// The board's two bands, then the two readings that ask for action, each only
// above zero and in the board's overcommitted flag (PocketFundingAccounts.tsx:240).
// Under the target block because the bands split its overall progress by pocket.
const PocketCounts = ({ card }: { card: OverviewPocketCard }) => (
 <div className='domainCard__counts'>
  <span className='domainCard__count'>
   Target reached <b className='domainCard__countNumber'>{card.targetReachedCount}</b>
  </span>
  <span className='domainCard__count'>
   In progress <b className='domainCard__countNumber'>{card.inProgressCount}</b>
  </span>
  {card.uncoveredCount > 0 && (
   <span className='domainCard__count domainCard__count--alert'>
    {card.uncoveredCount} uncovered
   </span>
  )}
  {card.overAllocatedAccountCount > 0 && (
   <span className='domainCard__count domainCard__count--alert'>
    {card.overAllocatedAccountCount} overcommitted account
    {card.overAllocatedAccountCount === 1 ? '' : 's'}
   </span>
  )}
 </div>
);

// "(2 lenders)" beside the leg; the wording follows the sign (below zero is owed, so lenders). Only above zero.
// Number.isFinite, not `count <= 0`: `undefined <= 0` is false, so an absent field printed "undefined".
// The field is absent when the backend predates the counts, which the parsed response type cannot catch.
const counterparties = (
 count: number | undefined,
 singular: string,
 plural: string,
) => {
 if (!Number.isFinite(count) || (count as number) <= 0) return null;

 return ` (${count} ${count === 1 ? singular : plural})`;
};

type CardProps = {
 label: string;
 // 'flow' is measured across the month, 'position' read at its close; shown as a
 // word because neither nature has a colour token.
 nature: 'flow' | 'position';
 // The wire name the level-2 route takes; the label cannot stand in for it
 // ('Pocket · committed' is words for a reader) and a reverse map would be a
 // second place to keep in step.
 domain: OverviewDomain;
 // Absent on the three cards that publish no health statement, and absent is
 // not 'unknown': one says the domain has no such reading, the other says this
 // month's could not be taken.
 square?: SquareClass;
 children: React.ReactNode;
 sub: React.ReactNode;
};

// The month is stated once above the grid, so the card shows only its nature. Folding lives in this shell
// so a new card folds without wiring. The level-2 link is in the body: inside the summary head one click
// would both follow it and toggle the fold. It forwards the search string verbatim; the month lives there.
const DomainCard = ({
 label,
 nature,
 domain,
 square,
 children,
 sub,
}: CardProps) => {
 const { search } = useLocation();

 return (
  <CollapsibleBlock
   variant='card'
   className='domainCard'
   head={
    <div className='domainCard__head'>
     <span className='domainCard__label'>{label}</span>
     <span className='domainCard__scope'>{nature}</span>
    </div>
   }
  >
   <div className='domainCard__figures'>{children}</div>

   {/* The square qualifies a reading, so it sits on the subordinate line; beside
       the name it would look like part of the title. */}
   <div className='domainCard__sub'>
    {square !== undefined && <StatusSquare alert={square} />}
    <span>{sub}</span>
   </div>

   {/* Named for what is on the other side rather than "see more", with the
       domain in it: six links all called "View movements" cannot be told apart
       in a screen reader's link list. */}
   <Link
    className='domainCard__drill'
    to={{ pathname: `/fintrack/overview/${domain}`, search }}
    viewTransition
   >
    View {label.toLowerCase()} movements
    <span className='domainCard__drillArrow' aria-hidden='true'>
     →
    </span>
   </Link>
  </CollapsibleBlock>
 );
};

function DomainCards() {
 const domainCards = useOverviewStore((state) => state.domainCards);

 // Nothing has arrived yet: the layout above owns the skeleton and the error with
 // its retry, so there is no second spinner here.
 if (!domainCards) return null;

 const { income, expense, pnl, debt, pocket, investment } = domainCards;

 const uncategorized = uncategorizedClause(expense);

 return (
  <>
   {/* The month heading lives in Overview.tsx, above this grid and the
       consolidated card, so it heads everything cut against that month. */}
   <section className='domainCards'>
   <DomainCard
    label='Income'
    domain='income'
    nature='flow'
    sub={coloredDeltaLine(income)}
   >
    <div className='domainCard__figure'>
     {money(income.currency, income.totalAmount)}
    </div>
   </DomainCard>

   {/* No square prop: the card's one mark belongs to the budget reading and sits
       inside BudgetBlock, on the line it grades. */}
   <DomainCard
    label='Expense'
    domain='expense'
    nature='flow'
    sub={
     /* Rows, not one wrapping sentence: the change, then the budget, then what is
        left of it. Expense is the only card with several clauses, so the column
        lives here and .domainCard__sub stays the row that holds the square. */
     <div className='domainCard__lines'>
      {/* Closest to the figure above it, because it is a reading OF that
          figure rather than of the budget. */}
      <span>{deltaLine(expense)}</span>

      <BudgetBlock card={expense} />

      {/* Last, quietest, and unqualified. It is spending the budget reading
          above does not account for - worth knowing, and not a verdict. */}
      {uncategorized && (
       <span className='domainCard__aside'>{uncategorized}</span>
      )}
     </div>
    }
   >
    <div className='domainCard__figure'>
     {money(expense.currency, expense.totalAmount)}
    </div>
   </DomainCard>

   <DomainCard
    label='Debt'
    domain='debt'
    nature='position'
    sub={coloredDeltaLine(debt)}
   >
    {/* Net across every counterparty: keeps its sign and takes no colour, as on the debts board hero (a
        position, not a direction). The two legs below stay because -$550 alone hides the split. */}
    <div className='domainCard__figure'>
     {money(debt.currency, debt.totalAmount)}
    </div>

    {/* Each leg's magnitude and counterparty count. Amounts print unsigned (the wording carries direction)
        in the debts module's two direction colours as a second carrier, so rows read in monochrome.
        Counts take no colour: they are not amounts. */}
    <div className='domainCard__figure domainCard__figure--split'>
     <span className='domainCard__leg'>
      You owe{counterparties(debt.payableCount, 'lender', 'lenders')}
     </span>
     <b className='domainCard__amount--owing'>
      {money(debt.currency, debt.payable)}
     </b>
    </div>
    <div className='domainCard__figure domainCard__figure--split'>
     <span className='domainCard__leg'>
      You&rsquo;re owed
      {counterparties(debt.receivableCount, 'debtor', 'debtors')}
     </span>
     <b className='domainCard__amount--owed'>
      {money(debt.currency, debt.receivable)}
     </b>
    </div>
   </DomainCard>

   <DomainCard
    label='Investment'
    domain='investment'
    nature='position'
    sub={
     /* Change over the account count, as PnL does. Investment has no delta field: the ledger-balance
        comparison the server publishes is mapped onto the shape deltaLine reads, so the sentence matches
        the other five cards. */
     <div className='domainCard__lines'>
      <span>
       {coloredDeltaLine({
        delta: investment.ledgerBalanceDelta,
        priorTotalAmount: investment.priorLedgerBalance,
        priorPeriodCoverage: investment.priorPeriodCoverage,
        currency: investment.currency,
       })}
      </span>

      <span className='domainCard__aside'>
       {investment.accountCount === 1
        ? '1 account — the count is as of today'
        : `${investment.accountCount} accounts — the count is as of today`}
      </span>
     </div>
    }
   >
    <div className='domainCard__figure'>
     {money(investment.currency, investment.ledgerBalance)}
    </div>
   </DomainCard>

   <DomainCard
    label='PnL'
    domain='pnl'
    nature='flow'
    square={pnlSquare(pnl)}
    sub={
     /* Where the result landed, as two rows under the change. Cut by movement type, so a result can land on
        any account except the system counterparty. Both legs are measured, not a remainder (which would
        include debtor and pocket accounts), and need not sum to the headline. */
     <div className='domainCard__lines'>
      <span>{deltaLine(pnl)}</span>

      {/* No result says so, since $0.00 over two absent legs looks broken. transactionCount, not the total:
          a month can net to zero over real rows. It excludes the type 9 account-deletion movements. */}
      {pnl.transactionCount === 0 && (
       <span className='domainCard__aside'>
        no realised result was recorded this month
       </span>
      )}

      {/* A zero leg is omitted: a row of zeroes under a headline reads as a
          breakdown that failed rather than as an empty leg. */}
      {pnl.realizedFromInvestment !== 0 && (
       <RealizedRow
        currency={pnl.currency}
        amount={pnl.realizedFromInvestment}
        where='investment accounts'
       />
      )}

      {pnl.realizedFromBank !== 0 && (
       <RealizedRow
        currency={pnl.currency}
        amount={pnl.realizedFromBank}
        where='bank accounts'
       />
      )}
     </div>
    }
   >
    {/* Signed, and a negative is a real answer here in a way it is not on an
        expense card: a losing month is a loss, not an absent figure. */}
    <div className='domainCard__figure'>
     {pnl.totalAmount > 0 ? '+' : ''}
     {money(pnl.currency, pnl.totalAmount)}
    </div>
   </DomainCard>

   {/* No square prop when the block draws one: the mark grades the reading against
       the target, so it sits on that line. With no target there is no reading and
       the square returns to the subtitle as 'unknown', said once. */}
   <DomainCard
    label='Pocket · allocated'
    domain='pocket'
    nature='position'
    square={pocket.target ? undefined : pocketSquare(pocket)}
    sub={
     pocket.target ? (
      /* The month first, the position under it: every figure in the block is
         cumulative, so the change line (summary.totalMovedInMonth, net committed
         inside the reference month) is the only figure of the month itself. */
      <div className='domainCard__lines'>
       <span>{pocketMovementLine(pocket)}</span>

       <PocketBlock card={pocket} />

       <PocketCounts card={pocket} />
      </div>
     ) : (
      'no target set on any pocket'
     )
    }
   >
    <div className='domainCard__figure'>
     {money(pocket.currency, pocket.totalAmount)}
    </div>

    {/* Makes the card add up: remaining is clamped per pocket, so allocated - excess + remaining = target.
        Hangs off the headline, as on the board, since it is part of that figure. Drawn only when above zero. */}
    {pocket.excess !== null && pocket.excess > 0 && (
     <span className='domainCard__aside'>
      {money(pocket.currency, pocket.excess)} over target
     </span>
    )}
   </DomainCard>

   </section>
  </>
 );
}

export default DomainCards;

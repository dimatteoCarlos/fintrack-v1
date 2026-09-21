import type { PocketStatus } from './pocketTypes';

// Shapes of GET /api/fintrack/overview, typed against the response contract and
// not against what components read: a figure the contract says is never null is
// `number`, so consumers do not branch on a case the server does not produce.

// The period the server resolved, echoed back so the client never computes a
// month from the browser clock.
export type ServedWindow = {
 // 'YYYY-MM-01'. The requested month, or the owner's current month when none was
 // requested.
 referenceMonth: string;
 // 'YYYY-MM-01'. The latest month that may be requested. Separate from
 // isCurrentMonth, which says whether the served month is the ceiling but not
 // which month that is, so a client on an earlier month has no bound to step to.
 currentMonth: string;
 // 'YYYY-MM-01', the first day of the served month.
 periodStart: string;
 // 'YYYY-MM-DD', the month's last day, or today for the month in course, so a
 // running month does not claim days that have not happened.
 periodEnd: string;
 isCurrentMonth: boolean;
};

// Attached to every card and to the page. notices is always an array, so a
// consumer that iterates needs no null check.
export type OverviewMeta = {
 notices: string[];
 // Reserved for the day the accounting and display currencies can diverge; null
 // until then.
 provenance: null;
};

export type OverviewDomain =
 | 'income'
 | 'expense'
 | 'investment'
 | 'debt'
 | 'pocket'
 | 'pnl';

// The period one card was measured over. Which month is on screen and which is the
// ceiling are page facts, published once in ServedWindow rather than per card.
export type OverviewCardWindow = {
 // 'YYYY-MM-01'.
 periodStart: string;
 // 'YYYY-MM-DD', the month's last day, or today for the month in course.
 periodEnd: string;
};

// The shape five of the six cards share. Investment reports a position rather
// than a total, a count and a delta, so it has a type of its own below.
export type OverviewDomainCardBase = {
 domain: OverviewDomain;
 // Never null: 0 is real activity at zero, and null would say the figure did not
 // arrive.
 totalAmount: number;
 transactionCount: number;
 // The prior month's own figure, the denominator for a percentage change; whether
 // a 0 renders as a percentage is a presentation decision. null exactly when
 // delta is.
 priorTotalAmount: number | null;
 // An amount, not a rate. null only when the owner has no prior month at all (the
 // oldest account was opened in or after the reference month); a prior month held
 // only in part still yields a figure, flagged by priorPeriodCoverage.
 delta: number | null;
 // How much of the prior month the owner held an account for. Read this rather
 // than meta.notices to tell a partial comparison from a full one; with 'partial'
 // the delta is still a real number.
 priorPeriodCoverage: 'complete' | 'partial' | 'none';
 currency: string;
 window: OverviewCardWindow;
 meta: OverviewMeta;
};

export type OverviewIncomeCard = OverviewDomainCardBase & { domain: 'income' };

export type OverviewExpenseCard = OverviewDomainCardBase & {
 domain: 'expense';
 // null when no budget is in force for the month, or when the category accounts
 // span currencies; the card's notices tell the two apart.
 budgetAmount: number | null;
 // Reported whether or not a budget exists, so a missing budget does not hide
 // real spending.
 categorizedExpense: number;
 budgetVariance: number | null;
 // A flag, never a monetary figure: the amount is totalAmount minus
 // categorizedExpense.
 hasUncategorizedExpense: boolean;
};

export type OverviewPnlCard = OverviewDomainCardBase & {
 domain: 'pnl';
 // Share of the month's realised result on investment accounts; a subordinate line under the total.
 realizedFromInvestment: number;
 // Share on spendable accounts, filtered on its own: totalAmount minus the line above would include
 // debtor and pocket accounts. The two need not sum to totalAmount.
 realizedFromBank: number;
};

export type OverviewDebtCard = OverviewDomainCardBase & {
 domain: 'debt';
 // Both legs are positive magnitudes (the name carries the direction); totalAmount is the net,
 // so receivable - payable reproduces it.
 payable: number;
 receivable: number;
 // Counterparties per leg, on the sums' sign boundary: below zero is a lender (payableCount), above
 // a debtor; an account at exactly zero is in neither count, as in neither leg.
 payableCount: number;
 receivableCount: number;
 // Debtors who reached zero at the month's close, counting only those with a
 // movement of their own; the row that opens the account does not count.
 // Published but not drawn on the level-1 card.
 settledCount: number;
};

export type OverviewPocketCard = OverviewDomainCardBase & {
 domain: 'pocket';
 // What is committed, not a balance the pocket holds: allocations move no money,
 // so the hero neither adds it to net worth nor takes it out of cash.
 target: number;
 remaining: number;
 // A rate over 100, not a 0-1 ratio: coverage, SUM(MIN(allocated, target)) / SUM(target),
 // not totalAmount divided by target.
 progress: number;
 // Money committed past the goal: the fourth term of allocated - excess + remaining = target, needed
 // because remaining is clamped per pocket. null on a board with no pockets (a sum over nothing is not 0).
 excess: number | null;
 fundedCount: number;
 overdueCount: number;
 uncoveredCount: number;
};

// Shares none of the base: a position, not a flow, so no totalAmount and no window. Its comparison
// is named for the figure it leads with (`ledgerBalance`), not `delta` and `priorTotalAmount`.
export type OverviewInvestmentCard = {
 domain: 'investment';
 accountCount: number;
 transactionCount: number;
 capitalContributed: number;
 ledgerBalance: number;
 realizedPnl: number;
 closureAdjustment: number;
 // The same ledger balance at the close of the prior month, and the change
 // between the two. Both null together, and only when the owner held no account
 // through any part of that month; a young baseline still compares.
 priorLedgerBalance: number | null;
 ledgerBalanceDelta: number | null;
 // How much of the prior month the owner existed for. 'partial' is a real
 // comparison with a caveat: the card renders the change and says the baseline is
 // short.
 priorPeriodCoverage: 'complete' | 'partial' | 'none';
 // The largest account's share of the whole, as a ratio in 0-1: the opposite
 // scale to pocket's progress, which is why neither is named 'percentage'.
 concentration: number;
 // null when no contribution was ever recorded, which is not a gap of zero days.
 daysSinceLastContribution: number | null;
 currency: string;
 meta: OverviewMeta;
};

// The six cards, each under its own key. Not a Record over OverviewDomain:
// investment does not share the base shape, and a Record would widen to the base
// with every specific field lost.
export type OverviewDomainCards = {
 income: OverviewIncomeCard;
 expense: OverviewExpenseCard;
 investment: OverviewInvestmentCard;
 debt: OverviewDebtCard;
 pocket: OverviewPocketCard;
 pnl: OverviewPnlCard;
};

// The same six as a union discriminated on `domain`, for the level-2 screen, which
// is handed one card and narrows on that field. The page holds all six at once
// and uses OverviewDomainCards instead.
export type OverviewDomainCard =
 | OverviewIncomeCard
 | OverviewExpenseCard
 | OverviewInvestmentCard
 | OverviewDebtCard
 | OverviewPocketCard
 | OverviewPnlCard;

// The stocks at the top of the page. Every one is a position, so none is bounded
// by the month the flows are bounded by.
export type OverviewHero = {
 // Bank, investment and debt. Never null: 0 is a real net worth.
 netWorth: number;
 // The same holdings with the payable leg taken out. null only when that leg did
 // not arrive, which is why it is the one nullable stock.
 liquidNetWorth: number | null;
 // What is spendable without selling a position or collecting a debt.
 cashPosition: number;
 // How much of cashPosition nothing has been promised against. Can exceed
 // cashPosition when an account is overdrawn; the contract states this rather than
 // clamping it.
 freeCash: number;
 // The month's net flow. Negative is a valid value: the month lost money.
 netMonthlyFlow: number;
 // The same movement as a share of what came in, on a 0-1 scale. null when income
 // cannot be a denominator, and never 0: a month with no income has no rate at
 // all rather than a rate of zero.
 savingsRate: number | null;
 // The accounting currency of the four stocks and the flow. Read it from here,
 // never from a constant, so a figure cannot be labelled with another currency.
 currency: string;
};

// The three domains the monthly widget covers; debt, investment and pnl have no
// snapshot, so a Record over the six would force branches on entries never sent.
export type MonthlySnapshotDomain = 'income' | 'expense' | 'pocket';

// One movement measured against its own history.
export type MonthlySnapshot = {
 domain: MonthlySnapshotDomain;
 // The reference month's own figure, computed like the domain card's so the two
 // cannot disagree.
 domainMonthlyActual: number;
 // The mean of the months that had activity in each window, excluding the
 // reference month. null and not 0 when no month in the window had any: a 0 would
 // state the owner typically moves nothing.
 activeMonthAverage3m: number | null;
 activeMonthAverage12m: number | null;
 // How many months each mean was divided by. Never null: zero active months is an
 // answer. The card needs it to say how much weight each mean carries.
 activeMonths3m: number;
 activeMonths12m: number;
 // domainMonthlyActual minus activeMonthAverage12m, against the twelve and not the
 // three: a month measured against a mean that already moves fast cannot say
 // whether it is unusual. null when that mean is null.
 varianceVsAverage: number | null;
 // The reference month's calendar year, every month counted whether or not it had
 // activity (a total has no denominator to protect, unlike the averages). Never
 // null.
 yearToDate: number;
 currency: string;
 meta: OverviewMeta;
};

// The three goal figures, and no fourth. No percentage is published: dividing in
// the browser would make it decide what a null or zero target means, and the
// server answers that by withholding the target.
export type OverviewFinancialGoals = {
 // Always a number. Counts every pocket, including those with no target: money
 // set aside is set aside whether or not it was promised to a goal.
 goalsTotalBalance: number;
 // null and never 0 when no pocket carries a target: an absent target is not a
 // target of zero, which would state that a goal was set and reached.
 goalsTotalTarget: number | null;
 // The plain subtraction, not floored: saving past the goal reads as a negative
 // remainder, and clamping would report the goal as exactly met. null whenever the
 // target is.
 goalsTotalRemaining: number | null;
 currency: string;
 meta: OverviewMeta;
};

// One month of a series. Month precision, unlike a card's window, because a trend
// point is a month and not a period with two ends.
export type OverviewTrendPoint = {
 // 'YYYY-MM'.
 month: string;
 value: number;
};

// The six-month series, only for the three domains that have one. A key's absence
// means the domain has no series; an empty array would mean the months came back
// blank, which the server never says.
export type OverviewTrend = {
 income?: OverviewTrendPoint[];
 expense?: OverviewTrendPoint[];
 pocket?: OverviewTrendPoint[];
};

// One category's share of the month's spending, ranked. cumulative* are the
// running totals the Pareto reading needs, computed by the server so the chart
// and any figure beside it cannot disagree.
export type OverviewExpenseCategory = {
 categoryName: string;
 currency: string;
 accountCount: number;
 budgetAmount: number;
 actualSpent: number;
 remainingBudget: number;
 // A rate over 100, the same scale as pocket's progress and the opposite of
 // investment's concentration.
 executionPercentage: number;
 isOverBudget: boolean;
 // 1-based, assigned by the server. The order is the server's ranking, never
 // recomputed here.
 rank: number;
 cumulativeActual: number;
 cumulativePercentage: number;
 // The plan's curve over the same ranking, not ranked by plan: two curves ranked
 // separately would put two different categories above one x position.
 cumulativeBudget: number;
 // cumulativeBudget over the plan of the rows that have one, 0-1. Not over the
 // budget the expense card publishes, which is why it always reaches 1.
 cumulativeBudgetPercentage: number;
 // Whether the running plan omits a row. True from the first category whose
 // currency is mixed onwards; the block writes the caveat only when it is true.
 hasSkippedBudget: boolean;
};

// One budget account of the month, ranked like the categories above; nothing is summed, so two
// accounts sharing a subcategory keep their rows. Scope: the named category, else every expense account.
export type OverviewExpenseSubcategory = {
 accountId: number;
 // Resolved by the server, never the raw column: 'unknown' when the account has
 // no subcategory. It still holds budget and spending, so dropping it would take
 // real money out of the ranking.
 subcategoryName: string;
 // null when the account carries no tag. Not defaulted to 'other', which is a
 // value somebody chose; an absent tag is a gap.
 nature: string | null;
 // Repeated on every row so a row of the flat ranking reads on its own.
 categoryName: string | null;
 currency: string;
 budgetAmount: number;
 actualSpent: number;
 remainingBudget: number;
 executionPercentage: number | null;
 isOverBudget: boolean;
 rank: number;
 cumulativeActual: number;
 cumulativePercentage: number;
 cumulativeBudget: number;
 cumulativeBudgetPercentage: number;
 hasSkippedBudget: boolean;
};

// One of the four nature tags, in the catalog's own order. Published even when
// nobody used it, so the block keeps one shape across months.
export type OverviewNatureRow = {
 nature: string;
 accountCount: number;
 spent: number;
 budget: number;
 // Of the spending in scope, 0-1. Never of the month when a category is open.
 share: number;
};

// How the month's spending splits across the four natures: a composition, not a
// ranking, since four fixed values ordered by size discover nothing and are read
// against the same four of last month.
export type OverviewNatureSplit = {
 // null for the whole domain. Read from here rather than from the client's own
 // selection, so a stale selection cannot label a figure it did not produce.
 categoryName: string | null;
 spentTotal: number;
 budgetTotal: number;
 rows: OverviewNatureRow[];
 // Accounts carrying no tag, counted outside the four rather than folded into
 // 'other'.
 untaggedCount: number;
 untaggedSpent: number;
 untaggedBudget: number;
};

export type OverviewCharts = {
 trend: OverviewTrend;
 expenseCategories: OverviewExpenseCategory[];
};

// One row of the activity teaser, in the server's own column names. Only the columns the teaser
// draws are declared; the rest would duplicate the shape the level-2 detail also uses.
export type OverviewActivityRow = {
 transaction_id: number;
 // null only for an account erased before account_registry existed.
 account_name: string | null;
 // True once the account's user_accounts row is gone; the list keeps its rows.
 account_is_closed: boolean;
 amount: number;
 description: string;
 // What the owner typed, split out of description by the server. null when the
 // row carries none.
 note: string | null;
 transaction_actual_date: string;
 // A plain string, as elsewhere in this file: narrowing to the forms' union would turn a new code
 // into a compile error instead of a rendered value.
 currency_code: string;
};

// The consolidated card, from makeAllCard.js. Five figures are copies of the hero
// and the domain cards; transactionCountAll is the only one it owns.
export type OverviewAllCard = {
 domain: 'all';
 netWorth: number;
 totalIncomePeriod: number;
 totalExpensePeriod: number;
 // Positive when others owe the user, negative when the user owes.
 netDebtPosition: number;
 totalPocketBalance: number;
 // The sum of the domain counts; transfers are not counted.
 transactionCountAll: number;
 currency: string;
 window: OverviewCardWindow;
 meta: OverviewMeta;
};

// The slice of the payload the frontend reads today; typing another field is
// additive and changes no existing consumer.
export type GetOverviewData = {
 window: ServedWindow;
 hero: OverviewHero;
 all: OverviewAllCard;
 domainCards: OverviewDomainCards;
 financialGoals: OverviewFinancialGoals;
 charts: OverviewCharts;
 // An array, as the server sends it: three entries in the order income, expense, pocket.
 monthlySnapshot: MonthlySnapshot[];
 // The five most recent movements over every domain, not bounded by the reference month, so a
 // quiet month does not show an empty list.
 recentActivity: { transactions: OverviewActivityRow[] };
};

// Level 2 (GET /overview/:domain): analysis fields are optional, not nullable. Builders spread
// sections in conditionally, so a missing key means the statement never ran; null means no answer.

// The two request depths. Omitting the parameter (level-1 response, no analysis) has no member here.
export type OverviewAnalysisLevel = 'derived' | 'full';

// Level-2 series reuse OverviewTrendPoint; only the length differs (thirteen
// months here, six on the card).

// One part of a ranked distribution. share is a 0-1 ratio at four decimals, and
// null when the whole is zero: a share of nothing is not a small share.
export type OverviewDistributionPart = {
 label: string;
 amount: number;
 rank: number;
 share: number | null;
};

// One row of a domain's transaction page, in the server's column names. Account columns are nullable
// (LEFT join on user_accounts): CLOSE deletes that row, so a closed account's movement has every ua.* null.
export type OverviewTransactionRow = {
 transaction_id: number;
 user_id: string;
 description: string;
 amount: number;
 movement_type_id: number;
 transaction_type_id: number;
 currency_id: number;
 account_id: number;
 source_account_id: number | null;
 destination_account_id: number | null;
 status: string;
 transaction_actual_date: string;
 created_at: string;
 updated_at: string;
 movement_type_name: string;
 transaction_type_name: string;
 // LEFT-joined through user_accounts, so null on a closed account's movement.
 account_type_name: string | null;
 currency_code: string;
 // Read from account_registry once the account closes; null only for an account
 // erased before the registry existed.
 account_name: string | null;
 account_type_id: number | null;
 account_starting_amount: number | null;
 account_balance: number | null;
 account_start_date: string | null;
 // The movement's date on the owner's calendar, 'YYYY-MM-DD'. Render this, not
 // transaction_actual_date, which is an instant.
 transaction_local_date: string;
 // True once the account's user_accounts row is gone.
 account_is_closed: boolean;
};

export type OverviewTransactionPage = {
 rows: OverviewTransactionRow[];
 page: number;
 pageSize: number;
 totalRows: number;
};

// One row of the pocket domain's page. A pocket moves no money, so its page is the
// month's allocations, in ALLOCATIONS_PAGE_QUERY's names, and not transactions.
export type OverviewAllocationRow = {
 allocationId: string;
 pocketId: number;
 pocketName: string;
 // Numeric text: the column is serialised as ::text.
 amount: string;
 // 'YYYY-MM-DD' on the owner's calendar.
 allocationDate: string;
 sourceAccountId: number;
 // Read from account_registry once the account closes; null only for an account
 // erased before the registry existed.
 sourceAccountName: string | null;
 sourceAccountIsClosed: boolean;
 currency: string;
};

export type OverviewAllocationPage = Omit<OverviewTransactionPage, 'rows'> & {
 rows: OverviewAllocationRow[];
};

export type OverviewAnalysisMeta = {
 notices: string[];
};

// Expense: the series, and the one decomposition level 1 refuses. categorization
// is absent when the server has no categorised figure at all (its notice says so);
// when present its two terms sum to the card's totalAmount by construction.
export type OverviewExpenseAnalysis = {
 domain: 'expense';
 level: OverviewAnalysisLevel;
 series: OverviewTrendPoint[];
 categorization?: {
  categorized: number;
  uncategorized: number;
 };
 meta: OverviewAnalysisMeta;
};

// Income sources. A row with accountId null is real income attributed to no account: it keeps its
// amount and share and is the one row rendered without a link.
export type OverviewIncomeSourcePart = OverviewDistributionPart & {
 accountId: number | null;
 accountName: string | null;
 // The source account was closed: its name comes from account_registry and the
 // row does not link.
 accountIsClosed: boolean;
};

export type OverviewIncomeAnalysis = {
 domain: 'income';
 level: OverviewAnalysisLevel;
 series: OverviewTrendPoint[];
 bySource?: OverviewIncomeSourcePart[];
 // The largest source's share, read off bySource[0] and never recomputed. null
 // exactly when the shares are.
 concentration?: number | null;
 meta: OverviewAnalysisMeta;
};

// Profit and loss: both terms are always present and can be negative. A losing
// month is a loss, not a missing figure.
export type OverviewPnlAnalysis = {
 domain: 'pnl';
 level: OverviewAnalysisLevel;
 series: OverviewTrendPoint[];
 // Three parts summing to the card's totalAmount: investment and bank (bank, cash) are measured,
 // other is the rest (debtor, pocket, any other account).
 byAccountType: {
  investment: number;
  bank: number;
  other: number;
 };
 meta: OverviewAnalysisMeta;
};

// Investment reconciliation. difference and tolerance travel together: the client cannot rebuild the
// server's zero threshold, and floating-point subtraction could report a cent the server did not.
export type OverviewReconciliation = {
 capitalContributed: number;
 realizedPnl: number;
 closureAdjustment: number;
 ledgerBalance: number;
 difference: number;
 tolerance: number;
};

export type OverviewInvestmentBalancePart = OverviewDistributionPart & {
 accountId: number;
 accountName: string;
};

// One funding event. Not a monthly series: the question is when money went in,
// and a month with no contribution is not a point on this line.
export type OverviewContributionEvent = {
 transactionId: number;
 accountId: number;
 // null on a closed account, for the same LEFT join reason the transaction rows
 // carry.
 accountName: string | null;
 amount: number;
 // 'YYYY-MM-DD' on the owner's calendar.
 contributionDate: string;
};

export type OverviewInvestmentAnalysis = {
 domain: 'investment';
 level: OverviewAnalysisLevel;
 reconciliation: OverviewReconciliation;
 balanceByAccount?: OverviewInvestmentBalancePart[];
 // The newest page of an unbounded history; totalRows says how much is not in rows, so a
 // page is never mistaken for the whole.
 contributionHistory?: {
  rows: OverviewContributionEvent[];
  totalRows: number;
 };
 meta: OverviewAnalysisMeta;
};

// direction is served, not derived: above zero the counterparty owes the owner, below zero the
// owner owes them; exactly zero is a settled counterparty, which stays in the list.
export type OverviewDebtDirection = 'receivable' | 'payable' | 'settled';

export type OverviewDebtCounterparty = {
 accountId: number;
 accountName: string;
 // Signed. Ranked by magnitude, so the largest debt and the largest credit both
 // sit at the top rather than every debt sinking under every credit.
 balance: number;
 direction: OverviewDebtDirection;
 rank: number;
};

// The two legs at each month close, never netted: a net position that has not
// moved can hide both legs doubling, hence two series and not one.
export type OverviewDebtLegsPoint = {
 month: string;
 receivable: number;
 payable: number;
};

export type OverviewDebtAnalysis = {
 domain: 'debt';
 level: OverviewAnalysisLevel;
 byCounterparty?: OverviewDebtCounterparty[];
 legsOverTime?: OverviewDebtLegsPoint[];
 meta: OverviewAnalysisMeta;
};

// progressByPocket reuses PocketStatus: the rows are the board's, spread through by
// pocketBoardService. pocketId is the level-3 identity, never derived from an account.
export type OverviewPocketAnalysis = {
 domain: 'pocket';
 level: OverviewAnalysisLevel;
 series: OverviewTrendPoint[];
 progressByPocket?: PocketStatus[];
 committedAgainstFree?: {
  bankBalance: number;
  committed: number;
  freeCash: number;
  // What the per-account floor cost. 0 when every account covers its own
  // commitments, and positive by exactly the shortfall the floor absorbed - the
  // one figure that explains why the three terms above do not add up.
  flooredShortfall: number;
 };
 meta: OverviewAnalysisMeta;
};

export type OverviewAnalysis =
 | OverviewExpenseAnalysis
 | OverviewIncomeAnalysis
 | OverviewPnlAnalysis
 | OverviewInvestmentAnalysis
 | OverviewDebtAnalysis
 | OverviewPocketAnalysis;

// GET /overview/:domain data. trend and categories (expense only) are level-1 material always
// served; only the analysis key depends on the request.
export type GetOverviewDomainData = {
 window: ServedWindow;
 card: OverviewDomainCard;
 // Allocations on the pocket domain, transactions on the other five.
 transactions: OverviewTransactionPage | OverviewAllocationPage;
 trend: OverviewTrendPoint[];
 categories?: OverviewExpenseCategory[];
 // Expense only, optional so an older backend reads as absent, not as an empty ranking. Scoped to
 // the named category, else every expense account of the month.
 subcategories?: OverviewExpenseSubcategory[];
 // Expense only, over the same scope as subcategories above.
 natureSplit?: OverviewNatureSplit | null;
 // Expense only. Categorized spending over the same categories' budget; null
 // when the user has no category.
 categoryExecution?: OverviewCategoryBudgetExecution | null;
 analysis?: OverviewAnalysis;
};

export type OverviewCategoryBudgetExecution = {
 spentAmount: number;
 budgetAmount: number;
 // 0-100 and above when overspent; null when no budget is set.
 executionPercentage: number | null;
 // Negative by the overrun when overspent.
 remainingBudget: number;
 isOverBudget: boolean;
};

export type GetOverviewDomainResponse = {
 status: number;
 message: string;
 data: GetOverviewDomainData;
};

// The envelope, unlike /budget, whose controllers serialise their result flat:
// every overview handler wraps it as { status, message, data }. The api module
// unwraps it so no store repeats that knowledge.
export type GetOverviewResponse = {
 status: number;
 message: string;
 data: GetOverviewData;
};

// GET /overview/activity: the one section whose period the reader chooses.
// Everything else on the page is bound to the reference month.

// The movement_types catalog, whole: the frontend's copy of MOVEMENT_TYPE_NAMES.
// The schema enforces it, so a value outside this list answers 400 naming the
// key, and a drift between the two fails loudly rather than returning everything.
export const OVERVIEW_ACTIVITY_MOVEMENT_TYPES = [
 'expense',
 'income',
 'investment',
 'debt',
 'pocket',
 'transfer',
 'receive',
 'account-opening',
 'pnl',
 'account-closure',
 'balance-reversal',
] as const;

export type OverviewActivityMovementType =
 (typeof OVERVIEW_ACTIVITY_MOVEMENT_TYPES)[number];

// What a caller may ask for. Every key is optional, and an omitted one is not the
// same as a null: omitted means "no narrowing", which is the endpoint's default.
export type OverviewActivityQuery = {
 // 'YYYY-MM', both inclusive, and `to` covers the whole month it names.
 from?: string;
 to?: string;
 // 1..80 characters after trimming. '' is not accepted; omit the key for no
 // search.
 search?: string;
 movementType?: OverviewActivityMovementType;
 page?: number;
 pageSize?: number;
};

export type GetOverviewActivityData = {
 transactions: {
  rows: OverviewActivityRow[];
  page: number;
  pageSize: number;
  // The size of the whole set the page was cut out of, counted by its own
  // statement over the same filter. Not the length of rows.
  totalRows: number;
 };
 // Echoed, and null on an end the reader did not bound.
 range: {
  from: string | null;
  to: string | null;
 };
 // Echoed so a reader can tell a filtered list from a short one: five rows out of
 // two thousand is filtered, and only the server can say which.
 filters: {
  search: string | null;
  movementType: string | null;
 };
};

export type GetOverviewActivityResponse = {
 status: number;
 message: string;
 data: GetOverviewActivityData;
};

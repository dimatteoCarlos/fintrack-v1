// Response contract of the /pocket module; where it disagrees with the server, the server is right.
// Currency codes are lowercase ('usd'): the endpoint serves them so and the row builder throws otherwise.

import { CurrencyType } from './types.ts';
import { PocketStatusLevel } from '../helpers/pocketStatus.ts';

// One pocket on the board. Nothing here is clamped: a negative `remaining` means
// over-funded by that amount, and the card prints the excess as its own line.
// Only the header totals clamp before summing.
export type PocketStatus = {
 pocketId: number;
 name: string;
 // Nullable. A pocket with no note renders a dash, never '' (a note the user
 // wrote and then cleared).
 note: string | null;
 // Required and positive (the creation validator refuses anything else): a pocket
 // without a goal is not a pocket here, so neither this nor `progress` is nullable.
 target: number;
 // What the funding accounts have committed to this pocket (never called `saved`:
 // no money has moved). Bounded at the close of the selected month on the board
 // row; the detail endpoint carries no month and returns the lifetime figure.
 allocated: number;
 // target - allocated. Negative when the goal was passed.
 remaining: number;
 // 0-100, and above 100 when over-funded. Not a ratio, and not clamped.
 progress: number;
 // YYYY-MM-DD on the owner's calendar, never an ISO instant: new Date() on one is
 // UTC midnight and shows the previous day west of UTC, so build labels from the
 // parts.
 desiredDate: string;
 // The day the plan was made, same format and calendar; the schedule's line runs
 // from here to desiredDate. Never null, unlike the schedule it anchors.
 planStart: string;
 // The target over the full calendar months in the plan's window. null when the
 // window holds none (created days before its deadline, or a deadline at or
 // before creation): no instalment is published, which differs from zero.
 planInstalment: number | null;
 // What the already-due instalments require by the evaluation date: full months
 // closed since planStart times planInstalment. null together with planInstalment.
 scheduledByNow: number | null;
 // Committed minus scheduledByNow, signed: positive is ahead of the plan, negative is short.
 // Not named "movable"/"releasable": releasing it leaves the pocket exactly on its line.
 // null together with planInstalment.
 aheadOfPlan: number | null;
 // Required monthly pace over the plan's pace: a printed fact, not a classifier (`level` is server-side).
 // null once the deadline has passed or the window holds no full month; 0 once the target
 // is covered, so a truthiness check would conflate the two.
 paceRatio: number | null;
 // Negative once the deadline has passed. A printed fact, never a classifier.
 daysRemaining: number;
 // null once the deadline has passed (no pace to state); 0, not null, when already funded.
 requiredMonthly: number | null;
 funded: boolean;
 overdue: boolean;
 // One of seven mutually exclusive levels, decided once by the server. The client only
 // maps the served word to a colour and label (pocketStatus.ts); never derive it from
 // funded/overdue/paceRatio.
 level: PocketStatusLevel;
 // How many distinct accounts fund this pocket, bounded at the close of the
 // selected month, same as `allocated`.
 sourceCount: number;
 currency: CurrencyType;
 // The funding accounts no longer hold what this pocket says they committed.
 // Folded by the server across accounts, so no component can derive it.
 uncovered: boolean;
 // What moved within the selected month for this one pocket, unlike the header's
 // totalMovedInMonth, which folds every row. null when no month was requested,
 // which only the detail endpoint does.
 movedInMonth: number | null;
 committedInMonth: number | null;
 releasedInMonth: number | null;
};

// The header figures, folded by the server from the rows above so no component
// adds amounts up. An amount is null when the board is empty or mixes currencies
// (the module refuses an implicit 1:1), never zero. Counts are never null.
export type PocketBoardSummary = {
 totalAllocated: number | null;
 totalTarget: number | null;
 // What is still short of the goals, summed over the pockets that are short.
 totalRemaining: number | null;
 // What is committed past the goals, summed over the pockets that passed them.
 // Kept apart from the shortfall: netting would let one over-funded pocket hide
 // another that is behind.
 totalExcess: number | null;
 // 0-100. Clamped per pocket before folding, unlike the per-row figure.
 overallProgress: number | null;
 // null when the board is empty, and null when it mixes currencies. The two
 // are told apart by pocketCount, which is why it travels.
 currency: CurrencyType | null;
 pocketCount: number;
 fundedCount: number;
 overdueCount: number;
 uncoveredCount: number;
 // Distinct accounts holding an allocation above zero to any pocket; summing the
 // rows' sourceCount would count an account once per pocket it funds.
 sourceAccountCount: number;
 // The furthest deadline, YYYY-MM-DD on the owner's calendar; null when there are
 // no pockets. Same handling as the row's desiredDate.
 latestDesiredDate: string | null;
 // Board-wide movement in the selected month: a net and its two positive gross halves.
 // All three travel because a net of -180.00 states neither how much went in nor out.
 // Prefixed with total to stay distinct from the row's movedInMonth.
 totalMovedInMonth: number | null;
 totalCommittedInMonth: number | null;
 totalReleasedInMonth: number | null;
 // The slack held by the pockets whose level is `ahead` (their count is
 // levelCounts.ahead). Only positive slack is summed: a pocket behind its line
 // does not cancel the slack another holds, as with totalExcess.
 totalAheadOfPlan: number | null;
 // One count per level, folded by the server from the rows the list renders. Every
 // key is always present, zeros included.
 levelCounts: Record<PocketStatusLevel, number>;

 // Schedule fold: nine fields measuring the board against what its plans required by the month's close.
 // All nine count only pockets with a plan window (`scheduledByNow` not null), so
 // `scheduledPocketsAllocated` is expected to differ from `totalAllocated`.

 // What the already-due instalments required by the close of the selected month,
 // summed over the scheduled pockets.
 totalScheduledByNow: number | null;
 // The committed amount of those same pockets. Not the board's total.
 scheduledPocketsAllocated: number | null;
 // Signed sum of each pocket's slack (scheduledPocketsAllocated minus totalScheduledByNow).
 // Positive is slack held, negative is shortfall; never clamped. Unlike `totalAheadOfPlan`,
 // which sums positive slack only.
 totalScheduleGap: number | null;
 // The pace those plans now need per month to finish on time.
 totalRequiredMonthly: number | null;
 // 0-100, above 100 when the board is past what its plans asked for. Unclamped, unlike
 // `overallProgress`, so it matches the operands the card prints; only the bar's fill is clamped.
 scheduleAdherence: number | null;

 // How many pockets hold a plan window at all.
 scheduledPocketCount: number;
 // Pockets strictly below their line and at or above it (on the line counts as over), so
 // under + over === scheduledPocketCount. Not `levelCounts.behind`/`ahead`: these split
 // by slack sign, so a completed pocket lands here whatever its level; never substitute them.
 underScheduleCount: number;
 overScheduleCount: number;

 // The net moved within the selected month across those same scheduled pockets.
 // Beside the board-wide movement figures, not a redefinition of them; the
 // board-wide gross halves do not decompose it, and no scoped halves are served.
 scheduledPocketsMovedInMonth: number | null;
};

// What the endpoint answers, inside the envelope every route of this API wraps
// its payload in.
export type PocketBoardPayload = {
 summary: PocketBoardSummary;
 pockets: PocketStatus[];
 meta: {
  // The month every figure is about, YYYY-MM on the owner's calendar. It is the
  // badge's label, not what the client asked for: the first request asks for none.
  referenceMonth: string;
  // The latest month that may be asked for, same calendar. Not referenceMonth:
  // looking at August does not make August the latest month there is. YYYY-MM.
  currentMonth: string;
  // YYYY-MM-DD. The one date every figure was computed at (passed deadline, days
  // remaining, pace and level); never derived client-side.
  evaluationDate: string;
  // Why the totals read as dashes, in the server's own words; empty, never absent.
  notices: string[];
 };
};

export type PocketBoardResponse = {
 status: number;
 message: string;
 data: PocketBoardPayload;
};

// The detail of one pocket; create, edit, allocate and release answer with this payload too.

// The board row minus sourceCount (the sources table lists those accounts), derived so they cannot drift.
// This endpoint carries no month, so values differ: `allocated` is the lifetime sum, the
// `*InMonth` figures are null (print a dash), and plan fields are evaluated at today.
export type PocketDetailPocket = Omit<PocketStatus, 'sourceCount'>;

// One account funding this pocket. Four fields are nullable together, and null is not zero: the
// ledger can name an account the account read cannot resolve (soft-deleted or internal), and
// what it holds for this pocket is still counted. An account netted to zero by a release is absent.
export type PocketSource = {
 accountId: number;
 accountName: string | null;
 accountType: string | null;
 // The instant the account was opened, which is the floor of what may be dated
 // onto it. null on an account the allocation read cannot resolve.
 accountStartDate: string | null;
 // Whether the account is soft-deleted. Such a row is still offered for release and it still
 // runs: eligibility refusals apply to allocating only. null when the identity read
 // could not answer for the id.
 accountIsDeleted: boolean | null;
 // What this account has committed to this pocket.
 heldByThisPocket: number;
 // What the account has committed across every pocket it funds.
 accountAllocated: number | null;
 accountBalance: number | null;
 // The balance minus everything committed. Never called "available": a pocket
 // blocks no spending, so this is the cash no plan has claimed yet.
 accountUnassignedCash: number | null;
 // The account's own state, not this pocket's share: false means the account no
 // longer covers everything committed to it. The shortfall is never split across
 // the pockets drawing on it, since any split would need an invented policy.
 covered: boolean | null;
};

// One decision in the pocket's history. The sign is the decision: positive
// committed cash to the goal, negative released it back to unassigned cash.
// Neither moved a balance, so the screen prints the word beside the sign.
export type PocketAllocationEntry = {
 allocationId: number;
 amount: number;
 // YYYY-MM-DD on the owner's calendar. When the decision was taken, never when
 // the row was written: one agreed on Friday and typed on Monday is Friday's.
 allocationDate: string;
 // HH:MM off the same instant and zone, to tell apart two decisions on one day;
 // never derived here, since the contract sends no instant.
 allocationTime: string;
 sourceAccountId: number;
 sourceAccountName: string | null;
 // True when CLOSE deleted the account; its name survives on the registry.
 sourceAccountIsClosed: boolean;
 // Audit metadata proving the conversion ran, never a second unit to do
 // arithmetic in.
 originalAmount: number;
 originalCurrency: CurrencyType;
 // Not an amount: it keeps the ten decimals of its column so the rate that
 // produced the stored figure can be re-applied and checked against it.
 exchangeRate: number;
 exchangeRateSource: string;
 exchangeRateTimestamp: string;
};

export type PocketDetailPayload = {
 pocket: PocketDetailPocket;
 sources: PocketSource[];
 history: PocketAllocationEntry[];
 meta: { notices: string[] };
};

export type PocketDetailResponse = {
 status: number;
 message: string;
 data: PocketDetailPayload;
};

// The body POST /pocket accepts, and nothing else: the schema is strict, so an
// extra key is a 400. Identity comes from the token, so no user field is sent.
// note is omitted rather than sent empty, since '' is a note the user never wrote.
export type CreatePocketBody = {
 name: string;
 note?: string;
 targetAmount: number;
 currency: CurrencyType;
 // YYYY-MM-DD on the owner's calendar, never an instant. A Date sent over the
 // wire serialises to UTC, which is the previous day west of UTC for every
 // deadline typed in the evening.
 desiredDate: string;
};

// The body PATCH /pocket/:pocketId accepts; strict schema, so an extra key or empty body is a 400.
// `note`: null clears it, an absent key leaves it. `currency` is required whenever `targetAmount`
// is sent. The pocket's own currency is not editable: it would restate every allocation.
export type EditPocketBody = {
 name?: string;
 note?: string | null;
 targetAmount?: number;
 currency?: CurrencyType;
 desiredDate?: string;
};

// What one account gets back when the pocket it was funding is deleted. Named as
// well as numbered: the owner reads this list and an id says nothing to them.
export type PocketFreedCash = {
 accountId: number;
 accountName: string;
 freedCash: number;
};

// The one write that does not answer with the detail payload: it lists what the deletion
// released. No money moves; the cash stops being committed. An empty list is a real answer.
export type DeletePocketResult = {
 pocketId: number;
 name: string;
 freed: PocketFreedCash[];
};

export type DeletePocketResponse = {
 status: number;
 message: string;
 data: DeletePocketResult;
};

// The body both money endpoints accept (one strict schema; commit and release differ by endpoint).
// The amount is always positive; the server writes a release row negative.
export type PocketAllocationBody = {
 sourceAccountId: number;
 amount: number;
 // The unit the amount was typed in, not the pocket's. The server converts and
 // records the rate it used.
 currency: CurrencyType;
 // YYYY-MM-DD on the owner's calendar. When the decision was taken, never when
 // the row was written: one agreed on Friday and typed on Monday is Friday's.
 // Omitted means today.
 allocationDate?: string;
};

// One account the owner may commit cash from, served by the accounts-by-type read.
// The three amounts sit side by side so none reads as "available": a pocket blocks no spending.
// The pocket figures are absent, not zero, when the allocation read could not answer for the row.
export type PocketEligibleAccount = {
 account_id: number;
 account_name: string;
 account_balance: number;
 // Snake case because this row comes from the account list endpoint, which
 // serves the column's own name. The floor of what may be dated onto it.
 account_start_date?: string;
 currency_code: CurrencyType;
 allocated?: number;
 unassignedCash?: number;
 isOverAllocated?: boolean;
};

export type PocketEligibleAccountsResponse = {
 status: number;
 message: string;
 data: {
  rows: number;
  accountList: PocketEligibleAccount[];
 };
};

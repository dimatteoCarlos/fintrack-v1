// backend/src/fintrack_api/services/pocket_services/services/pocketBoardService.js

// The pocket board: every pocket the caller owns plus the totals over them, from one request. All figures, counts
// included, are computed here so a header and the list under it cannot disagree. Every figure is cumulative to the
// month's close; the plan's line is read at that close while level, pace and deadline stay at the evaluation date.

import {
 getCalendarToday,
 getPocketHistoryForUser,
 getPocketsForUser,
} from '../db/pocketRepository.js';
import {
 getAccountAllocations,
 getPocketSourceHoldings,
} from '../db/accountAllocationRepository.js';
import { makePocketStatus } from '../core/makePocketStatus.js';
import { makeActualRate } from '../core/actualRate.js';
import {
 makeCloseSchedule,
 monthCloseDate,
 previousCloseDate,
} from '../core/closeSchedule.js';
import { makeAccountAllocation } from '../core/makeAccountAllocation.js';
import { POCKET_LEVELS } from '../core/pocketLevel.js';
import { toAmount, toRate, money } from '../../budget_services/core/money.js';

const HUNDRED = 100;

/**
 * The one date every board comparison reads: today for the current month, the month's close for a past one.
 * Both inputs are already on the owner's calendar, so this is label arithmetic with no zone.
 *
 * @param {string} monthStart - YYYY-MM-01
 * @param {string} today - YYYY-MM-DD on the owner's calendar
 * @returns {string} YYYY-MM-DD
 */
const resolveEvaluationDate = (monthStart, today) =>
 monthStart.slice(0, 7) === today.slice(0, 7)
  ? today
  : monthCloseDate(monthStart);

// Invariant guard: every pocket is in the accounting currency, and a silent 1:1 sum would corrupt a total.
const MIXED_CURRENCY_NOTICE =
 'Totals add amounts in more than one currency and are not converted.';

/**
 * Which pockets have a source account that no longer covers what is committed to it.
 * Coverage belongs to the account: its deficit is never split among pockets (a split invents causality).
 *
 * @returns {Set<number>} pocket ids
 */
const findUncoveredPockets = (accountRows, holdingRows) => {
 const shortAccounts = new Set(
  accountRows
   .map(makeAccountAllocation)
   .filter((account) => account.isOverAllocated)
   .map((account) => account.accountId),
 );

 return new Set(
  holdingRows
   .filter((holding) => shortAccounts.has(holding.accountId))
   .map((holding) => holding.pocketId),
 );
};

/** Each pocket's actual rate, from the one history read of the whole board.
 * @returns {Map<number, number|null>} pocketId to actualRate
 */
const makeActualRates = (pockets, historyRows, evaluationDate) => {
 const rowsByPocket = new Map();

 for (const row of historyRows) {
  const rows = rowsByPocket.get(row.pocketId);

  if (rows) {
   rows.push(row);
  } else {
   rowsByPocket.set(row.pocketId, [row]);
  }
 }

 return new Map(
  pockets.map((pocket) => [
   pocket.pocketId,
   makeActualRate(
    rowsByPocket.get(pocket.pocketId) ?? [],
    pocket.planStart,
    evaluationDate,
    pocket.remaining,
   ).actualRate,
  ]),
 );
};

/**
 * Fold the rows into the header, summing the rounded row values so it reconciles to the cent.
 * Each pocket is clamped BEFORE the sum: an over-funded pocket must not cancel a short one, and
 * overallProgress is SUM(MIN(allocated, target)) / SUM(target). An empty board has null amounts, 0 counts.
 */
const makeSummary = (pockets, accountAllocations, actualRates) => {
 const pocketCount = pockets.length;

 // Pockets with a plan window: the schedule fields are null together when the window holds no full month,
 // so one test gives membership for every schedule figure. scheduledByNow comes from stored values, not
 // ledger rows, so it is no pace.
 const scheduled = pockets.filter((p) => p.scheduledByNow !== null);

 // Withheld as a set: with no plan window there is nothing to measure against a
 // schedule, and a zero would claim the plans required nothing.
 const noSchedule = {
  totalScheduledByNow: null,
  scheduledPocketsAllocated: null,
  totalScheduleGap: null,
  totalRequiredMonthly: null,
  totalActualRate: null,
  scheduleAdherence: null,
  scheduledPocketsMovedInMonth: null,
  totalScheduledByClose: null,
  totalGapAtClose: null,
  adherenceAtClose: null,
  surplusAtClose: null,
  surplusCountAtClose: null,
  shortfallAtClose: null,
  shortfallCountAtClose: null,
 };

 const counts = {
  pocketCount,
  fundedCount: pockets.filter((p) => p.funded).length,
  overdueCount: pockets.filter((p) => p.overdue).length,
  uncoveredCount: pockets.filter((p) => p.uncovered).length,
  // Under and over partition the scheduled pockets; strictly below zero is under, so on the line is over.
  // Not the same as levelCounts: levels are exclusive readings, so a completed pocket can count here
  // while its level says otherwise.
  scheduledPocketCount: scheduled.length,
  underScheduleCount: scheduled.filter((p) => p.aheadOfPlan < 0).length,
  overScheduleCount: scheduled.filter((p) => p.aheadOfPlan >= 0).length,
  // One count per level, from the level each row carries; every key is present, with a zero when none.
  levelCounts: POCKET_LEVELS.reduce(
   (acc, level) => ({
    ...acc,
    [level]: pockets.filter((p) => p.level === level).length,
   }),
   {},
  ),
  // No aheadCount: it equals levelCounts.ahead. Counts accounts a pocket draws on, not every owned account;
  // greaterThan, not isPositive, because Decimal.isPositive() is true for zero.
  sourceAccountCount: accountAllocations.filter((a) =>
   money(a.accountAllocated).greaterThan(0),
  ).length,
  // Those source accounts committed past their balance: the account reading
  // behind uncoveredCount, which counts pockets, so one account can uncover several.
  overAllocatedAccountCount: accountAllocations
   .map(makeAccountAllocation)
   .filter((a) => a.isOverAllocated && money(a.accountAllocated).greaterThan(0))
   .length,
  // The furthest goal, taken as a maximum rather than the last row of the list's query, whose order may change.
  // Dates are YYYY-MM-DD text, so lexicographic order is chronological.
  latestDesiredDate:
   pocketCount === 0
    ? null
    : pockets.reduce(
       (latest, p) => (p.desiredDate > latest ? p.desiredDate : latest),
       pockets[0].desiredDate,
      ),
 };

 const noAmounts = {
  totalAllocated: null,
  totalTarget: null,
  totalRemaining: null,
  totalExcess: null,
  totalAheadOfPlan: null,
  totalMovedInMonth: null,
  totalCommittedInMonth: null,
  totalReleasedInMonth: null,
  overallProgress: null,
  currency: null,
  ...noSchedule,
  ...counts,
 };

 if (pocketCount === 0) {
  return noAmounts;
 }

 const currencies = new Set(pockets.map((p) => p.currency));
 const currency = currencies.size === 1 ? [...currencies][0] : null;

 if (currency === null) {
  return noAmounts;
 }

 const sums = pockets.reduce(
  (acc, p) => {
   const target = money(p.target);
   const allocated = money(p.allocated);
   const gap = target.minus(allocated);

   // Only pockets whose level reads ahead, so the sum covers the same population as levelCounts.ahead
   // printed beside it.
   const ahead = p.level === 'ahead' ? money(p.aheadOfPlan ?? 0) : money(0);

   return {
    allocated: acc.allocated.plus(allocated),
    target: acc.target.plus(target),
    remaining: gap.isPositive() ? acc.remaining.plus(gap) : acc.remaining,
    excess: gap.isNegative() ? acc.excess.plus(gap.negated()) : acc.excess,
    covered: acc.covered.plus(gap.isPositive() ? allocated : target),
    // Positive side only: it answers how much can be moved, so a pocket behind must not cancel slack.
    ahead: ahead.isPositive() ? acc.ahead.plus(ahead) : acc.ahead,
    // The month's movement nets by design (the sign is the fact); the gross halves are summed beside it.
    moved: acc.moved.plus(money(p.movedInMonth ?? 0)),
    committed: acc.committed.plus(money(p.committedInMonth ?? 0)),
    released: acc.released.plus(money(p.releasedInMonth ?? 0)),
   };
  },
  {
   allocated: money(0),
   target: money(0),
   remaining: money(0),
   excess: money(0),
   covered: money(0),
   ahead: money(0),
   moved: money(0),
   committed: money(0),
   released: money(0),
  },
 );

 // Schedule fold over pockets with a plan window only; kept apart because the population differs from above.
 const scheduleSums = scheduled.reduce(
  (acc, p) => ({
   scheduledByNow: acc.scheduledByNow.plus(money(p.scheduledByNow)),
   allocated: acc.allocated.plus(money(p.allocated)),
   // Signed, unlike the clamped slack above: whether the board is on plan is answered by the cancellation.
   gap: acc.gap.plus(money(p.aheadOfPlan)),
   // Null once a deadline has passed; a pace nobody can still meet is not a zero
   // to add into the pace the owner is asked to hold.
   requiredMonthly: acc.requiredMonthly.plus(money(p.requiredMonthly ?? 0)),
   moved: acc.moved.plus(money(p.movedInMonth ?? 0)),
  }),
  {
   scheduledByNow: money(0),
   allocated: money(0),
   gap: money(0),
   requiredMonthly: money(0),
   moved: money(0),
  },
 );

 // The pockets totalRequiredMonthly adds up: a funded one needs 0, a past-deadline one has no pace.
 // The actual rate is summed over the same set so the two figures compare like for like.
 const pacePockets = scheduled.filter((p) => p.requiredMonthly > 0);

 // The plan's line at the month's close and each pocket's gap to it. The gap is split by sign before summing:
 // the net is what must be added if money moves between pockets, the sides are pockets to draw from and to fill.
 const closeSums = scheduled.reduce(
  (acc, p) => {
   const gap = money(p.aheadAtClose);

   return {
    scheduled: acc.scheduled.plus(money(p.scheduledByClose)),
    gap: acc.gap.plus(gap),
    surplus: gap.greaterThan(0) ? acc.surplus.plus(gap) : acc.surplus,
    surplusCount: acc.surplusCount + (gap.greaterThan(0) ? 1 : 0),
    shortfall: gap.lessThan(0) ? acc.shortfall.plus(gap) : acc.shortfall,
    shortfallCount: acc.shortfallCount + (gap.lessThan(0) ? 1 : 0),
   };
  },
  {
   scheduled: money(0),
   gap: money(0),
   surplus: money(0),
   surplusCount: 0,
   shortfall: money(0),
   shortfallCount: 0,
  },
 );

 const scheduleTotals =
  scheduled.length === 0
   ? noSchedule
   : {
      totalScheduledByNow: toAmount(scheduleSums.scheduledByNow),
      scheduledPocketsAllocated: toAmount(scheduleSums.allocated),
      totalScheduleGap: toAmount(scheduleSums.gap),
      totalRequiredMonthly: toAmount(scheduleSums.requiredMonthly),
      // Signed, like the gap: a release in one pocket and a commitment in another
      // did both happen, and the pace of the whole is their difference. Null when
      // no pocket is asked for a pace, so the screen omits it instead of a zero.
      totalActualRate:
       pacePockets.length === 0
        ? null
        : toAmount(
           pacePockets.reduce(
            (total, p) => total.plus(money(actualRates.get(p.pocketId) ?? 0)),
            money(0),
           ),
          ),
      // Quotient of the two sums, unclamped: clamping each pocket at 100 would drop the surplus of pockets over
      // their line and contradict the two amounts printed beside it. Null, not zero, when nothing has been
      // required yet (a plan whose first instalment is not yet due).
      scheduleAdherence: scheduleSums.scheduledByNow.isZero()
       ? null
       : toRate(
          scheduleSums.allocated
           .dividedBy(scheduleSums.scheduledByNow)
           .times(HUNDRED),
         ),
      // Scoped to the scheduled pockets; the board-wide committed and released halves do not decompose it.
      scheduledPocketsMovedInMonth: toAmount(scheduleSums.moved),
      totalScheduledByClose: toAmount(closeSums.scheduled),
      totalGapAtClose: toAmount(closeSums.gap),
      // The same quotient rule as scheduleAdherence: two sums, unclamped, and null
      // when the plans require nothing by the close.
      adherenceAtClose: closeSums.scheduled.isZero()
       ? null
       : toRate(
          scheduleSums.allocated.dividedBy(closeSums.scheduled).times(HUNDRED),
         ),
      surplusAtClose: toAmount(closeSums.surplus),
      surplusCountAtClose: closeSums.surplusCount,
      // Negative, as the sum of negative gaps: the sign is the fact.
      shortfallAtClose: toAmount(closeSums.shortfall),
      shortfallCountAtClose: closeSums.shortfallCount,
     };

 return {
  totalAllocated: toAmount(sums.allocated),
  totalTarget: toAmount(sums.target),
  totalRemaining: toAmount(sums.remaining),
  totalExcess: toAmount(sums.excess),
  totalAheadOfPlan: toAmount(sums.ahead),
  totalMovedInMonth: toAmount(sums.moved),
  totalCommittedInMonth: toAmount(sums.committed),
  totalReleasedInMonth: toAmount(sums.released),
  overallProgress: toRate(sums.covered.dividedBy(sums.target).times(HUNDRED)),
  currency,
  ...scheduleTotals,
  ...counts,
 };
};

export const pocketBoardService = {
 /**
  * The board of one user as of a month's close: figures are cumulative, movement figures cover that month.
  * Coverage is deliberately not month-bounded: there is no historical balance to read a past close from.
  *
  * @param {string} userId - from the token
  * @param {string} timeZone - the owner's IANA zone, resolved by the controller
  * @param {string} monthStart - YYYY-MM-01, validated by the controller
  * @returns {Promise<{summary: object, pockets: object[], meta: object}>}
  */
 async getBoard(pool, userId, timeZone, monthStart) {
  const [today, rows, accountRows, holdingRows, historyRows] =
   await Promise.all([
    getCalendarToday(pool, timeZone),
    getPocketsForUser(pool, userId, monthStart, timeZone),
    getAccountAllocations(pool, userId),
    getPocketSourceHoldings(pool, userId),
    getPocketHistoryForUser(pool, userId, monthStart, timeZone),
   ]);

  const evaluationDate = resolveEvaluationDate(monthStart, today);

  const uncovered = findUncoveredPockets(accountRows, holdingRows);

  const closeDate = monthCloseDate(monthStart);
  const priorCloseDate = previousCloseDate(monthStart);

  const pockets = rows.map((row) => {
   const status = makePocketStatus(row, evaluationDate);

   return {
    ...status,
    ...makeCloseSchedule(status, closeDate, priorCloseDate),
    uncovered: uncovered.has(row.pocketId),
   };
  });

  const summary = makeSummary(
   pockets,
   accountRows,
   makeActualRates(pockets, historyRows, evaluationDate),
  );

  // Guarding on currency alone would fire on an empty board, where a null
  // currency means "no pockets", not "two currencies".
  const notices =
   summary.pocketCount > 0 && summary.currency === null
    ? [MIXED_CURRENCY_NOTICE]
    : [];

  return {
   summary,
   pockets,
   meta: {
    // The month answered, the current month (where forward navigation stops), and the comparison date.
    referenceMonth: monthStart.slice(0, 7),
    currentMonth: today.slice(0, 7),
    evaluationDate,
    notices,
   },
  };
 },
};

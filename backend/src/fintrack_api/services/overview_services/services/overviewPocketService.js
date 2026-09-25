// Pocket calculator (GET /overview/pocket): pocket_saving is empty since migration 020, so figures come
// from pocketBoardService, not the stock-domain body. The total is committed money already in the hero's
// bank balance, so the hero must not add it. The trend is month-close positions ending on that total.

import { pocketBoardService } from '../../pocket_services/services/pocketBoardService.js';
import {
 getMonthlyAllocated,
 getAllocationsPage,
} from '../db/overviewPocketRepository.js';
import { getBankBalance, getFreeCash } from '../db/overviewPageRepository.js';
import { makeDomainCard } from '../core/makeDomainCard.js';
import { makeTrendSeries } from '../core/makeTrendSeries.js';
import { makePocketAnalysis } from '../core/makePocketAnalysis.js';
import { isFullAnalysis, wantsAnalysis } from '../core/analysisLevels.js';
import { TREND_MONTHS } from '../core/monthArithmetic.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

// Shown when no pocket is planned. The total stays 0 because the ALL card adds it
// and a null would poison the sum; this notice separates "0 across no plans" from
// "0 across three plans".
export const NO_POCKET_NOTICE =
 'No savings pocket has been planned, so the allocated total is reported over none.';

export const overviewPocketService = {
 /**
  * Everything GET /overview/pocket returns, for one month and one page.
  *
  * The board is fetched for its summary; level 2 also uses its per-pocket rows, so
  * "which plans are on track" costs no extra statement.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window, page, pageSize, includeTransactionRows, analysis }
  */
 async getPocketDomainData(
  pool,
  userId,
  { window, page, pageSize, includeTransactionRows = true, analysis },
  timeZone = 'UTC',
 ) {
  const { referenceMonth, trendStart, analysisStart, periodStart, periodEnd } =
   window;

  const withAnalysis = wantsAnalysis(analysis);

  const [board, months, allocations, bankBalance, freeCash] = await Promise.all([
   pocketBoardService.getBoard(pool, userId, timeZone, referenceMonth),
   getMonthlyAllocated(
    pool,
    userId,
    withAnalysis ? analysisStart : trendStart,
    referenceMonth,
    timeZone,
   ),
   getAllocationsPage(pool, userId, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
   // Full level only. Free cash cannot be composed from two totals: the floor is
   // applied per account before the sum, so an overcommitted account contributes
   // nothing instead of a credit against a healthy one.
   isFullAnalysis(analysis)
    ? getBankBalance(pool, userId, referenceMonth, timeZone)
    : undefined,
   isFullAnalysis(analysis)
    ? getFreeCash(pool, userId, referenceMonth, timeZone)
    : undefined,
  ]);

  const { summary } = board;
  const hasPockets = summary.pocketCount > 0;
  const levels = summary.levelCounts;

  const card = makeDomainCard({
   domain: 'pocket',
   // The board's totalAllocated, not repeated in domainFields: two names would be two figures.
   // 0 where the board reports null: ALL adds this total, so it must be a number.
   totalAmount: summary.totalAllocated ?? 0,
   // Counts the month's allocation rows, not transactions: no allocation moves
   // money. The field keeps its contract name so a rename can happen across the
   // whole payload at once.
   transactionCount: allocations.totalRows,
   // The net committed in the month is the change in the committed total, so the
   // delta is read, not recomputed from two series points.
   delta: summary.totalMovedInMonth,
   domainFields: {
    // Passed through as the board computed them, nulls included: they must equal the board's figures.
    // remaining is clamped per pocket before summing and excess is reported apart, so an over-funded
    // goal cannot cancel an underfunded one. progress is coverage, never above 100.
    target: summary.totalTarget,
    remaining: summary.totalRemaining,
    progress: summary.overallProgress,
    // The identity is allocated - excess + remaining = target; without excess a
    // reader adding the visible amounts gets a third total with nothing to explain
    // it. Passed through as reported, null included.
    excess: summary.totalExcess,
    // Counts line in the board's two bands: Target reached is completed + aboveTarget, In progress the other
    // five levels. overAllocatedAccountCount counts the accounts behind uncoveredCount, which counts pockets.
    targetReachedCount: levels.completed + levels.aboveTarget,
    inProgressCount:
     levels.ahead + levels.onTrack + levels.behind + levels.atRisk + levels.overdue,
    overdueCount: summary.overdueCount,
    uncoveredCount: summary.uncoveredCount,
    overAllocatedAccountCount: summary.overAllocatedAccountCount,
   },
   currency: ACCOUNTING_CURRENCY_CODE,
   window: {
    periodStart,
    periodEnd,
   },
   notices: hasPockets ? [] : [NO_POCKET_NOTICE],
  });

  return {
   card,
   transactions: {
    rows: allocations.rows,
    page,
    pageSize,
    totalRows: allocations.totalRows,
   },
   // Cut to TREND_MONTHS explicitly, so the card's chart is the same six points
   // whether or not the request asked for an analysis.
   trend: makeTrendSeries(months, TREND_MONTHS),
   // Each pocket's level as the board classified it, for the overview page's
   // Pareto rows (makeFinancialGoals). This endpoint's screen does not read it.
   pocketLevels: board.pockets.map(({ pocketId, level }) => ({ pocketId, level })),
   ...(withAnalysis
    ? {
       analysis: makePocketAnalysis({
        level: analysis,
        months,
        // The board's rows, republished and never recomputed, so this section and
        // the board agree by construction.
        pockets: board.pockets,
        // The card's figure, so the decomposition uses the published total.
        committed: card.totalAmount,
        bankBalance,
        freeCash,
       }),
      }
    : {}),
  };
 },
};

// The one place a pocket is classified: seven levels evaluated top down, so mutually exclusive.
// Server-side so the client cannot disagree with the board's counts; the criterion is progress
// against the plan's own line, never nearness to the deadline.

// Thresholds on paceRatio (required pace over the plan's own pace): on its own
// pace is on track; needing twice the pace it set is at risk.
const AT_RISK_RATIO = 2;
const ON_TRACK_RATIO = 1;

// On track is a band around a ratio of 1, since instalments rarely divide evenly (12,000 over
// eleven months is 1,090.909...). On the ratio, not money, so it is worth more early in a plan;
// symmetric, because slightly over the line meets the plan as much as slightly under.
const ON_TRACK_BAND = 0.05;

/**
 * The level of one pocket at the evaluation date.
 *
 * @param {object} reading
 * @param {import('decimal.js').Decimal} reading.targetAmount
 * @param {import('decimal.js').Decimal} reading.allocatedAmount
 * @param {boolean} reading.overdue - deadline passed with the target unmet
 * @param {number|null} reading.paceRatio - null when the plan has no window
 * @param {number|null} reading.aheadOfPlan - committed minus what the already-due
 *   instalments required, signed; null when the plan has no window
 * @returns {'aboveTarget'|'completed'|'overdue'|'atRisk'|'behind'|'ahead'|'onTrack'}
 */
export function makePocketLevel({
 targetAmount,
 allocatedAmount,
 overdue,
 paceRatio,
 aheadOfPlan,
}) {
 if (allocatedAmount.greaterThan(targetAmount)) {
  return 'aboveTarget';
 }

 if (allocatedAmount.greaterThanOrEqualTo(targetAmount)) {
  return 'completed';
 }

 if (overdue) {
  return 'overdue';
 }

 // A plan with no window (deadline on or before its creation day) has no pace to fall behind, so it
 // reads on track; reached by same-day pockets and legacy pockets stamped with migration 020's date.
 if (paceRatio === null) {
  return 'onTrack';
 }

 if (paceRatio >= AT_RISK_RATIO) {
  return 'atRisk';
 }

 if (paceRatio > ON_TRACK_RATIO + ON_TRACK_BAND) {
  return 'behind';
 }

 // Below the band only the signed money says whether the pocket is really early, so 'ahead' never
 // prints over a card reading "180.00 behind the plan". They diverge on the deadline day, where
 // daysLeft is floored at one and a remainder under 0.95 of a day's rate falls below the band.
 if (paceRatio < ON_TRACK_RATIO - ON_TRACK_BAND) {
  return aheadOfPlan !== null && aheadOfPlan > 0 ? 'ahead' : 'behind';
 }

 return 'onTrack';
}

// Reporting order of the board's counts, exported so the fold and every consumer
// share one list. It is a reading order, not the evaluation order above: the two
// finished states first, then from running early to run out.
export const POCKET_LEVELS = Object.freeze([
 'completed',
 'aboveTarget',
 'ahead',
 'onTrack',
 'behind',
 'atRisk',
 'overdue',
]);

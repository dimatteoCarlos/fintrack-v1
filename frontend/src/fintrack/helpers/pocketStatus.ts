// How one pocket reads, decided once so a square and its border cannot disagree. budgetStatusLevel is not
// reused: the meaning inverts (nearing a budget limit is bad, nearing a pocket target is the point).
// The server serves `level` per row (pocketLevel.js); this file only maps it to a word and colour.

// Ordered from least to most demanding of the owner, matching `POCKET_LEVELS` on the server. `ahead` is
// its own level: a pace ratio <= 1 also holds for a pocket ahead of plan, which would read "On track".
export type PocketStatusLevel =
 | 'completed'
 | 'aboveTarget'
 | 'ahead'
 | 'onTrack'
 | 'behind'
 | 'atRisk'
 | 'overdue';

// The class the shared StatusSquare appends.
// onTrack uses an explicit 'neutral': the bare square painted an undeclared variable's teal fallback.
// completed maps to '' because it is drawn as a star; ask `pocketMarkIsStar` before painting a square.
const SQUARE_CLASS: Record<PocketStatusLevel, string> = {
 completed: '',
 aboveTarget: 'info',
 ahead: 'ahead',
 onTrack: 'neutral',
 behind: 'behind',
 atRisk: 'warning',
 overdue: 'alert',
};

// Levels of a reached goal are marked by a star, decided here so card, hero strip and detail panel agree.
// A shape still separates them when colour vision collapses the hues.
export const pocketMarkIsStar = (level: PocketStatusLevel): boolean =>
 level === 'completed' || level === 'aboveTarget';

// The star's colour: green for a goal met exactly, blue for one passed.
export const pocketStarTone = (level: PocketStatusLevel): 'complete' | 'info' =>
 level === 'aboveTarget' ? 'info' : 'complete';

// The border modifier comes from the same level as the square, so the two cannot disagree.
// onTrack resolves to --color-status-neutral for both.
// completed keeps the --ok border: a line cannot be a shape, so hue is all this row can carry.
const READING_MODIFIER: Record<PocketStatusLevel, string> = {
 completed: 'summaryPocket__reading--ok',
 aboveTarget: 'summaryPocket__reading--info',
 ahead: 'summaryPocket__reading--ahead',
 onTrack: 'summaryPocket__reading--neutral',
 behind: 'summaryPocket__reading--behind',
 atRisk: 'summaryPocket__reading--warning',
 overdue: 'summaryPocket__reading--alert',
};

// The one place this vocabulary is spelled, so the card, the hero's tallies and the
// board filter cannot name a level differently. Consumers read it with its casing;
// the hero strip lower-cases the word it gets.
export const POCKET_STATUS_WORD: Record<PocketStatusLevel, string> = {
 completed: 'Completed',
 // Over and not Above: over / short is the board's word pair for money.
 aboveTarget: 'Over target',
 // "Ahead", not "Ahead of plan": the chip, filter option and strip hold one- or two-word labels,
 // and the longer phrase would be the only one to wrap.
 ahead: 'Ahead',
 onTrack: 'On track',
 behind: 'Behind',
 atRisk: 'At risk',
 overdue: 'Overdue',
};

export const pocketSquareClass = (level: PocketStatusLevel): string =>
 SQUARE_CLASS[level];

export const pocketReadingModifier = (level: PocketStatusLevel): string =>
 READING_MODIFIER[level];

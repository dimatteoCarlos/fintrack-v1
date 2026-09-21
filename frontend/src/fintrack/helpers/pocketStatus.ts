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

// Class appended by the shared StatusSquare: behind and ahead take --color-status-behind (violet, 5.88:1)
// and --color-status-ahead (green, 8.34:1). onTrack is 'neutral': the bare square paints an undeclared
// `--square`. completed is '' because it is drawn as a tick: ask `pocketMarkIsTick`, not this map.
const SQUARE_CLASS: Record<PocketStatusLevel, string> = {
 completed: '',
 aboveTarget: 'info',
 ahead: 'ahead',
 onTrack: 'neutral',
 behind: 'behind',
 atRisk: 'warning',
 overdue: 'alert',
};

// Levels marked by shape instead of hue, decided here so the card, hero strip and detail panel agree. Only
// `completed` qualifies: under deuteranopia the seven levels collapse to two hue families (completed,
// aboveTarget, ahead, onTrack and behind sit within 1.11:1), so only a shape still separates it.
export const pocketMarkIsTick = (level: PocketStatusLevel): boolean =>
 level === 'completed';

// Modifier on the reading's left border, from the same level as the square so the two cannot disagree.
// completed keeps the --ok border although its mark is a tick: a border is a line, so hue is all it has.
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
 aboveTarget: 'Above target',
 // "Ahead", not "Ahead of plan" (the readings card's sentence form): this map feeds
 // a chip, a filter option and a strip of one- or two-word entries, and the longer
 // phrase would be the only one to wrap.
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

// The row type and colour rule shared by ParetoBar.tsx (a ranking with a running
// total) and DonutChart.tsx (parts of a whole), which draw the same array.

// One row of a ranked breakdown, in the figures every ranking publishes. Domain
// field names are not here (five domains name the same figure five ways); the
// adapter that owns the domain renames once.
export type RankedRow = {
 // Stable across renders and never the array index: the ranking reorders when
 // the month changes, and an index key would carry one row's state onto
 // another's. The adapter supplies the domain's own identifier.
 key: string;
 label: string;
 amount: number;
 // 0-1, this row's own share of the total.
 share: number;
 // Drawn as a word beside the amount, never as a colour alone: colour already
 // encodes rank on this row.
 isFlagged?: boolean;
};

// 0-1 to '12.3%'. One decimal because the server rounds the ratio to four places
// (makeCategoryBreakdown.js), so a second decimal would print resolution the
// figure does not carry.
export const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

// The mark for a running share that has no answer: the same dash PanelTotal
// prints for a figure that did not arrive, so a reader learns one mark for
// "there is no number here".
export const NO_SHARE = '—';

// How many hues the categorical scale declares before it repeats.
const CATEGORY_INKS = 8;

// Row colour shared by bar and donut, so one category never gets two colours. Categorical, not a
// single-hue ramp (ramp steps measured under 10 in CIE Lab, the tightest hue pair 38). By rank:
// stable within a screen, not across months. Returns a var(); the values live in tokens.css.
export const categoryInk = (index: number) =>
 `var(--color-scale-category-${(index % CATEGORY_INKS) + 1})`;

// Splits a ranking into the rows that spent and the zero rows both legends fold
// under one "Others" row. The index is taken first because it is the colour.
export const foldZeroRows = <Row extends RankedRow>(rows: Row[]) => {
 const indexed = rows.map((row, index) => ({ ...row, index }));

 return {
  spending: indexed.filter((row) => row.amount > 0),
  folded: indexed.filter((row) => row.amount <= 0),
 };
};

// The caller's plural noun, made singular for a count of one: every unitLabel
// in use is 'categories', 'sources', 'accounts', 'counterparties' or 'pockets'.
export const countNoun = (count: number, unitLabel: string) =>
 count !== 1
  ? unitLabel
  : unitLabel.endsWith('ies')
   ? `${unitLabel.slice(0, -3)}y`
   : unitLabel.replace(/s$/, '');

// 'Others · 2 categories', 'Others · 1 category'.
export const othersLabel = (count: number, unitLabel: string) =>
 `Others · ${count} ${countNoun(count, unitLabel)}`;

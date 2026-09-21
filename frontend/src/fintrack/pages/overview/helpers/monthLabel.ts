// 'YYYY-MM-01' to 'September 2026', or to 'Sep 2026'.

// What a month that has not arrived renders as. A dash and never a guess: the
// month is read off the served window, never computed from the browser clock.
const NO_MONTH = '—';

// 'long' is the page's default - a card title has the room for it. 'short' is
// for a figure's own line, where the month sits beside the number it belongs to.
type MonthLabelLength = 'long' | 'short';

// Split and rebuilt, not parsed from the string: an ISO date-only string is UTC midnight, which
// is the previous month west of Greenwich. The three-argument constructor builds a local date.
export const monthLabel = (
 month: string | null,
 length: MonthLabelLength = 'long',
) => {
 if (!month) return NO_MONTH;

 const [year, monthNumber] = month.split('-').map(Number);

 return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
  month: length,
  year: 'numeric',
 });
};

// Download file names: the months the data covers, not the download day (the same
// range exported on different days gets the same name), plus the username so two
// accounts exporting one period do not overwrite each other's file.

// username has no character-class rule (requiredNameSchema checks only length and blankness), so it
// is collapsed to a-z, 0-9 and '-' for filenames and headers; 'user' covers a blank name. NFD splits
// accents off first, so 'José Ñandú' reads 'jose-nandu'.
const sanitizeForFilename = (value) => {
 const clean = (value ?? '')
  .trim()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

 return clean || 'user';
};

/**
 * @param {{from: (string|null), to: (string|null), format: string, username: string}} range -
 *  from/to as 'YYYY-MM-01' or null; format the file extension ('csv'|'xlsx')
 */
export function exportFileName({ from, to, format, username }) {
 const who = sanitizeForFilename(username);

 if (!from && !to) {
  return `fintrack-movements-${who}-all-time.${format}`;
 }

 // One bound only: named after that month rather than as a range with a missing side.
 if (!from || !to || from === to) {
  const month = (from ?? to).slice(0, 7);
  return `fintrack-movements-${who}-${month}.${format}`;
 }

 return `fintrack-movements-${who}-${from.slice(0, 7)}_${to.slice(0, 7)}.${format}`;
}

/**
 * Statement name: one reference month, never a range, plus the username.
 *
 * @param {{referenceMonth: string, format: string, username: string}} statement -
 *  referenceMonth 'YYYY-MM-01'; format the file extension ('xlsx'|'pdf')
 */
export function statementFileName({ referenceMonth, format, username }) {
 const who = sanitizeForFilename(username);
 return `fintrack-statement-${who}-${referenceMonth.slice(0, 7)}.${format}`;
}

/**
 * Per-module export name, `<dataset>_<user>_<period>` (for example
 * `pocket_ana_2026-09.csv`). It shares sanitizeForFilename with the two names
 * above, so a username contributes the same characters everywhere.
 *
 * @param {{dataset: string, period: string, format: string, username: string}} file -
 *  dataset 'budget'|'pocket'|'debt'; period already reduced to the months the
 *  data covers, never the download date; format the extension ('csv'|'xlsx')
 */
export function moduleExportFileName({ dataset, period, format, username }) {
 return `${dataset}_${sanitizeForFilename(username)}_${period}.${format}`;
}

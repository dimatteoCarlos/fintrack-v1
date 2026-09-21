// The owner's note and the server's narration share one description column; ten composing sites
// write the marker below, the only seam between them. Interim: a note column of its own would
// change only this file.

// With the colon and the space, not the bare word: a note that legitimately opens
// "Transaction fee for Binance" would otherwise be cut at its first word and come
// back empty.
const NARRATIVE_MARKER = 'Transaction: ';

// Composed by the server, never typed; stripped because they survive the split
// and would read on screen as the owner's own note.
const SYSTEM_PREFIXES = ['Expense Reversal.', 'Income Reversal.'];

/**
 * The owner's note, or null (not '') when absent: only two of the ten composing sites can
 * prepend a note, so absence is the ordinary case and readers must tell it from an empty one.
 *
 * @param {string|null|undefined} description
 * @returns {string|null} the note, trimmed, or null
 */
export function extractNoteFromDescription(description) {
 if (typeof description !== 'string') return null;

 let note = description.split(NARRATIVE_MARKER)[0];

 for (const prefix of SYSTEM_PREFIXES) {
  if (note.startsWith(prefix)) note = note.slice(prefix.length);
 }

 note = note.trim();

 // The composer appends a period to the note it prepends; removing exactly one
 // returns what was typed either way (an owner who ended with a period has two).
 if (note.endsWith('.')) note = note.slice(0, -1).trim();

 return note === '' ? null : note;
}

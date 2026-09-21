// Known limits of the statement, worded for the owner (no internal identifiers). Shared by the XLSX
// Metadata & Audit sheet and the PDF's numbered notes so the two formats cannot drift apart.

export const KNOWN_LIMITS = [
 'Closed accounts drop out of past closes.',
 'Debtors closed in past months can make receivable less payable differ from the net debt position.',
 'A negative bank or investment balance nets inside its total and is not moved to liabilities.',
];

// Accounting currency (the currency used for ledger and balances)
export const ACCOUNTING_CURRENCY_CODE = process.env.ACCOUNTING_CURRENCY_CODE || 'usd';

// Months back an operative date may be placed, current month included (1 = current month only).
// Movement dates and account opening days share it; a bad value falls back to the default (6, mirrored in the
// frontend constants.ts). Only 3 months of historical rates are verified for every currency; 4-6 are untested.
const configuredBackdatingWindow = Number.parseInt(
 process.env.BACKDATING_WINDOW_MONTHS ?? '',
 10,
);

export const BACKDATING_WINDOW_MONTHS =
 Number.isInteger(configuredBackdatingWindow) && configuredBackdatingWindow >= 1
  ? configuredBackdatingWindow
  : 6;



// Accounting currency (the currency used for ledger and balances)
export const ACCOUNTING_CURRENCY_CODE = process.env.ACCOUNTING_CURRENCY_CODE || 'usd';

// How far back an operative date may be placed, in calendar months including the current one
// (1 = current only). Movement date and account opening day share it so their policies cannot
// drift. A garbled or absent value falls back to the default: it must not stop the server starting.
const configuredBackdatingWindow = Number.parseInt(
 process.env.BACKDATING_WINDOW_MONTHS ?? '',
 10,
);

export const BACKDATING_WINDOW_MONTHS =
 Number.isInteger(configuredBackdatingWindow) && configuredBackdatingWindow >= 1
  ? configuredBackdatingWindow
  : 2;



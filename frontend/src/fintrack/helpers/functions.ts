// Helpers that present data in the UI: currency, number and date formatting.
import { CurrencyType } from '../types/types';
import {
  BACKDATING_WINDOW_MONTHS,
  DATE_TEXT_FORMAT,
} from './constants';

import {
  CURRENCY_CYCLE,
  CURRENCY_MINOR_UNITS,
  DEFAULT_CURRENCY,
} from './constants';

// How many decimal places a currency has: CURRENCY_MINOR_UNITS for a supported
// code, Intl for any other. Returns 2 for a code Intl cannot resolve, which is
// the width the backend stores.
export function currencyMinorUnit(chosenCurrency: string): number {
  const listed = CURRENCY_MINOR_UNITS[chosenCurrency as CurrencyType];
  if (listed !== undefined) return listed;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: chosenCurrency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function currencyFormat(
  chosenCurrency = 'USD',
  number = 0,
  countryFormat = 'en-US',
) {
  // Decimals follow the currency (a yen has none), not a constant. Columns stay
  // aligned because the count varies by currency and not by row.
  const digits = currencyMinorUnit(chosenCurrency);

  const formatFn = new Intl.NumberFormat(countryFormat, {
    style: 'currency',
    currency: chosenCurrency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return formatFn.format(number);
}
// The reader's own currency shows as a symbol, any other as its ISO code: the
// dollar and the Colombian and Mexican pesos all narrow to '$', so marking the
// foreign one is what makes the unmarked one mean "yours".
export function getCurrencySymbol(
  chosenCurrency = 'USD',
  readerCurrency: string = DEFAULT_CURRENCY,
) {
  if (chosenCurrency.toUpperCase() !== readerCurrency.toUpperCase()) {
    return chosenCurrency.toUpperCase();
  }

  try {
    // Format 0 in the runtime's default locale with 'narrowSymbol' (the shortest
    // form, $ rather than US$) and strip digits and separators to leave the symbol.
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: chosenCurrency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    const formattedZero = formatter.format(0);
    const symbol = formattedZero.replace(/[\d.,\s]/g, '');

    // An empty or code-equal result means the locale has no unique symbol.
    if (
      symbol === '' ||
      symbol.toUpperCase() === chosenCurrency.toUpperCase()
    ) {
      return chosenCurrency;
    }
    return symbol;
  } catch (error) {
    // Invalid currency or any other failure: fall back to the code.
    console.error(`Error al obtener el símbolo para ${chosenCurrency}:`, error);
    return chosenCurrency;
  }
}
export function getNextCurrency(currentCurrency: CurrencyType): CurrencyType {
  const currentIndex = CURRENCY_CYCLE.indexOf(currentCurrency);
  const nextIndex = (currentIndex + 1) % CURRENCY_CYCLE.length;
  return CURRENCY_CYCLE[nextIndex] as CurrencyType;
}

// Uppercase codes accepted by isValidCurrencyCode; mirrors SUPPORTED_CURRENCIES.
export
const validCurrencyCodes = new Set([
  'USD',
  'EUR',
  'COP',
  'VES',
  'MXN',
  'JPY',
]);

export function isValidCurrencyCode(currency: string): boolean {
  const upperCurrency = currency.toUpperCase();
  return validCurrencyCodes.has(upperCurrency);
}
export function numberFormatCurrency(
  x: number | string = 0,
  decimals: number = 2,
  currency?: string,
  formatNumberCountry: string = 'en-US',
): string {
  const enteredNumber = parseFloat(String(x));

  if (isNaN(enteredNumber)) {
    return 'Not a valid number, please try again';
  }

  if (currency && isValidCurrencyCode(currency)) {
    // The currency's minor unit caps the requested precision, never raises it: callers pass 2,
    // which a yen cannot carry. The no-currency branch below keeps the caller's decimals (rates).
    const digits = Math.min(decimals, currencyMinorUnit(currency));

    const formatter = new Intl.NumberFormat(formatNumberCountry, {
      style: 'currency',
      currency,
      useGrouping: true,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return formatter.format(enteredNumber);
  }

  const formatter = new Intl.NumberFormat(formatNumberCountry, {
    useGrouping: true,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatter.format(enteredNumber);
}
// Month a budget lands in. Resolved in the owner's zone because the server
// truncates the month there too: on the last day of a month the browser's zone
// and the owner's can disagree by one month.
//
// openedOn defaults to now; New Category passes its Starting Point picker's
// value so the badge names the month that day belongs to.
export function getCurrentBudgetMonthLabel(
  timeZone?: string,
  countryFormat = DATE_TEXT_FORMAT,
  openedOn: Date = new Date(),
) {
  return openedOn.toLocaleDateString(countryFormat, {
    month: 'long',
    year: 'numeric',
    timeZone,
  });
}

// The month a budget screen reports, as its badge shows it: '2026-08-01' ->
// 'August 2026'. Built from the parts, not new Date(month): a 'YYYY-MM-DD' string
// parses as UTC midnight and renders as the previous month in any negative offset.
export function formatBudgetMonthLabel(
  month: string | null | undefined,
  countryFormat = DATE_TEXT_FORMAT,
) {
  if (!month) return '';

  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return '';

  return new Date(year, monthNumber - 1, 1).toLocaleDateString(countryFormat, {
    month: 'long',
    year: 'numeric',
  });
}

// '2026-12-31' -> 'Dec 31, 2026'. Built from the parts (as formatBudgetMonthLabel is): new Date(day)
// would move a deadline back a day west of UTC.
export function formatCalendarDate(
  day: string | null | undefined,
  countryFormat = DATE_TEXT_FORMAT,
) {
  if (!day) return '';

  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return '';

  return new Date(year, month - 1, date).toLocaleDateString(countryFormat, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Picker Date -> YYYY-MM-DD on the device's calendar. Sending the Date or toISOString() serialises
// to UTC, so an evening pick west of UTC would arrive as the next day.
export function toCalendarDay(instant: Date): string {
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Inverse of toCalendarDay. new Date('2026-08-29') is UTC midnight, the 28th west of UTC, and saving
// it back would move an untouched date. Null for absent or malformed input (Invalid Date renders NaN).
export function fromCalendarDay(day: string | null | undefined): Date | null {
  if (!day) return null;

  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return null;

  return new Date(year, month - 1, date);
}

// First day of the oldest month the back-dating window reaches; without it a picker falls back to 1900.
// Not the guarantee: the server validates the same window and would answer 422.
export function earliestDatableDay(): Date {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth() - (BACKDATING_WINDOW_MONTHS - 1), 1);
}

// Latest day a calendar may offer for an account opening: the end of today.
// A forward-dated account is filtered out of every tracker selector by
// isAccountOpenOn with nothing on screen saying why.
//
// Shared here because three forms open an account now (New Account, New
// Category, New Profile), and three local copies of one ceiling could drift.
export function latestDatableDay(): Date {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return today;
}

// Carries the board's month across a link: the month lives in the URL, so a link
// that drops it lands on a screen that silently falls back to the current month.
export function withMonthParam(path: string, month: string | null | undefined) {
  if (!month) return path;

  return path.includes('?') ? `${path}&month=${month}` : `${path}?month=${month}`;
}

export function isDateValid(
  dateStr: Date | string | number | undefined | null,
) {
  if (dateStr === null || dateStr === undefined) {
    return false;
  }

  if (typeof dateStr === 'number') {
    return !isNaN(new Date(dateStr).getTime());
  }

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

// ISO 8601 as the API serves it -> dd-mm-yyyy, read in UTC.
export const formatDateToDDMMYYYY = (
  isoDate: Date | string | undefined | null,
) => {
  if (!isoDate) {
    return 'not a valid date';
  }
  const date = new Date(isoDate);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

// The boundary account's real stored name ('slack'), relabeled for display only.
// Scoped to an account_name field, never to free text: the counterpart of a
// transfer or a balance reversal is the one place this raw name still reaches
// a render, since every selector already excludes it from pickable lists.
const BOUNDARY_ACCOUNT_STORED_NAME = 'slack';
export const displayAccountName = (
  name: string | null | undefined,
): string | null =>
  name === BOUNDARY_ACCOUNT_STORED_NAME ? 'Internal System Account' : name ?? null;

// Local date-time as DD/MM/YYYY HH:MM.
export const formatDate = (date: Date | string) =>
  new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function capitalize(text: string | undefined): string {
  if (!text) {
    return '';
  }
  const lower = text.toLowerCase();

  // Uppercases the first letter of the text and of each sentence after a period.
  const capitalized = lower.replace(/(^\w)|(\. \w)|(\.\w)/g, (match) =>
    match.toUpperCase(),
  );

  return capitalized;
}


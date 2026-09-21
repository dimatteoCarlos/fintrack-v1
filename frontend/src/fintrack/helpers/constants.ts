import { TransactionsAccountApiResponseType } from '../types/responseApiTypes';
import {
  DropdownOptionType,
  VariantType,
} from '../types/types';

// A default here is either a CHOICE the app stands behind (DEFAULT_CURRENCY, VARIANT_DEFAULT) or a
// SAMPLE for development. Never hand a blank entity (0, '') to a fetching screen as initial state: it
// renders like a real answer; start at null and show a dash or skeleton.
export const PAGE_LOC_NUM = 3;

// Read by useAuth.ts.
export const INITIAL_PAGE_ADDRESS = '/fintrack/tracker/expense';
export const LOCAL_STORAGE_KEY = {
 REMEMBER_ME: 'fintrack_remember_me',
 USER_DATA: 'fintrack_user_data',
};

// Currency constants live in currencyConstants.ts. Do not redeclare one below: a
// local export wins over this star re-export without a conflict and silently
// splits consumers between two copies.
export * from './currencyConstants';

// Calendar months a date may reach back, counting the current one (1 = current month only).
// Must equal BACKDATING_WINDOW_MONTHS in backend/.env, which the browser cannot read: if they differ,
// the calendar offers days the server refuses (422) or stays closed to the owner.
const configuredBackdatingWindow = Number.parseInt(
  import.meta.env.VITE_BACKDATING_WINDOW_MONTHS ?? '',
  10,
);

export const BACKDATING_WINDOW_MONTHS =
  Number.isInteger(configuredBackdatingWindow) && configuredBackdatingWindow >= 1
    ? configuredBackdatingWindow
    : 2;

export const DATE_TIME_FORMAT_DEFAULT = 'es-ES';

// For dates rendered as a word: a month name makes the locale the interface
// language (English); DATE_TIME_FORMAT_DEFAULT only sets separators and order.
export const DATE_TEXT_FORMAT = 'en-US';

export const VARIANT_DEFAULT: VariantType = 'tracker';

export const VARIANT_FORM: VariantType = 'form';

// Movement type ids exactly as stored in the DB.
export const MOVEMENT_TYPES: Record<number, string> = {
  1: 'expense',
  2: 'income',
  3: 'investment',
  4: 'debt',
  5: 'pocket',
  6: 'transfer',
  7: 'receive',
  8: 'account-opening',
  9: 'pnl',
};

export const ACCOUNT_OPTIONS_DEFAULT = [];

export const CATEGORY_OPTIONS_DEFAULT = [];

export const SOURCE_OPTIONS_DEFAULT = [];

export const DEBTOR_OPTIONS_DEFAULT: DropdownOptionType[] = [];

export const TYPEDEBTS_OPTIONS_DEFAULT = [
  { value: 'lending', label: 'Lending' },
  { value: 'borrowing', label: 'Borrowing' },
];

export const ACCOUNT_TYPE_DEFAULT: DropdownOptionType[] = [
  {
    value: 'account type',
    label: 'bank',
  },
  {
    value: 'account type',
    label: 'investment',
  },
  {
    value: 'account type',
    label: 'income_source',
  },
];

export const DEFAULT_ACCOUNT_TRANSACTIONS: TransactionsAccountApiResponseType =
  {
    status: 200,
    message:
      'This is a sample. 5 transaction(s) found for account id SAMPLE. Period between startDate and endDate.',

    data: {
      totalTransactions: 5,
      summary: {
        initialBalance: {
          amount: 1010.55,
          date: '2025-06-15T22:40:50.140Z',
          currency: 'usd',
        },
        finalBalance: {
          amount: 902.55,
          currency: 'usd',
          date: '2025-06-16T00:55:12.445Z',
        },
        periodStartDate: '2025-05-18',
        periodEndDate: '2025-06-18',
      },

      transactions: [
        {
          transaction_id: 23,
          user_id: 'c109eb15-4139-43b4-b081-8fb9860588af',
          description:
            'EXAMPLE.Transaction: withdraw. Transfered 2 usd from account "Nueva Cuenta" (bank) credited to "presents_other" (category_budget). Date: 15/06/2025, 20:55',
          amount: -2.0,
          movement_type_id: 1,
          transaction_type_id: 1,
          currency_id: 1,
          account_id: 21,
          account_balance_after_tr: 902.55,
          source_account_id: 21,
          destination_account_id: 27,
          status: 'complete',
          transaction_actual_date: '2025-06-16T00:55:12.445Z',
          created_at: '2025-06-16T04:55:13.424Z',
          updated_at: '2025-06-16T04:55:13.424Z',
          movement_type_name: 'example',
          currency_code: 'usd',
          account_name: 'Nueva Cuenta',
          account_starting_amount: 1010.55,
          account_start_date: '2025-06-15T22:40:50.140Z',
        },
      ],
    },
  };

export const TILE_LABELS = [
  { labelText: 'Must', className: 'label--text' },
  { labelText: 'Need', className: 'label--text' },
  { labelText: 'Want', className: 'label--text' },
  { labelText: 'Other', className: 'label--text' },
];

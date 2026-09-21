// Response types of the backend API.
import { CurrencyType } from './types';

export type BalanceBankRespType = {
  status: number;
  message: string;
  data: {
    total_balance: number | null;
    accounts: number;
    currency_code: CurrencyType;
  };
};
export type BalanceIncomeRespType = {
  status: number;
  message: string;
  data: {
    total_balance: number | null;
    accounts: number;
    currency_code: CurrencyType;
  };
};
export type BalancePocketRespType = {
  status: number;
  message: string;
  data: {
    account_name: string | null;
    account_id?: number | null;

    total_balance: number | null;
    total_target: number | null;
    total_remaining?: number | null;
    currency_code: CurrencyType;

    note?: string | null;
  };
};
export type BalancePocketSavingRespType = {
  status: number;
  message: string;
  data: {
    total_balance: number | null;
    total_target: number | null;
    total_remaining?: number | null;
    currency_code: CurrencyType;
  };
};

export type BalanceCategoryRespType = {
  status: number;
  message: string;
  data: {
    total_balance: number | null;
    total_budget: number | null;
    total_remaining: number | null;
    currency_code: CurrencyType;
  };
};

export type DebtorRespType = {
  status: number;
  message: string;
  data: {
    total_debt_balance: number | null;
    debt_receivable: number | null;
    debt_payable: number | null;
    debtors: number | null;
    lenders: number | null;
    debtors_without_debt: number | null;
    currency_code: CurrencyType;
  };
};
export interface CreateBasicAccountApiResponseType {
  status: number;
  message: string;
  data: ResponseDataType;
}

type ResponseDataType ={
  user_id: string;
  account_basic_data: AccountBasicDataType;
  new_account_data: NewAccountDataType;
  counter_account_data: CounterAccountDataType;
}

export type TransactionDataType ={
  transaction_id?: number;
  description: string;
  amount: number;
  movement_type_id: number;
  transaction_type_id: number;
  transaction_type_name: string;
  currency_id: number;
  account_id: number;
  account_name?: string;
  source_account_id?: number;
  destination_account_id?: number;
  status: string;
  transaction_actual_date: string | Date;

  original_amount: number;
  original_currency_code: string;
  exchange_rate: number;
  exchange_rate_source: string;
  exchange_rate_timestamp: string | Date;
  
  created_at?: Date;
  updated_at?: Date;
}

// Answer of GET /transaction/:id for the detail modal. Separate from TransactionDataType (account
// creation): that one declares currency_id, which this endpoint omits, and lacks currency_code.
export type TransactionDetailType = {
  transaction_id: number;
  description: string;
  amount: number;
  // Nullable because the join is a left one; the modal falls back to
  // DEFAULT_CURRENCY.
  currency_code: CurrencyType | null;

  // The whole FX block is null on a transaction with no conversion, which is most
  // of them.
  original_amount: number | null;
  original_currency_code: string | null;
  exchange_rate: number | null;
  exchange_rate_source: string | null;
  exchange_rate_timestamp: string | Date | null;

  transaction_actual_date: string | Date;
  // Resolved in the owner's time zone by the server; never date a row from the
  // instant above, which is read on the clock of whoever is looking.
  transaction_local_date: string;
  transaction_local_time: string;

  account_id: number;
  account_name: string | null;
  account_type_name: string | null;

  movement_type_id: number;
  movement_type_name: string | null;
  transaction_type_id: number;
  transaction_type_name: string | null;

  // Only a transfer has counterparts, so every one of these is absent on an
  // ordinary deposit or withdrawal.
  source_account_id: number | null;
  source_account_name: string | null;
  source_account_type: string | null;
  destination_account_id: number | null;
  destination_account_name: string | null;
  destination_account_type: string | null;

  status: string;
  account_balance_after_tr: number;
};

interface TransactionInfoType extends TransactionDataType {
  transaction_id: number;
  created_at?: Date;
  amount: number;
}

export type  AccountBasicDataType ={
  account_id: number;
  account_name: string;
  account_type_id: number;
  account_type_name: string;
  currency_id?: number;
  currency_code: CurrencyType;
  account_balance: number;
  account_starting_amount?: number;
  account_start_date: string | Date;
  created_at?: Date;
  updated_at?: Date;
}

interface NewAccountDataType {
  account_name: string;
  transaction_data: TransactionDataType;
  transaction_info: TransactionInfoType;
  transaction_type_name: string;
}

interface CounterAccountDataType {
  transaction_data: TransactionDataType & {
    userId: string;
  };
  transaction_info: TransactionInfoType;
  transaction_type_name: string;
  balance: number;
  account_type_name: string;
}

export type CreateCategoryBudgetAccountApiResponseType = {
  data: CategoryBudgetResponseDataType;
  status: number;
  message: string;
};

type CategoryBudgetResponseDataType = ResponseDataType & {
  new_category_budget_account: CategoryBudgetAccountType;
  budget_allocation: BudgetAllocationType;
};

type CategoryBudgetAccountType = {
  account_id: number;
  category_name: string;
  category_nature_type_id: number;
  subcategory?: string | null;
  // The budget in the accounting currency. This is the figure every read path
  // sums, and it is not what the user typed unless they picked that currency.
  budget: number | string;
  amount?: number;
  account_start_date: Date | string;
  nature_type_name: string;
  // The origin currency the request carried, not the one budget is stored in.
  currency_code: CurrencyType;
  // FX audit trail of the conversion that produced budget.
  original_budget: number | string;
  original_currency_id: number;
  exchange_rate: number | string;
  exchange_rate_source: string;
  exchange_rate_timestamp: Date | string;
  exchange_rate_target_currency_id: number;
};

// The row the server writes to budget_monthly_allocations, which is where every
// read path resolves the amount from. Camel case: it is built by the service,
// not spread from a database row.
type BudgetAllocationType = {
  accountId: number;
  budgetMonth: string;
  budgetAmount: number;
};
export type CreateDebtorAccountApiResponseType = {
  status: number;
  data: DebtorResponseDataType;
  message: string;
};

interface DebtorResponseDataType extends ResponseDataType {
  new_debtor_account: DebtorAccountType;
}

type DebtorAccountType = {
  account_id: number;
  value: number; // monetary format, e.g. -120.00
  debtor_name: string;
  debtor_lastname: string;
  selected_account_name: string;
  selected_account_id: number | null;
  account_start_date: Date | string; // ISO 8601 format
  currency_code: CurrencyType;
  account_type_name: 'debtor';

  // FX audit fields. value is the accounting currency; original_value is what
  // the user typed. See migration 016.
  original_value: number;
  original_currency_id: number;
  exchange_rate: number;
  exchange_rate_source: string;
  exchange_rate_timestamp: Date | string;
  exchange_rate_target_currency_id: number;
};
export type AccountByTypeResponseType = {
  status: number;
  message: string;
  data: {
    rows: number;
    accountList: AccountListType[];
  };
};

// One pocket drawing on an account (GET /account/:accountId), ordered by name. A pocket whose net fell
// to zero after a full release is absent, so an empty array is a real answer: no pocket is funded.
export type AccountPocketAllocationType = {
  pocketId: number;
  // The pocket's name, not an id: an id tells the owner nothing about where their
  // cash went.
  name: string;
  // What this account holds for that pocket, never the pocket's own progress
  // towards its target. The payload carries no target, so this figure has no
  // denominator and cannot be drawn as a proportion.
  heldFromThisAccount: number;
};

export type AccountListType = Omit<
  AccountBasicDataType,
  'currency_id'| 'updated_at'
> & {
  // The calendar day account_start_date falls on in the owner's time zone (detail endpoint only);
  // account_start_date is an instant, and its UTC parts can name the wrong day.
  account_start_local_date?: string;

  // Soft-deleted flag, served only by GET /account/:accountId, which still returns a deleted account
  // (the deletion flow reads it); lists drop deleted rows. A screen showing one must check it.
  is_deleted?: boolean;

  // Pocket commitments of this account, from GET /account/:accountId (the three scalars also from
  // accounts-by-type). All four are absent, not zero, on non-bank types: zero would claim nothing is
  // committed where the question cannot be asked. None follows the month picker (whole allocation ledger).
  allocated?: number;
  // Balance minus everything committed; never called "available", since a pocket blocks no spending.
  // Can be negative (a deficit the screen reports, not corrects) and is never split across the pockets.
  unassignedCash?: number;
  // True exactly when the figure above is negative.
  isOverAllocated?: boolean;
  pockets?: AccountPocketAllocationType[];
};
export type CategoryBudgetAccountsResponseType = {
  status: number;
  message: string;
  data: {
    rows: number;
    accountList: CategoryBudgetAccountListType[];
  };
};

export type CategoryBudgetAccountListType = 
  AccountBasicDataType & {
  budget: number;
  subcategory?: string;
  category_name: string;
  category_nature_type_name: string;
  category_nature_type_id?: number;
  account_start_date: Date | string;
  user_id?:string;
  remain?:number;
  statusAlert?:boolean;
};
export type MovementTransactionResponseType = {
  status: number;
  message: string;
  data: DataTransactionType;
};
type DataTransactionType = {
  movement: MovementType;
  source: SourceOrDestinationType;
  destination: SourceOrDestinationType;
};

type MovementType = {
  movement_type_name: string;
  movement_type_id: number;
};

type SourceOrDestinationType = {
  account_info: AccountInfo;
  balance_updated: BalanceUpdatedType;
  transaction_info: RecordTransactionInfoType;
};
type AccountInfo = {
  account_name: string;
  account_type: string;
  amount: number;
  currency: CurrencyType;
};

type BalanceUpdatedType = {
  amount_transaction: number;
  new_balance: number;
};

type RecordTransactionInfoType = {
  transaction_type: string;
  transaction_description: string;
  transaction_date: string | Date;
};
export type FinancialDataRespType = {
  status: number;
  message: string;
  data: FinancialDataType;
};
export interface FinancialDataType {
  dateRange: DateRange;
  monthlyAmounts: MonthlyDataType[] | null;
  // Year figure per movement type, served rather than summed from the months (which ends a cent apart).
  // amount and currency are both null when a type's months span more than one currency.
  yearlyTotals: YearlyTotalsType | null;
}

export type YearlyTotalType = {
  amount: number | null;
  currency: CurrencyType | null;
};

export type YearlyTotalsType = Partial<Record<MovementKindType, YearlyTotalType>>;

export type MovementKindType = 'expense' | 'income' | 'saving' | 'other';

export interface DateRange {
  start: string | Date;
  end: string | Date;
}

export type MonthlyDataType = {
  month_index: number;
  month_name: string;
  movement_type_id: number;
  transaction_type_id: number;
  name: string;
  amount: number;
  currency_code: CurrencyType;
  type: 'expense' | 'income' | 'saving' | 'other';
};
export type LastMovementRespType = {
  status: number;
  message: string;
  data: MovementTransactionDataType[] | null;
};

export type MovementTransactionDataType = {
  movement_type_name: string;
  account_id: number;
  user_id: string;
  account_name: string;
  account_type_id: number;
  currency_code: CurrencyType;
  currency_id: number;
  account_starting_amount: number;
  account_balance: number;
  account_start_date: string | Date;
  created_at: string;
  updated_at: string;
  transaction_id: number;
  description: string;
  // What the owner typed, split out of description by the server. Null when the
  // row carries none. Optional so a client running ahead of the server renders a
  // dash rather than breaking.
  note?: string | null;
  amount: number;
  movement_type_id: number;
  transaction_type_id: number;
  source_account_id: number;
  destination_account_id: number;
  status: string;
  transaction_actual_date: string | Date;
  transaction_type_name: string;
  account_type_name: string;
};
export type CategoryListSummaryType= {
  status: number;
  message: string;
  data?: CategoryListType[] | null;
}
export type CategoryListType={
  category_name: string;
  currency_code: CurrencyType;
  total_balance: number;
  total_remaining: number;
}
export interface DebtorListSummaryType {
  status: number;
  message: string;
  data?: DebtorListType[] | null;
}

export type DebtorListType ={
  account_name: string;
  account_id: number;
  currency_code: CurrencyType;
  total_debt_balance: number;
  debt_receivable: number;
  debt_payable: number;
  debtor: number; //1/0
  creditor: number; //1/0
}
export type PocketListSummaryType = {
  status: number;
  message: string;
  data?: PocketListType[] | null;
}

export type PocketListType ={
  account_name: string;
  account_id: number;
  currency_code: CurrencyType;
  balance: number;

  remaining?: number;
  target: number;
  desired_date:Date;
  note: string;
  account_start_date:Date | string;
}
type AccountBalanceInfoType = {
  amount: number;
  date: string; // ISO 8601 date string
  currency: string;
};

export type AccountSummaryBalanceType = {
  initialBalance: AccountBalanceInfoType;
  finalBalance: AccountBalanceInfoType;
  periodStartDate: string; // YYYY-MM-DD
  periodEndDate: string; // YYYY-MM-DD
};

export type AccountTransactionType = {
  transaction_id: number;
  user_id: string;
  description: string;
  amount: number; // string representation of number
  movement_type_id: number;
  transaction_type_id: number;
  currency_id: number;
  account_id: number;
  account_balance_after_tr: number;
  source_account_id: number;
  destination_account_id: number;
  status: string;
  transaction_actual_date: string; // ISO 8601 date string
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
  movement_type_name: string;
  currency_code: string;
  account_name: string;
  account_starting_amount: number;
  account_start_date: string; // ISO 8601 date string
  // The day in the account owner's calendar, resolved in SQL. Render this, not a slice of
  // transaction_actual_date (an instant that can name the neighbouring day). Optional for older servers.
  transaction_local_date?: string; // YYYY-MM-DD
  // The hour of that same day, on that same calendar. Optional for the same
  // reason: a client running ahead of the server renders the date alone.
  transaction_local_time?: string | null; // HH:MM
  // Spent in the month up to and including this row: movement types 1 and 6 only (as the budget counts),
  // so served on category_budget alone, null elsewhere. Absent on the legacy start/end path (no month).
  month_cumulative_spent?: number | null;
  // What the owner typed, split out of description by the server. Null when the
  // row carries none, which is every account opening and every counterparty
  // narration. Optional so a client running ahead of the server renders a dash.
  note?: string | null;
};

export type AccountTransactionDataType = {
  totalTransactions: number;
  summary: AccountSummaryBalanceType;
  transactions: AccountTransactionType[];
};

export type TransactionsAccountApiResponseType = {
  status: number;
  message: string;
  data: AccountTransactionDataType;
};
// Basic account fields combined with the debtor-specific edition fields.
export type DebtorAccountDetailType = AccountBasicDataType & {
  debtor_name: string;
  debtor_lastname: string;
};
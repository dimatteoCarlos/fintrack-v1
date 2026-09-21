
import { AccountListType } from "./responseApiTypes";

export type CategoriesType = {
  categories?: CategoryType[] | null;
};

export type CategoryType = {
  id: number;
  name: string;  description: string;
  is_essential: boolean;
  created_at: string;
};

export type ExpenseAccountsType = {
  accounts?: ExpenseAccountType[] | null;
};
export type ExpenseAccountType = {
  id: number;
  name: string;  description: string;
  type: string;
  currency: CurrencyType;
  balance: number;
};

export type ExpensesInfoType = {
  count: number;
  expenses?: ExpenseType[] | null;
  limit: number;
  offset: number;
};

export type ExpenseType = {
  id: number;
  date: string;
  category: string;
  category_id: number;
  expense: number;
  description: string;
  method: string;
  originalAmount: number;
  account_id: number;
  account_type: string;
};

export type IncomeAccountsType = {
  accounts?: IncomeAccountType[] | null;
};
export type IncomeAccountType = {
  id: number;
  name: string;  description: string;
  type: string;  currency: string;
  balance: number;
};
export type IncomeInfoType = {
  count: number;
  incomes: IncomeType[] | null;
  limit?: number;
  offset?: number;
};

export type IncomeType = {
  id: number;
  date: string;
  amount: number;
  description: string;
  account_id: number;
  account_name: string;  created_at: string;
};

export type InvestmentAccountsType = {
  accounts?: InvestmentAccountType[] | null;
};

export type TransactionType = 'deposit' | 'withdraw';

export type InvestmentAccountType = {
  id: number;
  name: string;
  description: string;
  type: TransactionType;
  currency: string;
  balance: number;
};

export type MovementTransactionType = TransactionType | DebtsTransactionType;

// A transfer between bank, investment, category_budget and income_source accounts.
export type MovementInputDataType = {
  amount:string;
  origin: string;
  currency: CurrencyType;
  destination: string
 ;
 note: string;

 originAccountType: TransferAccountType;
  destinationAccountType: TransferAccountType;

 originAccountId?: number;
 destinationAccountId?: number;

 type?: MovementTransactionType;
 date?: Date;
};

export type TransferAccountType=
  'bank' | 'investment' |'category_budget' | 'income_source' ;

export type MovementAccountType = {
  id: number;
  name: string;
  description: string;
  type: TransactionType;
  currency: string;
  balance: number;
};

export type DebtorsListType = { debtors: DebtorDataType[] };
export type DebtorDataType = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  description: string;
};

export type DebtsTransactionType = string;

export type DebtorNewProfileType = 'lending' | 'borrowing';

export type DebtsType = {
  result?: DebtType[] | null;
};

export type DebtType = {
  debtor_id: number;
  debtor_name: string;
  net_amount: number;
  total_amount_borrowed: number;
  total_amount_lent: number;
  currency?: string;
};

export type CategoryBudgetListType = {
  budgets?: CategoryBudgetType[];
};

export type CategoryBudgetType = {
  category_name: string;
  remaining: number;
  spent: number;
};

export type PocketsToRenderType = {
  pocketName: string;
  description: string;
  saved: number;
  goal: number;
  currency: CurrencyType;
  status?: number;
  pocket_id: number;
  desired_date:Date
};
export type CurrencyType = 'usd' | 'cop' | 'eur'| 'ves' | 'mxn' | 'jpy';

export type DebtorType = 'debtor' | 'lender';

export type FormNumberInputType = { [key: string]: string };

export type VariantType = 'tracker' | 'form' | 'light' | 'dark';

export type DropdownOptionType<T = string> = { 
  value: T; 
  label: string; 
};

export type TopCardSelectStateType =
  | ExpenseInputDataType
  | IncomeInputDataType
  | InvestmentInputDataType
  | DebtsTrackerInputDataType
  | BasicTrackerMovementInputDataType;

export type ExpenseInputDataType = {
  amount:string;
  account: string;
  category: string | undefined;
  note: string;
  currency: string;
};

export type IncomeInputDataType = {
  amount: string;
  account: string;
  source: string ;
  note: string;
  currency: CurrencyType;
};

export type InvestmentInputDataType = {
  amount: number | '';
  account: string;
  currency: CurrencyType;
  type: MovementTransactionType;
  date: Date;
  note: string;
};

export type DebtsTrackerInputDataType = {
  amount: number | '';
  debtor: string;
  currency: CurrencyType;
  type: MovementTransactionType;
  account: string;
  accountType: string | undefined;
  // No `date`: the screen sends transactionActualDate (a calendar day), so a Date
  // here would be a second, unread answer to the same question.
  note: string;
};

export type BasicTrackerMovementInputDataType = {
  amount:string;
  currency: CurrencyType;
  account: string;
  accountType: string | undefined;
  note: string;
  type?: MovementTransactionType;
  date?: Date;
  accountId?:string;
};

export type TopCardElementsType = {
    titles: { title1: string; title2: string , label2?:string};
    value: string;
    selectOptions: {
      title: string;
      options: {
        value: string;
        label: string;
      }[];
      variant: VariantType;
    };
    accountsListInfo?:AccountListType[];
  };

export type UserRolesType = 'user' | 'admin' | 'super_admin';

export type CategorySummaryInfoType = {
    total_balance: number;
    total_budget: number;
    remain: number;
    total_remaining?:number;
    statusAlert: boolean;
    currency_code: CurrencyType;
    category_name?: string;
}

 

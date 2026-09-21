import { CurrencyType, MovementTransactionType } from '../types/types';

export type ExpenseValidatedDataType = {
  amount: number; // numeric after validation
  account: string;
  category: string;
  note: string;
  currency: CurrencyType;
};

export type IncomeValidatedDataType = {
  amount: number; // numeric after validation
  account: string;
  source: string;
  note: string;
  currency: CurrencyType;
};

export type MovementValidatedDataType = {
  amount: number;
  origin: string;
  currency: CurrencyType;
  destination: string | undefined;
  originAccountId?: number;
  destinationAccountId?: number;
  note: string;
  originAccountType: string;
  destinationAccountType: string;
};

export type BasicTrackerMovementValidatedDataType = {
  amount: number;
  currency: CurrencyType;
  account: string;
  accountType: string | undefined;
  note: string;
  type?: MovementTransactionType;
  date: Date;
  accountId?: string;
};
// Per-field error messages validateForm returns when validation fails; T is the form's field names.

export type ValidationMessagesType<T extends Partial<Record<string, unknown>>> =
  {
    [K in keyof T]?: string;
  };

export type ValidationResultType<T extends Record<string, unknown>> = {
  errors: ValidationMessagesType<T>;
  data: T | null;
};


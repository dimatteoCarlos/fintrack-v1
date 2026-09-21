// Defines which editable fields to render, for each account type.
import {
  BaseAccountEditFormData,
  CategoryBudgetEditFormData,
  DebtorAccountEditFormData,
} from './editSchemas';
import { AccountListType } from '../../types/responseApiTypes';

// fieldName spans every field name of all the edition schemas.
export type FieldConfigType = {
  fieldName: keyof (BaseAccountEditFormData &
    CategoryBudgetEditFormData &
    DebtorAccountEditFormData);
  label: string;
  inputType: 'text' | 'number' | 'textarea' | 'select' | 'date'; // mirrors FieldInputType
  isEditable: boolean; // false = read-only
  isRequired: boolean; // for Zod, it must be validated and not null
  placeholder?: string;
  options?: { value: string; label: string }[];
  helpText?: string;
  // Whether a change to this field triggers complex logic such as a recalculation.
  isCritical?: boolean;
  // The field is built from others (e.g. a debtor's account_name) and is read-only in the UI.
  isDerived?: boolean;
  // Receives the form state and returns the derived value.
  compute?: (data: Record<string, unknown>) => string;
};

export type AccountSchemaConfigType = {
  [key in AccountListType['account_type_name']]: FieldConfigType[];
};

export const basicAccountConfig: FieldConfigType[] = [  // base for bank, investment and income_source
  {
    fieldName: 'account_name',
    label: 'Account Name',
    inputType: 'text',
    isEditable: true,
    isRequired: true,
    placeholder: 'Account Name',
  },
  {
    fieldName: 'note',
    label: 'Note',
    inputType: 'textarea',
    isEditable: true,
    isRequired: false,
    placeholder: 'Add any relevant note (max 90 chars)',

  },
];
export const ACCOUNT_EDIT_SCHEMA_CONFIG: AccountSchemaConfigType = {
  bank: basicAccountConfig,
  investment: [
    ...basicAccountConfig,
  ],
  income_source: [
    ...basicAccountConfig,
  ],

  category_budget: [
    {
      fieldName: 'account_name',
      label: 'Account Name',
      inputType: 'text',
      isEditable: false,
      isRequired: true,
      placeholder: 'Account Name',
      // No compute here: the server derives and normalizes this name. A copy of
      // that rule in the client drifts the moment the server's rule changes.
      helpText: 'Built by the server from Category, Subcategory and Nature.',
    },

    // No budget amount field: it is edited by EditAccount's budget block through
    // PUT /budget/accounts/:accountId/current, not through this PATCH.

    {
      fieldName: 'category_name',
      label: 'Category Name',
      inputType: 'text',
      isEditable: true,
      isRequired: true,
      placeholder: 'e.g., Food',
    },

    {
      fieldName: 'subcategory',
      label: 'Subcategory',
      inputType: 'text',
      isEditable: true,
      isRequired: false,
      placeholder: 'e.g., Cheddar',
    },

    {
      fieldName: 'category_nature_type_name',
      label: 'Nature of Expense',
      inputType: 'select',
      isEditable: true,
      isRequired: true,
      options: [
        { value: 'must', label: 'Must' },
        { value: 'need', label: 'Need' },
        { value: 'want', label: 'Want' },
        { value: 'other', label: 'Other' },
      ],
    },

    {
      fieldName: 'note',
      label: 'Notes',
      inputType: 'textarea',
      isEditable: true,
      isRequired: false,
      placeholder: 'Max 90 chars',
    },
  ],

  debtor: [
    {
      fieldName: 'debtor_name',
      label: 'Name',
      inputType: 'text',
      isEditable: true,
      isRequired: true,
      placeholder: 'e.g., John',
      isCritical: true, // a change here updates account_name
    },

    {
      fieldName: 'debtor_lastname',
      label: 'LastName',
      inputType: 'text',
      isEditable: true,
      isRequired: true,
      placeholder: 'e.g., Doe',
      isCritical: true, // a change here updates account_name
    },

    {
      fieldName: 'account_name',
      label: 'Account Name',
      inputType: 'text',
      isEditable: false,
      isRequired: false,
      isDerived: true,
      helpText: 'Generated from Debtor Name and Lastname.',
      // Both write paths (creation and the server's debtor branch) compose `${lastname}, ${name}`; only
      // filled parts are joined, so a half-typed form shows no dangling separator.
      compute: (data: Record<string, unknown>) => {
        const name = String(data.debtor_name ?? '').trim();
        const lastname = String(data.debtor_lastname ?? '').trim();

        return [lastname, name].filter(Boolean).join(', ');
      },
    },
    {
      fieldName: 'note',
      label: 'Notes',
      inputType: 'textarea',
      isEditable: true,
      isRequired: false,
      placeholder: 'Max 90 chars',
    },
  ],
};

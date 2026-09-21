import {
  CurrencyType,
  TransactionType,
  TransferAccountType,
} from '../../types/types';
import { checkNumberFormatValueForSchema } from '../zod_schemas/commonSchemas';
type ValidParsedValuesType =
  | string
  | number
  | Date
  | CurrencyType
  | TransactionType
  | undefined;

type ValidateReturnType = {
  isValid: boolean;
  message: string;
  parsedValue: ValidParsedValuesType;
};

// Shape shared by every field validation schema.
type FieldValidationSchema = {
  type: string;
  required: boolean;
  validate: (value: string) => ValidateReturnType;
};
export const PnLValidationSchema = {
  amount: {
    type: 'number',
    required: true,
    validate: (rawValue: string): ValidateReturnType => {
      const value = rawValue.trim();

      if (!value.trim()) {
        return {
          isValid: false,
          message: '* Amount is required',
          parsedValue: undefined,
        };
      }

      const { isError, formatMessage, valueToSave } =
        checkNumberFormatValueForSchema(value);

      if (isError) {
        return {
          isValid: false,
          message: `* Error: ${formatMessage}`,
          parsedValue: undefined,
        };
      }

      if (valueToSave !== undefined && valueToSave <= 0) {
        return {
          isValid: false,
          message: `* Error: Amount must be > 0`,
          parsedValue: undefined,
        };
      }

      const isValid = !isError && !!valueToSave && valueToSave > 0;

      const message = isError
        ? `* Error:${formatMessage}`
        : `Format:${formatMessage}`;
      const parsedValue = valueToSave;

      return { isValid, message, parsedValue };
    },
  },
  account: {
    type: 'dropdown',
    required: true,
    validate: (value: string) => {
      const isValid = !!value;
      const message = !value ? `* Please select an Account` : ``;
      const parsedValue = value;
      return { isValid, message, parsedValue };
    },
  },
  note: {
    type: 'textarea',
    required: true,
    validate: (value: string): ValidateReturnType => {
      if (!value.trim()) {
        return {
          isValid: false,
          message: '* Please describe profit/loss',
          parsedValue: undefined,
        };
      }
      if (value.trim().length < 4 || value.trim().length >= 150) {
        return {
          isValid: false,
          message: `* Note must be min:4 and max:150 chars`,
          parsedValue: undefined,
        };
      }

      return {
        isValid: true,
        message: '',
        parsedValue: value.trim(),
      };
    },
  },

  currency: {
    type: 'currency', // value fixed by app config
    required: true,
    validate: (value: string): ValidateReturnType => ({
      isValid: true,
      message: '',
      parsedValue: value as CurrencyType,
    }),
  },

  type: {
    type: 'select',
    required: true,
    validate: (value: string): ValidateReturnType => ({
      isValid: true,
      message: '',
      parsedValue: value as TransactionType,
    }),
  },

  accountType: {
    type: 'custom',
    required: false,
    validate: (value: string): ValidateReturnType => ({
      isValid: true,
      message: '',
      parsedValue: (value as TransferAccountType) || undefined,
    }),
  },

  date: {
    type: 'date',
    required: true,
    validate: (value: string): ValidateReturnType => {
      const parsedDate = value ? new Date(value) : new Date();

      return {
        isValid: true,
        message: '',
        parsedValue: parsedDate,
      };
    },
  },
} as const;

// Validates every field of formData against the schema; returns the messages and the parsed data.
export const validateAllFn = <FormDataType extends Record<string, unknown>>(
  formData: FormDataType,
  validationSchema: Record<string, FieldValidationSchema>,
) => {
  let isValid = true;
  const fieldErrorMessages: Record<string, string> = {};

  const data: Record<string, ValidParsedValuesType> = {};

  for (const [fieldName, fieldSchema] of Object.entries(validationSchema)) {
    const value = formData[fieldName as keyof FormDataType];
    // validate() takes a string.
    const stringValue =
      value !== undefined && value !== null ? String(value) : '';

    const {
      isValid: fieldIsValid,
      message,
      parsedValue,
    } = fieldSchema.validate(stringValue);

    if (!fieldIsValid) {
      isValid = false;
      fieldErrorMessages[fieldName] = message;
    } else {
      if (parsedValue !== undefined) {
        data[fieldName] = parsedValue;
      }
    }
  }
  return { isValid, fieldErrorMessages, data };
};

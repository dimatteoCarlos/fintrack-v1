import { capitalize, currencyMinorUnit } from '../../helpers/functions';

export function validationData<T extends Record<string, unknown>>(
  stateToValidate: T,
  options?: {
    nonZeroFields?: string[];
    optionalFields?: string[];
  },
): Record<keyof T, string> {
  const errorValidationMessages: Partial<Record<keyof T, string>> = {};

  const nonZeroFields = options?.nonZeroFields || [];

  for (const key in stateToValidate) {
   const value = stateToValidate[key];

   // Whitespace-only strings count as empty.
   const isEmpty = value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '');

   if (isEmpty) {
     errorValidationMessages[key] = `* Please provide the ${capitalize(key)}`;
     continue;
   }

   // Zero passes unless the field is in nonZeroFields; new-account creation relies on it.
    if (typeof value === 'number') {
      if (nonZeroFields.includes(key) && value === 0) {
        errorValidationMessages[key] =
          `* ${capitalize(key)} must be greater than zero`;
      } else if (value < 0) {
        errorValidationMessages[key] = `* ${capitalize(key)} must be positive`;
      }
      continue;
    }
  }
  return errorValidationMessages as Record<keyof T, string>;
}
// Validates the amount field specifically; unlike validationData, zero is rejected.
export function validateAmount(value: string, currency?: string): string | null {
  if (value === '' || value === undefined) return 'Amount is required';

  // A currency rounds the amount to its own decimals, so a yen 0,4 reads as zero
  // and is refused here rather than on the server.
  const result = checkNumberFormatValue(value, currency);

  if (result.isError) {
    return `* ${result.formatMessage}`;
  }

  const numValue = result.valueToSave;

  if (numValue === undefined || isNaN(numValue)) {
    return '* Please enter a valid number';
  }

  if (numValue <= 0) {
    return '* Amount must be greater than zero';
  }
  return null;
}

function validateNumber(value: number, fieldName: string): string | null {
  if (value <= 0) return `* ${capitalize(fieldName)} must be greater than zero`;
  return null;
}
export function validateField(
  name: string,
  value: string | number | null | undefined,
) {
  if (value === '' || value == null) {
    return `* Please provide the ${capitalize(name)}`;
  }
  if (name === 'amount') return validateAmount(String(value));
  if (typeof value === 'number') {
    return validateNumber(value, name);
  }
  return null;
}
// With a currency, valueToSave takes that currency's decimals (the yen has none,
// so 1500,75 JPY is saved as 1501); without one the parsed value is returned as is.
export function checkNumberFormatValue(
  value: string,
  currency?: string,
): {
  formatMessage: string;
  valueNumber: string | undefined;
  valueToSave: number | undefined;
  isError: boolean;
} {
  const result = parseNumberFormatValue(value);

  if (!currency || result.valueToSave === undefined) return result;

  const digits = currencyMinorUnit(currency);
  return {
    ...result,
    valueToSave: Number(result.valueToSave.toFixed(digits)),
  };
}

// The raw format parser; checkNumberFormatValue wraps it with currency rounding.
function parseNumberFormatValue(value: string): {
  formatMessage: string;
  valueNumber: string | undefined;
  valueToSave: number | undefined;
  isError: boolean;
} {
  const notMatching = /([^0-9.,])/g; // any invalid character
  const onlyDotDecimalSep = /^\d*(\.\d*)?$/; // US: dot decimal, no thousands separator
  const onlyCommaDecimalSep = /^\d*(,\d*)$/; // ES: comma decimal, no thousands separator
  const commaSepFormat = /^(\d{1,3})(,\d{3})*(\.\d*)?$/; // US: comma thousands, dot decimal
  const dotSepFormat = /^(\d{1,3})(\.\d{3})*(,\d*)?$/; // dot thousands, comma decimal

  // valueToSave is the number used to update the numeric state value.
  if (notMatching.test(value)) {
    const matches = value.match(notMatching);
    const invalidCharacters = [...new Set(matches)]
      .slice(0, 4)
      .join(',')
      .replace(' ', 'blank');

    return {
      formatMessage: `not valid number: ${invalidCharacters}`,
      isError: true,
      valueNumber: value.toString(),
      valueToSave: undefined,
    };
  }
  if (onlyDotDecimalSep.test(value)) {
    const valueNumber = !isNaN(parseFloat(value))
      ? parseFloat(value)
      : undefined;

    return {
      formatMessage: 'decimal point format',

      valueNumber: valueNumber?.toString(),
      valueToSave: valueNumber,
      isError: false,
    };
  }

  if (onlyCommaDecimalSep.test(value)) {
    const valueNumber = !isNaN(parseFloat(value.replace(',', '.')))
      ? parseFloat(value.replace(',', '.'))
      : 0;

    return {
      formatMessage: 'comma as decimal-sep.',
      valueNumber: valueNumber.toString(),
      valueToSave: valueNumber,
      isError: false,
    };
  }

  if (commaSepFormat.test(value)) {
    const valueNumber = !isNaN(parseFloat(value.replace(/,/g, '')))
      ? parseFloat(value.replace(/,/g, ''))
      : 0;

    return {
      formatMessage: 'comma as th-sep, point decimal',
      valueToSave: valueNumber,
      valueNumber: value.toString(),
      isError: false,
    };
  }

  if (dotSepFormat.test(value)) {
    const valueNumber = !isNaN(
      parseFloat(value.replace(/\./g, '').replace(',', '.')),
    )
      ? parseFloat(
          parseFloat(value.replace(/\./g, '').replace(',', '.')).toFixed(2),
        )
      : 0;
    return {
      formatMessage: 'dot as th-sep, comma as decimal',
      valueToSave: valueNumber,
      valueNumber: value.toString(),
      isError: false,
    };
  }
  return {
    formatMessage: `format number not valid`,
    isError: true,
    valueNumber: '',
    valueToSave: undefined,
  };
}

import React, { useCallback } from 'react';
import { checkNumberFormatValue } from '../validations/utils/custom_validation';
import { refusesDecimalSeparator } from '../helpers/amountInCurrency';

// Updates the numeric state and the validation messages of an amount input.
function useInputNumberHandler<T>(
  setFormData: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>,
  setValidationMessages: React.Dispatch<
    React.SetStateAction<{
      [key: string]: string;
    }>
  >,
  setStateData: React.Dispatch<React.SetStateAction<T>>,
  setIsAmountError?: React.Dispatch<React.SetStateAction<boolean>>,
  setMessageToUser?: React.Dispatch<
    React.SetStateAction<string | null | undefined>
  >,
  // The currency the amount is typed in. The saved number takes its decimals:
  // none for the yen.
  currency?: string,
) {
  const inputNumberHandlerFn = useCallback(
    (name: string, value: string) => {
      // Stripping the separator instead would merge the digits on either side.
      if (currency !== undefined && refusesDecimalSeparator(value, currency)) {
        return;
      }

      const { formatMessage, isError, valueToSave, valueNumber } =
        checkNumberFormatValue(value, currency);
      // The form keeps the typed string as displayed.
      setFormData((formData) => ({
        ...formData,
        [name]: value,
      }));

      setValidationMessages((prev) => ({
        ...prev,
        [name]: !isError
          ? ` Format: ${formatMessage}`
          : ` * Error: ${formatMessage}`,
      }));

      if (
        (isError || valueToSave === 0) &&
        setIsAmountError &&
        setMessageToUser
      ) {
        setIsAmountError(true);
        setMessageToUser('Please enter a valid Amount');
        return;
      }

      if (setIsAmountError && setMessageToUser) {
        setIsAmountError(false);
        setMessageToUser('');
      }

      setStateData((prev) => ({
        ...prev,
        [name]: valueToSave,
      }));

      return { formatMessage, isError, valueToSave, valueNumber };
    },
    [
      setFormData,
      setValidationMessages,
      setStateData,
      setIsAmountError,
      setMessageToUser,
      currency,
    ],
  );

  return { inputNumberHandlerFn };
}

export default useInputNumberHandler;

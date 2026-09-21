import { useState, useCallback } from 'react';
import { useDebouncedCallback } from './useDebouncedCallback';
import type { ZodType } from 'zod';
import { validateForm } from '../validations/utils/zod_validation';
import type { DropdownOptionType, CurrencyType } from '../types/types';
import { ValidationMessagesType } from '../validations/types';
const useFormManager = <
  TInput extends Record<string, unknown>,
  TValidated extends Record<string, unknown>,
>(
  schema: ZodType<TValidated>,
  initialData: TInput,
) => {
  const [formData, setFormData] = useState<TInput>(initialData);

  const [validationMessages, setValidationMessages] = useState<
    ValidationMessagesType<TInput>
  >({});

  const [showValidation, setShowValidation] = useState<
    Record<keyof TInput, boolean>
  >(
    Object.fromEntries(
      Object.keys(initialData).map((key) => [key, false]),
    ) as Record<keyof TInput, boolean>,
  );
  const activateAllValidations = useCallback(() => {
    setShowValidation(
      Object.fromEntries(
        Object.keys(initialData).map((key) => [key, true]),
      ) as Record<keyof TInput, boolean>,
    );
  }, [initialData]);
  const updateField = useCallback(
    <TKey extends keyof TInput>(fieldName: TKey, value: TInput[TKey]) => {
      setFormData((prev) => ({ ...prev, [fieldName]: value }));
    },
    [],
  );

  const validateField = useCallback(
    <TKey extends keyof TInput>(fieldName: TKey, value: TInput[TKey]) => {
      const currentDataForValidation = {
        ...formData,
        [fieldName]: value,
      };
      const { errors: fieldErrors } = validateForm(
        schema,
        currentDataForValidation,
      );
      setValidationMessages((prev) => ({
        ...prev,
        [fieldName]: fieldErrors[fieldName as string] || '',
      }));
    },
    [formData, schema],
  );
  const debouncedUpdateField = useDebouncedCallback(updateField, 500);

  const debouncedValidateField = useDebouncedCallback(validateField, 800);
  // For amount-like fields: typing a value turns on validation display for every field.
  const createNumberHandler = useCallback(
    (fieldName: keyof TInput) => {
      return (
        evt: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        const { value } = evt.target;
        updateField(fieldName as keyof TInput, value as TInput[keyof TInput]);
        debouncedValidateField(fieldName, value);

        if (value) {
          setShowValidation((prev) => ({
            ...prev,
            ...Object.fromEntries(Object.keys(prev).map((key) => [key, true])),
          }));
        }
      };
    },
    [updateField, debouncedValidateField, setShowValidation],
  );
  const updateCurrency = useCallback(
    (currency: CurrencyType) => {
      updateField('currency' as keyof TInput, currency as TInput['currency']);
      validateField('currency' as keyof TInput, currency as TInput['currency']);
    },
    [updateField, validateField],
  );
  const resetForm = useCallback(() => {
    setFormData(initialData);
    setValidationMessages({});
    setShowValidation(
      Object.fromEntries(
        Object.keys(initialData).map((key) => [key, false]),
      ) as Record<keyof TInput, boolean>,
    );
  }, [initialData]);

  const createDropdownHandler = useCallback(
    (fieldName: keyof TInput) => {
      return (selectedOption: DropdownOptionType | null) => {
        const value = selectedOption?.value ?? '';
        updateField(fieldName, value as TInput[typeof fieldName]);

        // Validate only non-empty values, so no error appears right after a reset.
        if (value) {
          validateField(fieldName, value as TInput[typeof fieldName]);
        } else {
          setValidationMessages((prev) => ({ ...prev, [fieldName]: '' }));
        }
      };
    },
    [updateField, validateField],
  );
  const createInputHandler = useCallback(
    (fieldName: keyof TInput) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        updateField(fieldName, value as TInput[typeof fieldName]);
        // Validate only non-empty values, so no error appears right after a reset.
        if (value) {
          validateField(fieldName, value as TInput[typeof fieldName]);
        } else {
          setValidationMessages((prev) => ({ ...prev, [fieldName]: '' }));
        }
      };
    },
    [updateField, validateField],
  );

  const createTextareaHandler = useCallback(
    (fieldName: keyof TInput) => {
      return (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        updateField(fieldName, value as TInput[typeof fieldName]);
        debouncedValidateField(fieldName, value as TInput[typeof fieldName]);
      };
    },
    [updateField, debouncedValidateField],
  );

  const validateAll = useCallback(() => {
    const { errors: fieldErrors, data: dataValidated } = validateForm(
      schema,
      formData,
    );
    return { fieldErrors, dataValidated };
  }, [formData, schema]);
  const handleApiError = useCallback((error: unknown) => {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred during submission.';
    return errorMessage;
  }, []);
  return {
    formData,
    showValidation,
    validationMessages,
    resetForm,
    activateAllValidations,
    handlers: {
      updateField,
      debouncedUpdateField,
      validateField,
      debouncedValidateField,
      createNumberHandler,
      createDropdownHandler,
      createInputHandler,
      createTextareaHandler,
      updateCurrency,
      handleApiError,
    },
    validateAll,
    setters: {
      setValidationMessages,
      setShowValidation,
      setFormData,
    },
  };
};

export default useFormManager;

import { useState, useCallback } from 'react';

import { useDebouncedCallback } from './useDebouncedCallback.ts';
import type { DropdownOptionType } from '../types/types.ts';
import { ValidationMessagesType } from '../validations/types.ts';
import {
  PnLValidationSchema,
  validateAllFn,
} from '../validations/validationPnL/validationPnL.ts';


export const useFormManagerPnL = <
  FormInputType extends Record<string, unknown>,
  FormValidatedType extends 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Record<string, any>,
>(
  initialData: FormInputType,
  initialValidatedData: FormValidatedType,
) => {
  type FormFieldKeyType = keyof FormInputType & string;

  type ShowValidationType = Record<FormFieldKeyType & string, boolean>;

  const [formInputData, setFormInputData] =
    useState<FormInputType>(initialData);

  const [formValidatedData, setFormValidatedData] = useState<FormValidatedType>(
    initialValidatedData as FormValidatedType,
  );

  const [validationMessages, setValidationMessages] = useState<
    ValidationMessagesType<FormInputType>
  >({});

  const [showValidation, setShowValidation] = useState<ShowValidationType>(
    Object.fromEntries(
      (Object.keys(initialData) as Array<FormFieldKeyType>).map((key) => [
        key,
        false,
      ]),
    ) as Record<FormFieldKeyType, boolean>,
  );
  const activateAllValidations = useCallback(
    (isActive: boolean) => {
      setShowValidation(
        Object.fromEntries(
          Object.keys(initialData).map((key) => [key, isActive]),
        ) as Record<FormFieldKeyType, boolean>,
      );
    },
    [initialData],
  );
  const createInputNumberHandler = (fieldName: keyof FormInputType) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setFormInputData((prev) => ({ ...prev, [fieldName]: value }));

      const { isValid, message, parsedValue } =
        PnLValidationSchema[
          fieldName as keyof typeof PnLValidationSchema
        ].validate(value);

      setValidationMessages((prev) => ({ ...prev, [fieldName]: message }));

      if (isValid) {
        setFormValidatedData((prev) => ({
          ...prev,
          [fieldName as keyof FormValidatedType]: parsedValue,
        }));
      } else {
        setFormValidatedData((prev) => {
          const update = { ...prev };
          delete update[fieldName as keyof FormValidatedType];
          return update;
        });
      }
    };
  };

  const createDropdownHandler = useCallback((fieldName: FormFieldKeyType) => {
    return (selectedOption: DropdownOptionType | null) => {
      const value = selectedOption?.value || '';
      setFormInputData((prev) => ({ ...prev, [fieldName]: value }));

      const { isValid, message, parsedValue } =
        PnLValidationSchema[
          fieldName as keyof typeof PnLValidationSchema
        ].validate(value);

      setValidationMessages((prev) => ({
        ...prev,
        [fieldName]: message || '',
      }));

      if (isValid) {
        setFormValidatedData((prev) => ({
          ...prev,
          [fieldName as keyof FormValidatedType]: parsedValue,
        }));
      } else {
        setFormValidatedData((prev) => {
          const update = { ...prev };
          delete update[fieldName as keyof FormValidatedType];
          return update;
        });
      }
    };
  }, []);

  const debouncedTextAreaValidation = useDebouncedCallback(
    (fieldName: FormFieldKeyType, value: string) => {
      const { isValid, message, parsedValue } =
        PnLValidationSchema[
          fieldName as keyof typeof PnLValidationSchema
        ].validate(value);

      setValidationMessages((prev) => ({
        ...prev,
        [fieldName]: message || '',
      }));

      if (isValid) {
        setFormValidatedData((prev) => ({ ...prev, [fieldName]: parsedValue }));

        setShowValidation((prev) => ({ ...prev, [fieldName]: false }));
      } else {
        setFormValidatedData((prev) => {
          const update = { ...prev };
          delete update[fieldName];
          return update;
        });
      }
    },
    500,
  );

  const createTextareaHandler = useCallback(
    (fieldName: FormFieldKeyType) => {
      return (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { value } = e.target;

        setFormInputData((prev) => ({ ...prev, [fieldName]: value }));

        setShowValidation((prev) => ({ ...prev, [fieldName]: true }));

        debouncedTextAreaValidation(fieldName, value);
      };
    },
    [debouncedTextAreaValidation],
  );

  const createFieldHandler = useCallback(<V>(fieldName: FormFieldKeyType) => {
    return (value: V) => {
      setFormInputData((prev) => ({ ...prev, [fieldName]: value }));

      setFormValidatedData((prev) => ({ ...prev, [fieldName]: value }));
    };
  }, []);
  const createFieldValidationHandler = useCallback(
    <V extends string>(fieldName: FormFieldKeyType) => {
      return (value: V) => {
        setFormInputData((prev) => ({ ...prev, [fieldName]: value }));

        setShowValidation((prev) => ({ ...prev, [fieldName]: true }));

        const { isValid, message, parsedValue } =
          PnLValidationSchema[
            fieldName as keyof typeof PnLValidationSchema
          ].validate(value);

        setValidationMessages((prev) => ({
          ...prev,
          [fieldName]: message || '',
        }));

        if (isValid) {
          setFormValidatedData((prev) => ({
            ...prev,
            [fieldName]: parsedValue,
          }));
          setShowValidation((prev) => ({ ...prev, [fieldName]: false }));
        } else {
          setFormValidatedData((prev) => {
            const update = { ...prev };
            delete update[fieldName];
            return update;
          });
        }
      };
    },
    [],
  );
  const validateAllPnL = useCallback(() => {
    const result = validateAllFn(formInputData, PnLValidationSchema);
    if (!result) {
      return { isValid: false, messages: {}, validatedData: null };
    }
    const { isValid, fieldErrorMessages, data } = result;

    // Reveal every field's validation message on submit.
    activateAllValidations(true);

    return {
      isValid,
      messages: fieldErrorMessages,
      validatedData: isValid ? (data as FormValidatedType) : null,
    };
  }, [formInputData, activateAllValidations]);

  const resetForm = useCallback(() => {
    setFormInputData(initialData);
    setFormValidatedData(initialValidatedData as FormValidatedType);
    setValidationMessages({});
    activateAllValidations(false);
  }, [initialData, initialValidatedData, activateAllValidations]);

  return {
    formInputData,
    formValidatedData,
    validationMessages,
    showValidation,
    activateAllValidations,
    resetForm,

    createInputNumberHandler,
    createDropdownHandler,
    createTextareaHandler,
    createFieldHandler,
    createFieldValidationHandler,
    validateAllPnL,

    setFormInputData,
    setFormValidatedData,
    setValidationMessages,
    setShowValidation,
  };
};

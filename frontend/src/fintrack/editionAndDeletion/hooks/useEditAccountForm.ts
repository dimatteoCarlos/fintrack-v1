import { useState, useCallback } from 'react';
import { ZodType } from 'zod';
import { validateForm } from '../../validations/utils/zod_validation';
import { ValidationMessagesType } from '../../validations/types';

export type GenericEditFormData = {
  [key: string]: string | number | boolean | Date | null | undefined;
};

export const useEditAccountForm = (
  schema: ZodType<GenericEditFormData> | null,
) => {
  const [formData, setFormData] = useState<GenericEditFormData>({});
  const [validationMessages, setValidationMessages] = useState<
    ValidationMessagesType<GenericEditFormData>
  >({});

  // Validates one field against the current form data with the changed value merged in.
  const runFieldValidation = useCallback(
    (fieldName: string, value: unknown, currentData: GenericEditFormData) => {
      if (!schema) return;

      const { errors } = validateForm(schema, {
        ...currentData,
        [fieldName]: value,
      });

      setValidationMessages((prev) => {
        const key = fieldName as keyof GenericEditFormData;
        if (errors[fieldName]) {
          return { ...prev, [fieldName]: errors[fieldName] };
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _, ...rest } = prev;
          return rest as ValidationMessagesType<GenericEditFormData>;
        }
      });
    },
    [schema],
  );

  return {
    formData,
    setFormData,
    validationMessages,
    setValidationMessages,
    runFieldValidation,
  };
};

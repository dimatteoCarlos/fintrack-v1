// Generic form hook (state, real-time validation, submit) on top of useFieldValidation.

import { useCallback, useState } from 'react';
import { z } from 'zod';
import useFieldValidation from '../validation/hook/useFieldValidation';

export type FormErrorsType<TFieldName extends string> = 
  Partial<Record<TFieldName, string>>

export type FormLogicResult<TFormShape> = {
  isValid: boolean;
  validatedData?: TFormShape;
  errors: FormErrorsType<keyof TFormShape & string>;
};
// Field errors plus an optional form-level error
export type FormErrorsWithFormType<TFieldName extends string> = 
  FormErrorsType<TFieldName> & { form?: string };

type UseFormLogicParams<TFormShape extends Record<string, unknown>> = {
  schema: z.ZodType<TFormShape>;

  initialValues: TFormShape;

  onSubmit: (data: TFormShape) => Promise<void>;

  validateOnlyTouched?: boolean;
};

export const useFormLogic = <TFormShape extends Record<string, unknown>>({
  schema,
  initialValues,
  onSubmit,
  validateOnlyTouched = true,
}: UseFormLogicParams<TFormShape>) => {

  type FieldNames = keyof TFormShape & string;

  const [formData, setFormData] = useState<TFormShape>(initialValues);

  const [touchedFields, setTouchedFields] = useState<Set<FieldNames>>(new Set());
  const [dirtyFields, setDirtyFields] = useState<Set<FieldNames>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { validateField, validateAll } = useFieldValidation<TFormShape>(schema, {
    validateOnlyTouched,
  });

  const [validationErrors, setValidationErrors] = useState<FormErrorsType<FieldNames>>({});

  const handleChange = useCallback(
 (fieldName: FieldNames) => (value: string) => {

   setFormData((prev) => {
     const updated = { ...prev, [fieldName]: value };

 setTouchedFields((touchedFields)=>new Set(touchedFields));

    if (prev[fieldName] !== value) {
      setDirtyFields((prevDirty) => new Set(prevDirty).add(fieldName));
     }

    const result = validateField(fieldName, value, updated);

    setValidationErrors((prevErrors)=>  {
       const next = { ...prevErrors };

       if (result.isValid) {
         delete next[fieldName];
       } else {
         next[fieldName] = result.error ?? 'Invalid value';
       }

  // Re-validate confirmPassword when password changes
    if (fieldName === 'password' && 'confirmPassword' in updated) {

      const confirmValue = updated['confirmPassword'];

      if (typeof confirmValue === 'string') {

        const confirmResult = validateField(
          'confirmPassword' as FieldNames,
          confirmValue,
          updated
        );

        if (confirmResult.isValid) {
          delete next['confirmPassword' as FieldNames];
        } else {
          next['confirmPassword' as FieldNames] =
            confirmResult.error ?? 'Invalid value';
        }
      }
    }
       return next 
      });
   return updated;
  });
 },
 [validateField]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const allFields = Object.keys(formData) as FieldNames[];

      const touchedSet = new Set(allFields)

      setTouchedFields(touchedSet);

      const result = validateAll(formData, touchedSet);

      if (!result.isValid) {
        setValidationErrors(result.errors as FormErrorsType<FieldNames>);
        return;
      }

      setIsSubmitting(true);

      try {
        await onSubmit(result.validatedData!);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onSubmit, validateAll]
  );

  const resetForm = useCallback(() => {
    setFormData(initialValues);
    setTouchedFields(new Set());
    setDirtyFields(new Set());
    setValidationErrors({});
  }, [initialValues]);

  const isSubmittingAllowed = useCallback(() => {
    const hasErrors = Object.keys(validationErrors).length > 0;

    return !hasErrors && !isSubmitting;
  }, [validationErrors, isSubmitting]);

  return {
    formData,

    handleChange,
    handleSubmit,
    resetForm,

    validationErrors,

    touchedFields,
    dirtyFields,

    isSubmitting,
    isSubmittingAllowed: isSubmittingAllowed(),
  };
};
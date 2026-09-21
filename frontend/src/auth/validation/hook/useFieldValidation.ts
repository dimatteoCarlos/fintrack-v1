// Schema-level validation only: authentication errors (e.g. an incorrect
// password) must be handled separately from the backend response.

import { z } from 'zod';
import { useCallback } from 'react';
import {
  FieldValidationResultType,
  FormValidationResultType,
  ValidationOptionsType
} from '../types/validationTypes';

 /**
 * Validates form data against a full Zod schema, the same one the backend uses.
 * A single field is validated by running the whole schema on partial data and
 * keeping only the issues whose path matches that field.
 */
export const useFieldValidation = <TFormShape extends Record<string, unknown>>(
  schema: z.ZodType<TFormShape> ,
  options: ValidationOptionsType = {}
) => {

/**
* Validates one field by running the full schema and keeping only that field's
* issues. validatedData is always the original value.
*/
  const validateField = useCallback(<TFieldName extends keyof TFormShape, TFieldValue>(
    fieldName: TFieldName,
    fieldValue: TFieldValue,
    formData: Partial<TFormShape> = {}
  ): FieldValidationResultType<TFieldValue> => {

    const dataToValidate: Partial<TFormShape> = {
      ...formData,
      [fieldName]: fieldValue
    };

    const result = schema.safeParse(dataToValidate);

    if (result.success) {
      return {
        isValid: true,
        validatedData: fieldValue
      };
    }

   const fieldIssues = result.error.issues.filter(issue =>
    issue.path.length > 0 && issue.path[0] === fieldName
   );

// Other fields may be invalid; this one is fine.
   if (fieldIssues.length === 0) {
      return {
        isValid: true,
        validatedData: fieldValue
      };
    }

   return {
    isValid: false,
    validatedData: fieldValue,
    error: fieldIssues[0].message  // first message only
    };

  }, [schema]);

/**
 * Validates the whole form against the full schema, mainly on submit. With
 * validateOnlyTouched, only touchedFields are validated and reported.
 */
 const validateAll = useCallback(
  (
   formData: Partial<TFormShape>,
   touchedFields?: Set<keyof TFormShape>
   ): FormValidationResultType<TFormShape> => {
  let dataToValidate: Partial<TFormShape> = formData;

  if (options.validateOnlyTouched && touchedFields?.size) {
   dataToValidate = {} as Partial<TFormShape>;
   touchedFields.forEach(field => {
    if (field in formData) {
      dataToValidate[field] = formData[field];
     }
    });
   }

 const result = schema.safeParse(dataToValidate);

 if (result.success) {
  return {
   isValid: true,
   errors: {},
   validatedData: result.data,
   formError: undefined
  };
 }

 const errors: Partial<Record<keyof TFormShape, string>> = {};

 let formError: string | undefined;

 result.error.issues.forEach(issue => {
  const field = issue.path[0] as keyof TFormShape | undefined;

 if (!field) {
  formError = issue.message;
  return;
 }

 if (options.validateOnlyTouched && touchedFields && !touchedFields.has(field)) {
  return;
 }

// First error per field only.
 if (!errors[field]) {
   errors[field] = issue.message;
  }
 });

 return {
  isValid: false,
  errors,
  validatedData: undefined,
  formError
    };
  },[schema, options ]
 );

 return {
  schema,
 validateField,
 validateAll
 };
};

export default useFieldValidation;
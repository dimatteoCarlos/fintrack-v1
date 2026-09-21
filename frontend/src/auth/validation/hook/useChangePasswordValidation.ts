import { useCallback } from 'react';
import { z } from 'zod';
import useFieldValidation from './useFieldValidation';
import { extractErrorMessage } from '../../auth_utils/extractErrorMessge';

export type FormErrorsType<TFieldName extends string> =
  Partial<Record<TFieldName, string>> & { form?: string };

// TSchema must be a ZodType that infers Record<string, unknown>.
type ChangePasswordValidationParams<
  TSchema extends z.ZodType<Record<string, unknown>>
> = {
  fieldMapping: Record<string, string>;
  schema: TSchema;
};

/**
 * Adapts the generic field validation to the change-password form: maps backend
 * field names to form fields and turns backend API errors into form errors.
 */

export const useChangePasswordValidation = <
  TSchema extends z.ZodType<Record<string, unknown>>
>({
  fieldMapping,
  schema,
}: ChangePasswordValidationParams<TSchema>) => {
  
  type FormShape = z.infer<TSchema>;
  type FieldNames = keyof FormShape & string;

  const { validateField: baseValidateField, validateAll: baseValidateAll } = 
    useFieldValidation<FormShape>(
      schema as unknown as z.ZodType<FormShape>,
      { validateOnlyTouched: true }
    );

/**
   * Validates one field against the full schema. validatedData is the original
   * value; error is set only when isValid is false.
   */
  const validateField = useCallback(
    (fieldName: FieldNames, value: string, formData?: Partial<FormShape>) => {
      const result = baseValidateField(fieldName, value, formData);
      return {
        isValid: result.isValid,
        validatedData: result.validatedData as string,
        error: result.error,
      };
    },
    [baseValidateField]
  );

/**
 * Validates the whole form against the full schema; validatedData is present
 * only on success. touchedFields limits the errors reported (validateOnlyTouched).
 */
  
  const validateAll = useCallback(
    (formData: Partial<FormShape>, touchedFields?: Set<FieldNames>):ValidateAllResultType<FormShape> => {
      const result = baseValidateAll(formData, touchedFields);

      const errors = {} as FormErrorsType<FieldNames>;
      Object.entries(result.errors).forEach(([field, message]) => {
        if (field && message) {
          (errors as Record<FieldNames, string>)[field as FieldNames] = message;
        }
      });
      if (result.formError) {
        errors.form = result.formError;
      }

      return {
        isValid: result.isValid,
        validatedData: result.validatedData,
        errors,
      };
    },
    [baseValidateAll]
  );

/**
* Converts backend fieldErrors (Record<string, string[]>) into FormErrorsType,
* renaming fields through fieldMapping.
*/

// The error shape is cast by hand, so TypeScript does not check it; validating
// it with zod would be safer.

const transformApiErrors = useCallback(
 (apiError: unknown): FormErrorsType<FieldNames> => {
   const transformedErrors = {} as FormErrorsType<FieldNames>;
   
  try {
   if (!apiError) {
     transformedErrors.form = 'No error response from server';
     return transformedErrors;
   }

   const errorObj = apiError as Record<string, unknown>;
   let fieldErrors: Record<string, string[]> | undefined;

// Axios-style error: details.fieldErrors
  if (
    errorObj.details &&
    typeof errorObj.details === 'object' &&
    'fieldErrors' in errorObj.details
  ) {
    fieldErrors = (errorObj.details as Record<string, unknown>)
      .fieldErrors as Record<string, string[]>;
      
// Domain-style error: fieldErrors at the root
  } else if (errorObj.fieldErrors && typeof errorObj.fieldErrors === 'object') {
    fieldErrors = errorObj.fieldErrors as Record<string, string[]>;
  }
  if (fieldErrors) {
   Object.entries(fieldErrors).forEach(([backendField, messages]) => {
    
    const frontendField = fieldMapping[backendField] as FieldNames | undefined;
     
    if (frontendField && messages.length > 0) {
// Only the first message is shown per field.
     (transformedErrors as Record<FieldNames, string>)[frontendField] = messages[0];
     }
   });
 }

  if (!transformedErrors.form && typeof errorObj.message === 'string') {
   transformedErrors.form = 
     (errorObj.error as string) || 
     errorObj.message || 
     extractErrorMessage(apiError);
 }

 } catch (error) {
  console.error('❌ Error transforming API errors:', error);
  transformedErrors.form = 'Failed to process server response';
 }

 return transformedErrors;
 },
 [fieldMapping]
 );

 return {
  validateField,
  validateAll,
  transformApiErrors,
    schema,
  };
};

/** validatedData is always present and is a string for form fields. */
export type ValidateFieldResultType = {
  isValid: boolean;
  validatedData: string;
  error?: string;
};

export type ValidateAllResultType<TFormShape> = {
  isValid: boolean;
  validatedData?: TFormShape;
  errors: FormErrorsType<keyof TFormShape & string>;
};

export type ValidateFieldFnType<TFormShape> = (
  fieldName: keyof TFormShape,
  value: string,
  formData?: Partial<TFormShape>
) => ValidateFieldResultType;

export type ValidateAllFnType<TFormShape> = (
  formData: Partial<TFormShape>,
  touchedFields?: Set<keyof TFormShape>
) => ValidateAllResultType<TFormShape>;

export type TransformApiErrorsFnType<TFieldName extends string> = (
  apiError: unknown
) => FormErrorsType<TFieldName>;

export default useChangePasswordValidation;
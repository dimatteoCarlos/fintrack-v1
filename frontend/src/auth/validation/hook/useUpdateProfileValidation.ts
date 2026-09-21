import { useCallback } from "react";
import { z } from 'zod';
import { extractErrorMessage } from "../../auth_utils/extractErrorMessge.ts";
import useFieldValidation from "./useFieldValidation.ts";

type FormErrorsType<TFieldName extends string> = Partial<
  Record<TFieldName, string>
> & { form?: string };

type ProfileApiErrorType = {
  success: false;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
};

type UseFormValidationParams<TSchema extends z.ZodType<Record<string, unknown>>>  = {
/** Maps backend field names (e.g. 'user_firstname') to form field names (e.g. 'firstname'). */
  fieldMapping: Record<string, string>;
  schema: TSchema;
};

/** Wraps useFieldValidation for the profile form; the form shape is inferred from the schema. */
export const useUpdateProfileValidation = <
  TSchema extends z.ZodType<Record<string, unknown>>
>({
  fieldMapping, schema,}: UseFormValidationParams<TSchema>) => {
type FormShape = z.infer<TSchema>;
type FieldNames = keyof FormShape & string;

  const genericValidation = useFieldValidation(
    schema,
    { validateOnlyTouched: true }
  );

  /**
   * Maps a profile-update API error to form errors, renaming backend field names
   * (user_firstname) to form names (firstname) through fieldMapping.
   */
    const transformProfileApiErrors = useCallback(
    (apiError: unknown): FormErrorsType<FieldNames> => {
      const errors: FormErrorsType<FieldNames> = {};

     try {
      if (!apiError) {
       errors.form = "No error response from server";
       return errors;
     }

     const errorObj = apiError as Record<string, unknown>;

      // A rate-limit message takes priority over field errors.
       if ("retryAfter" in errorObj && errorObj.retryAfter) {
         const retry = Number(errorObj.retryAfter);
         if (!isNaN(retry) && retry > 0) {
          errors.form =
           typeof errorObj.message === "string"
            ? errorObj.message
            : "Too many updates. Please wait.";
           return errors;
         }
       }

       if (errorObj.fieldErrors && typeof errorObj.fieldErrors === "object") {
          const fieldErrors = errorObj.fieldErrors as Record<string, string[]>;

         Object.entries(fieldErrors).forEach(([backendField, messages]) => {
           const frontendField = fieldMapping[backendField] as FieldNames | undefined;

           if (frontendField && Array.isArray(messages) && messages.length > 0) {
          // Only the first message is shown per field.
          (errors as Record<FieldNames, string>)[frontendField] = messages[0];
            }
          });
        } 

         if (!errors.form) {
          const globalMessage =
            (errorObj.error as string) ||
            (errorObj.message as string) ||
            extractErrorMessage(apiError);
          if (globalMessage) errors.form = globalMessage;
        }
      } catch (e) {
        console.error("❌ Error transforming profile API errors:", e);
        errors.form = "Failed to process server response";
      }

      return errors;
    }, [fieldMapping]
  );        
 /** Validates one field; formData supplies the other fields for cross-field rules. */
  const validateProfileField = useCallback(
    (
      fieldName: FieldNames,
      value: unknown,
      formData?: Partial<FormShape>
    ) => genericValidation.validateField(fieldName, value, formData),
    [genericValidation]
  );

  const validateProfileForm = useCallback(
    (formData: Partial<FormShape>,
      touchedFields?: Set<FieldNames>) =>
      genericValidation.validateAll(formData, touchedFields),
    [genericValidation]
  );

  return {
    validateField: validateProfileField,
    validateAll: validateProfileForm,

    transformApiErrors: transformProfileApiErrors,

    schema: genericValidation.schema,
  };
};

export type {
  FormErrorsType,
  ProfileApiErrorType,
};

export default useUpdateProfileValidation;
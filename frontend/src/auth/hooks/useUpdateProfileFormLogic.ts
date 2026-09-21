// Profile form logic (change, submit, error handling), used by UpdateProfileContainer.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  NormalizedProfileUpdateResultType,
  UpdateProfileFormDataType,
} from '../types/authTypes.ts';
import { CurrencyType } from '../../fintrack/types/types.ts';

/** Per-field errors plus an optional form-level error (`form`). */
type ProfileFormErrorsType = {
  [key: string]: string | undefined;
  form?: string;
};

/** Validation functions injected into the hook so it can be tested in isolation. */
type ProfileValidationHookType = {
  /** `formData` is the whole form, for cross-field rules. */
  validateField: (
    fieldName: keyof UpdateProfileFormDataType,
    value: unknown,
    formData?: Partial<UpdateProfileFormDataType>,
  ) => { isValid: boolean; error?: string };

  validateAll: (formData: Partial<UpdateProfileFormDataType>) => {
    isValid: boolean;
    errors: Partial<Record<keyof UpdateProfileFormDataType, string>>;
  };

  /** Maps backend field names to form field names (e.g. 'user_firstname' -> 'firstname'). */
  transformApiErrors: (apiError: unknown) => ProfileFormErrorsType;
};

type UpdateProfileApiFunctionType = (
  payload: Record<string, unknown>,
) => Promise<NormalizedProfileUpdateResultType>;
type TransformationUtilitiesType = {
  /** Maps form field names to the API's and cleans up null/undefined. */
  formToApi: (
    formData: Partial<UpdateProfileFormDataType>,
  ) => Record<string, unknown>;

  /** Returns only the fields that differ from the original, so the API gets a minimal payload. */
  getChangedFields: (
    currentData: UpdateProfileFormDataType,
    originalData: UpdateProfileFormDataType,
  ) => Partial<UpdateProfileFormDataType>;
};
/** All dependencies are injected so the hook stays pure and testable. */
type UseUpdateProfileFormLogicParamsType = {
  /** When this changes, the form resets to it. */
  initialData: UpdateProfileFormDataType;

  updateProfileApi: UpdateProfileApiFunctionType;

  validation: ProfileValidationHookType;

  transformations: TransformationUtilitiesType;
};

type UseUpdateProfileFormLogicReturnType = {
  formData: UpdateProfileFormDataType;

  errors: ProfileFormErrorsType;

  /** Fields the user has interacted with; errors show only for these. */
  touchedFields: Record<string, boolean>;

  /** Local flag; ideally owned by the parent container, kept for API compatibility. */
  isLoading: boolean;

  /** True when formData differs from initialData. */
  isDirty: boolean;

  /** Kept for API compatibility; the parent container should own messages. */
  successMessage: string | null;

  /** Kept for API compatibility; errors should map to field errors instead. */
  apiError: string | null;

  handleChange: (
    fieldName: keyof UpdateProfileFormDataType,
    value: string | null | CurrencyType,
  ) => void;

  handleSubmit: (e: React.FormEvent) => Promise<{
    success: boolean;
    errors?: ProfileFormErrorsType;
    hasChanges?: boolean;
  }>;

  clearError: () => void;

  resetForm: () => void;

  markAllFieldsTouched: () => void;
};

/**
 * Business logic for the profile form. Pure: every dependency is injected, and it
 * knows nothing of React context, Zustand or the API implementation.
 */
const useUpdateProfileFormLogic = ({
  initialData,
  updateProfileApi,
  validation,
  transformations,
}: UseUpdateProfileFormLogicParamsType): UseUpdateProfileFormLogicReturnType => {
  const [formData, setFormData] =
    useState<UpdateProfileFormDataType>(initialData);

  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>(
    {},
  );

  const [errors, setErrors] = useState<ProfileFormErrorsType>({});

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);

  // Resets the form whenever initialData changes (e.g. the store updates after a
  // successful save), which also clears isDirty.
  useEffect(() => {
    setFormData(initialData);
    setErrors({});
    setTouchedFields({});
    setApiError(null);
    setSuccessMessage(null);
  }, [initialData]);

  // Reads initialData directly, so it never goes stale when initialData changes.
  const isDirty = useMemo(() => {
    const fieldNames = Object.keys(formData) as Array<
      keyof UpdateProfileFormDataType
    >;

    // null, undefined and '' all count as empty: a raw comparison would flag a
    // change (e.g. contact null vs '') where none exists.
    const changed = fieldNames.some(
      (key) => String(formData[key] ?? '') !== String(initialData[key] ?? ''),
    );
    if (import.meta.env.VITE_ENVIRONMENT === 'developmentX') {
    }
    return changed;
  }, [formData, initialData]);

  const markAllFieldsTouched = useCallback(() => {
    const fieldNames = Object.keys(formData) as Array<
      keyof UpdateProfileFormDataType
    >;

    const allTouched = fieldNames.reduce(
      (accumulator, fieldName) => {
        accumulator[fieldName] = true;
        return accumulator;
      },
      {} as Record<string, boolean>,
    );
    setTouchedFields(allTouched);
  }, [formData]);

  // Validates against nextFormData (the state after this change), not the current
  // one, so validation is never one keystroke stale.
  const handleChange = useCallback(
    (
      fieldName: keyof UpdateProfileFormDataType,
      value: string | null | CurrencyType,
    ) => {
      setFormData((currentFormData) => {
        const nextFormData = {
          ...currentFormData,
          [fieldName]: value,
        };

        const validationResult = validation.validateField(
          fieldName,
          value,
          nextFormData,
        );

        setErrors((currentErrors) => {
          const updatedErrors = { ...currentErrors };

          if (validationResult.error) {
            updatedErrors[fieldName as string] = validationResult.error;
          } else {
            delete updatedErrors[fieldName as string];
          }
          return updatedErrors;
        });
        return nextFormData;
      });
      setTouchedFields((currentTouched) => ({
        ...currentTouched,
        [fieldName]: true,
      }));

      // Editing dismisses any stale API error or success message.
      if (apiError) {
        setApiError(null);
      }

      if (successMessage) {
        setSuccessMessage(null);
      }
    },
    [validation, apiError, successMessage],
  );

  // Validates the whole form, then sends only the changed fields through the
  // injected API function.
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      setErrors({});
      setApiError(null);
      setSuccessMessage(null);
      setIsLoading(true);

      const validationResult = validation.validateAll(formData);

      if (!validationResult.isValid) {
        setErrors(validationResult.errors as ProfileFormErrorsType);
        markAllFieldsTouched();
        setIsLoading(false);

        return {
          success: false,
          errors: validationResult.errors as ProfileFormErrorsType,
        };
      }

      // Skip the API call when nothing changed.
      if (!isDirty) {
        const noChangesError = {
          form: 'No changes detected.',
        };
        setErrors(noChangesError);
        return {
          success: false,
          errors: noChangesError,
          hasChanges: false,
        };
      }
      try {
        const changedFields = transformations.getChangedFields(
          formData,
          initialData,
        );

        const apiPayload = transformations.formToApi(changedFields);

        const result = await updateProfileApi(apiPayload);

        if (!result.success) {
          // Field errors and the global error are exclusive: setting one clears the other.
          if (
            result.fieldErrors &&
            Object.keys(result.fieldErrors).length > 0
          ) {
            const apiErrors = validation.transformApiErrors(result);
            setErrors(apiErrors);
            setApiError(null);
          }
          else if (result.error) {
            setApiError(result.error);
            setErrors({});
          }
          setIsLoading(false);
          return { success: false };
        }
        setSuccessMessage('Profile updated successfully!');

        setErrors({});
        setApiError(null);
        setTouchedFields({});
        return { success: true };
      } catch (error) {
        console.error('❌ Unexpected error during profile update:', error);
        const unexpectedError = {
          form: 'An unexpected error occurred. Please try again.',
        };
        setErrors(unexpectedError);
        setApiError('Network or server error');
        setIsLoading(false);
        return {
          success: false,
          errors: unexpectedError,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      formData,
      isDirty,
      validation,
      transformations,
      initialData,
      updateProfileApi,
      markAllFieldsTouched,
    ],
  );

  const clearError = useCallback(() => {
    setErrors({});
    setApiError(null);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialData);
    setErrors({});
    setTouchedFields({});
    setSuccessMessage(null);
    setApiError(null);
    setIsLoading(false);
  }, [initialData]);

  return {
    formData,
    errors,
    touchedFields,
    isLoading,
    isDirty,
    successMessage,
    apiError,

    handleChange,
    handleSubmit,

    clearError,
    resetForm,
    markAllFieldsTouched,
  };
};

export type {
  ProfileFormErrorsType,
  UpdateProfileApiFunctionType,
  ProfileValidationHookType,
  TransformationUtilitiesType,
  UseUpdateProfileFormLogicParamsType,
  UseUpdateProfileFormLogicReturnType,
};

export default useUpdateProfileFormLogic;

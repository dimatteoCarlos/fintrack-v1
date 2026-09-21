import { useCallback, useState } from 'react';

import { ChangePasswordFormDataType, ChangePasswordResultType } from '../types/authTypes';

import { FormErrorsType, TransformApiErrorsFnType, ValidateAllFnType, ValidateFieldFnType } from '../validation/hook/useChangePasswordValidation';

type ChangePasswordFormLogicParamsType = {
 formData: ChangePasswordFormDataType;

 setFormData: React.Dispatch<React.SetStateAction<ChangePasswordFormDataType>>;

 validateField: ValidateFieldFnType<ChangePasswordFormDataType>;

 validateAll: ValidateAllFnType<ChangePasswordFormDataType>;

 transformFromApiToFormErrors: TransformApiErrorsFnType<keyof ChangePasswordFormDataType>;

 handleDomainChangePassword: (
   payload: ChangePasswordFormDataType
 ) => Promise<ChangePasswordResultType>;
};

/** Form state and submit flow for the change-password form; business logic only, no UI state. */
export const useChangePasswordFormLogic = ({
  formData,
  setFormData,
  validateField,
  validateAll,
  transformFromApiToFormErrors,
  handleDomainChangePassword
}: ChangePasswordFormLogicParamsType) => {

/** Fields the user has interacted with; errors show only after interaction. */
 const [touchedFields, setTouchedFields] = useState<Partial<Record<keyof ChangePasswordFormDataType, boolean>>>({});

/** Fields modified from their initial value; reserved for future UX. */
 const [dirtyFields, setDirtyFields] = useState<
   Partial<Record<keyof ChangePasswordFormDataType, boolean>>
 >({});

/** Client-side (Zod) errors; an empty object means no errors. */
 const [validationErrors, setValidationErrors] = useState<
 FormErrorsType<keyof ChangePasswordFormDataType>
 >({});

/** Backend errors mapped to form fields; an empty object means no errors. */
 const [apiErrors, setApiErrors] = useState<
  FormErrorsType<keyof ChangePasswordFormDataType>
 >({});

const handleChange = useCallback(
(fieldName: keyof ChangePasswordFormDataType, value: string | null) => {

 setFormData((currentFormData: ChangePasswordFormDataType) => {
 const updatedForm={...currentFormData, [fieldName]: value??'' };

 setTouchedFields((prev) => ({
  ...prev, [fieldName]: true
 }));

 if (currentFormData[fieldName] !== value) {
  setDirtyFields((prev) => ({
   ...prev,  [fieldName]: true }));
 }
 setValidationErrors((prevErrors) => {
  const next = { ...prevErrors };

 const mainResult = validateField(fieldName, value??'',updatedForm);

  if (mainResult.isValid) {
    delete next[fieldName];
   } else {
     next[fieldName] = mainResult.error ?? 'Invalid value';
  }

 // If newPassword changed, also validate confirmPassword
  if (fieldName === 'newPassword') {
    const confirmResult = validateField('confirmPassword', updatedForm.confirmPassword, updatedForm);
    if (confirmResult.isValid) {
      delete next['confirmPassword'];
    } else {
      next['confirmPassword'] = confirmResult.error ?? 'Invalid value';
    }
 }
  return next;
  });

 return updatedForm;
   });
  },
 [validateField, setFormData]
);

/**
 * Marks every field touched, validates client-side, then calls the domain function.
 * Never throws: resolves to the domain result, or void when client validation fails.
 */
  const handleSubmit = async (): Promise<ChangePasswordResultType | void> => {
  setTouchedFields({
    currentPassword: true,
    newPassword: true,
    confirmPassword: true
  });

  setValidationErrors({});
  setApiErrors({});

  const validationResult = validateAll(
    formData,
    new Set(Object.keys(touchedFields) as Array<keyof ChangePasswordFormDataType>)
  );

  if (!validationResult.isValid) {
    setValidationErrors(validationResult.errors);
    return;
  }

 try {
  const result = await handleDomainChangePassword(formData);

 if (!result.success && result.fieldErrors) {
  const mappedErrors =  transformFromApiToFormErrors(result.fieldErrors);
   setApiErrors(mappedErrors);
  }

 return result;

  } catch (error) {
  console.error('❌ Unexpected error in handleSubmit:', error);

 const errorResult: ChangePasswordResultType = {
  success: false,
  error: 'UnexpectedError',
  message: 'An unexpected error occurred. Please try again.'
 };

 return errorResult;
   }
  };

 const resetForm = useCallback(() => {
 setValidationErrors({});
 setApiErrors({});
 setTouchedFields({});
 setDirtyFields({});
}, []);

 return {
  handleChange,
  handleSubmit,
  resetForm,
  validationErrors,
  apiErrors,
  touchedFields,
  dirtyFields,
// Submittable only with no errors and every field touched
 isSubmittingAllowed:
  Object.keys(validationErrors).length === 0 &&
  Object.keys(apiErrors).length === 0 &&
  Object.values(touchedFields).length === Object.values(formData).length
 };
};

export default useChangePasswordFormLogic;
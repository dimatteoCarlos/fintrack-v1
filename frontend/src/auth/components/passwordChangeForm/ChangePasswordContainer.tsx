// Coordinates the change-password form UI, form logic, validation and the auth domain action.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";


import styles from './styles/passwordChangeForm.module.css'

import { ChangePasswordFormDataType,ChangePasswordResultType  } from "../../types/authTypes";

import useAuth from '../../hooks/useAuth';

import useChangePasswordValidation from "../../validation/hook/useChangePasswordValidation";

import { changePasswordSchema } from "../../validation/zod_schemas/userSchemas";

import useChangePasswordFormLogic from "../../hooks/useChangePasswordFormLogic";

import ChangePasswordForm from './ChangePasswordForm';
import useFieldVisibility from "../../hooks/useFieldVisibility";
import { AUTH_ROUTE } from "../../auth_constants/constants";

export type FormStatusType = "idle" | "editing" | "submitting" | "success"| "error" | "rate_limited";
type ChangePasswordContainerProps = {
  onClose?: () => void;
};

const INITIAL_FORM_DATA: ChangePasswordFormDataType ={
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const FIELD_MAPPING: Record<string, keyof ChangePasswordFormDataType> = {
  currentPassword: "currentPassword",
  newPassword: "newPassword",
  confirmPassword: "confirmPassword",
};

export const TOTAL_COUNTDOWN_SECONDS = 6;

/* Owns the password-change UI state and the rate-limit countdown; coordinates
   validation, form logic and the auth domain action. */
const ChangePasswordContainer:React.FC<ChangePasswordContainerProps> = ({ onClose }) => {

const navigateTo=useNavigate()
 const { handleDomainChangePassword} = useAuth();

 const {validateField, validateAll, transformApiErrors} = useChangePasswordValidation({fieldMapping:FIELD_MAPPING, schema: changePasswordSchema,});

 const [formData, setFormData] = useState<ChangePasswordFormDataType>(
  INITIAL_FORM_DATA
 );
const [status, setStatus] = useState<FormStatusType>("idle");

 const [globalMessage, setGlobalMessage] = useState<string | null>(null);

 const [isSubmitting, setIsSubmitting] = useState(false);

 const [countdown, setCountdown] = useState<number | null>(null);

 const [totalCountdown, setTotalCountdown] = useState<number | null>(TOTAL_COUNTDOWN_SECONDS);

 const { visibility, toggleVisibility, resetVisibility } = useFieldVisibility<keyof ChangePasswordFormDataType>(
   Object.keys(formData) as (keyof ChangePasswordFormDataType)[]
);

// Wrapper for domain function to match hook signature
 const domainChangePasswordWrapper = useCallback(
  async (payload: ChangePasswordFormDataType): Promise<ChangePasswordResultType> =>{
  return await handleDomainChangePassword(payload.currentPassword, payload.newPassword, payload.confirmPassword)},
  [handleDomainChangePassword]
 );

 const {
  handleChange,
  handleSubmit:formLogicHandleSubmit,
  validationErrors,
  apiErrors,
  touchedFields,
  dirtyFields,
  isSubmittingAllowed,
  resetForm,
} = useChangePasswordFormLogic({
  formData,
  setFormData,
  validateField,
  validateAll,
  transformFromApiToFormErrors:transformApiErrors,
  handleDomainChangePassword:domainChangePasswordWrapper, 
 });

 const isDirty = Object.values(dirtyFields).some(Boolean);
 const hasErrors = Object.values({...validationErrors, ...apiErrors}).some(error => error && error !== "");
 const isDisabled = !isSubmittingAllowed || 
 isSubmitting ||  !!countdown || 
 !isDirty ||  hasErrors;

const canReset = isDirty && !isSubmitting; 
const showDone = status === "success";
const showCancel = !isSubmitting && status !== "success";

// Curried per field so the form receives one handler per input.
 const onChangeField = useCallback(
  (field: keyof ChangePasswordFormDataType) => (value: string | null) => handleChange(field, value),
  [handleChange]
 );
 const handleReset = useCallback(() => {
  setFormData(INITIAL_FORM_DATA);
  resetForm();
  resetVisibility();
  setGlobalMessage(null);
  setCountdown(null);
  setTotalCountdown(null);
  setStatus("idle");
 }, [resetForm,resetVisibility]);

 const handleClose = useCallback(() => {
  if (isDirty) {
    const confirmClose = window.confirm(
      'You have unsaved changes. Are you sure you want to close?'
    );
    if (!confirmClose) return;
  }
  
  handleReset();
  if (onClose) onClose();
}, [handleReset, onClose, isDirty]);

// Done: cancels the countdown and leaves at once instead of waiting for the auto-logout.
 const handleDone = useCallback(() => {
  setCountdown(null);
  handleReset();

// authEvent is the only signal passed to the auth page.
  navigateTo(AUTH_ROUTE, { replace: true,
   state: { authEvent: 'password_changed' as const }
   });

},[handleReset, navigateTo]);

 const handleSubmitForm = useCallback(async (e:React.FormEvent<HTMLFormElement>) => {
 e.preventDefault();

 setGlobalMessage(null);
 setIsSubmitting(true);
 setStatus("submitting");
 setCountdown(null);
 
 const result = await formLogicHandleSubmit();

  if (!result) {
// Falsy result: client-side validation failed; apiErrors is updated.
  setStatus("error");
  setGlobalMessage("Please fix validation errors");
  setIsSubmitting(false);
  return;
  }

 if (result.success) {
  setStatus("success");
  setGlobalMessage(result.message || "Password changed successfully!");
// Start the auto-logout countdown so the user re-authenticates with the new password.
  console.log("Security: User should re-authenticate with new password");
  setCountdown(TOTAL_COUNTDOWN_SECONDS);
  setTotalCountdown(TOTAL_COUNTDOWN_SECONDS)

 } else {
  setStatus("error");
  setGlobalMessage(result.message || "Failed to change password");
  
// Rate limited: submit stays disabled until the retryAfter countdown ends.
 if (result.retryAfter) {
  setCountdown(result.retryAfter);
  setTotalCountdown(result.retryAfter)
  setStatus("rate_limited");
  }
 }
  setIsSubmitting(false);
 } ,[formLogicHandleSubmit]
  );

 // Ticks each second; at zero a success runs handleDone and a rate limit is cleared.
 useEffect(() => {
  if (countdown === null) return;
    if (countdown <= 0) {
      if (status === 'success') {
        handleDone();
      } else if (status === 'rate_limited') {
        setCountdown(null);
        setStatus('idle');
      }
      return;
    }

  const timer = setTimeout(()=>setCountdown(countdown =>(countdown !== null ? countdown-1:null)),1000);

  return ()=>clearTimeout(timer)
 }, [countdown, status, handleDone]);

// Development-only debug overlay.
const DebugPanel = () => (
  <div style={{ position: 'fixed', bottom: 0, right: 0, background: '#333', color: 'white', padding: '10px' }}>
    <div>isDirty: {JSON.stringify(isDirty)}</div>
    <div>dirtyFields: {JSON.stringify(dirtyFields)}</div>
    <div>validationErrors: {JSON.stringify(validationErrors)}</div>
    <div>apiErrors: {JSON.stringify(apiErrors)}</div>
    <div>status: {status}</div>
  </div>
);

 return (
  <>
  <div className={styles.container}>

  <ChangePasswordForm
   formData={formData}

   onChange={onChangeField}
   onSubmit={handleSubmitForm}
   onReset={handleReset}
   onClose={handleClose}
   onDone={handleDone}
   onToggleVisibility={toggleVisibility}

   validationErrors={validationErrors}
   apiErrors={apiErrors}
   
   touchedFields={touchedFields}
   visibility={visibility}

   isSubmitting={isSubmitting}
   isDisabled={isDisabled}
   status={status}

   globalMessage={globalMessage}
   onClearGlobalMessage={()=> setGlobalMessage(null)}
   
   countdown={countdown}
   totalCountdown={totalCountdown}
   isSuccess={status === "success"}

   showReset={canReset}
   showDone={showDone}
   showCancel={showCancel}
   canReset={canReset}
    />
 </div>

 {import.meta.env.NODE_ENV === 'development' && <DebugPanel />}
  
</>
  );
};

export default ChangePasswordContainer;

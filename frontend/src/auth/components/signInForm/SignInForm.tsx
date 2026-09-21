// Login form: validation through useFormLogic with signInSchema.
import React, { useEffect, useState } from 'react';
import { signInSchema, SignInFormDataType } from '../../../auth/validation/zod_schemas/authSchemas';
import { getIdentity } from '../../../auth/auth_utils/localStorageHandle/authStorage';
import { FormErrorsType, useFormLogic } from '../../hooks/useFormLogic';
import type { SignInResultType } from '../../hooks/useAuth';
import InputField from '../formUIComponents/InputField';

import styles from "../authPage/styles/authUI.module.css"

type SignInFieldNameType = keyof SignInFormDataType;

/**
 * The server answers a 400 with one list of messages per field, keyed by the
 * form's own field names. Only the first message of each is shown.
 */
const mapApiFieldErrors = (
 fieldErrors: Record<string, string[]>,
): FormErrorsType<SignInFieldNameType> => {
 const mapped: FormErrorsType<SignInFieldNameType> = {};

 (['identity', 'password'] as const).forEach((field) => {
  const messages = fieldErrors[field];

  if (Array.isArray(messages) && messages.length > 0) {
   mapped[field] = messages[0];
  }
 });

 return mapped;
};

type SignInFormProps = {
  onSignIn: (credentials: SignInFormDataType, rememberMe: boolean) => Promise<SignInResultType>;
  externalLoading: boolean;
  error: string | null;
  clearError: () => void;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  // Told whether a field differs from its initial value, so closing can ask first.
  onDirtyChange?: (isDirty: boolean) => void;
};

const SignInForm: React.FC<SignInFormProps> = ({
  onSignIn,
  externalLoading,
  error,
  clearError,
  rememberMe,
  setRememberMe,
  onDirtyChange,
}) => {
  const rememberedIdentity = getIdentity();
  const initialValues: SignInFormDataType = {
    identity: rememberedIdentity?.identity || '',
    password: '',
  };

  // Per-field messages the server sent back, kept apart from the client's own.
  const [apiErrors, setApiErrors] = useState<FormErrorsType<SignInFieldNameType>>({});

  const {
    formData,
    handleChange,
    handleSubmit,
    validationErrors,
    touchedFields,
    isSubmitting,
    isSubmittingAllowed,
  } = useFormLogic({
    schema: signInSchema,
    initialValues,
    onSubmit: async (data) => {
      setApiErrors({});

      const result = await onSignIn(data, rememberMe);

      // A 401 carries no field map: it stays the banner's form-level message so
      // it never names which half of the credentials was wrong.
      if (!result.success && result.fieldErrors) {
        setApiErrors(mapApiFieldErrors(result.fieldErrors));
      }
    },
  });

  // Compared with the initial values, not read from dirtyFields: a field typed
  // and then erased back to its prefill has nothing left to lose.
  const isDirty =
    formData.identity !== initialValues.identity || formData.password !== '';

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // The client's own message wins; the server's is the fallback.
  const getFieldError = (field: SignInFieldNameType): string | undefined =>
    validationErrors[field] || apiErrors[field];

    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const togglePasswordVisibility = () => setIsPasswordVisible(prev => !prev);

    const isLoading = externalLoading || isSubmitting;

    const handleInputChange = (field: keyof SignInFormDataType) => (input: string | React.ChangeEvent<HTMLInputElement>) => {
    const value = typeof input === 'string' ? input : input.target.value;
    if (error) clearError();
    // The server's verdict is about the value that was sent, so editing retires it.
    if (apiErrors[field]) {
      setApiErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    handleChange(field)(value);
    };

  return (
    <>
      {/* Username or email in one field: the password is the only secret, so a
        second identity could only disagree. */}
      <InputField variant='filled'
        label="Username or email"
        type="text"
        placeholder="your_username or email"
        value={formData.identity}
        onChange={handleInputChange('identity')}
        error={getFieldError('identity')}
        touched={touchedFields.has('identity')}
        required
        disabled={isLoading}
      />

      <InputField variant='filled'
        label="Password"
        type="password"
        placeholder="password"
        value={formData.password}
        onChange={handleInputChange('password')}
        error={getFieldError('password')}
        touched={touchedFields.has('password')}
        required
        disabled={isLoading}
       showContentToggle={true}
       isContentVisible={isPasswordVisible}
       onToggleContent={togglePasswordVisibility}
      />

      {/* The row is the label: the browser forwards each activation to the checkbox exactly
          once, so the row needs no onClick (a second handler would toggle twice and cancel
          out). The text is a span because a label cannot nest inside a label. */}
      <label className={styles['auth-form__remember-me']} htmlFor="rememberMe">
        <input
          className={styles['auth-form__checkbox']}
          type="checkbox"
          id="rememberMe"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        <span className={styles['auth-form__label-checkbox']}>
          Remember me
        </span>
      </label>

      <button
        type="submit"
        onClick={handleSubmit}
        className={styles['auth-form__button']}
        disabled={!isSubmittingAllowed || isLoading}
      >
        {isLoading ? 'Loading...' : 'Sign In'}
      </button>
    </>
  );
};

export default SignInForm;
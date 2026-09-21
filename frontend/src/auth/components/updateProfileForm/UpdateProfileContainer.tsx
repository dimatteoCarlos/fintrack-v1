// Container for the profile update form: wires the auth store, the API call and the form-logic hook.
import React, { useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '../../stores/useAuthStore';
import useAuth from '../../hooks/useAuth';

import useUpdateProfileFormLogic from '../../hooks/useUpdateProfileFormLogic';

import useProfileValidation from '../../validation/hook/useUpdateProfileValidation';

import {
  storeToForm,
  formToApi,
  getChangedFields,
} from '../../auth_utils/profileTransformation';

import UpdateProfileForm from './UpdateProfileForm';
import LoadingSpinner from '../formUIComponents/LoadingSpinner';

import styles from './styles/updateProfileContainer.module.css';

import {
  NormalizedProfileUpdateResultType,
  UpdateProfileFormDataType,
} from '../../types/authTypes';
import {
  DEFAULT_CURRENCY,
  SELECT_CURRENCY_OPTIONS,
} from '../../../fintrack/helpers/constants';
import { CurrencyType } from '../../../fintrack/types/types';
import { updateProfileSchema } from '../../validation/zod_schemas/userSchemas';
import {
  buildTimeZoneOptions,
  DEFAULT_TIME_ZONE,
} from '../../auth_utils/timeZoneOptions';

type UpdateProfileContainerPropsType = {
  onSuccess?: () => void;
  onClose?: () => void;
  LoadingComponent?: React.ComponentType;
};

export type CurrencyOptionType = {
  label: string;
  value: CurrencyType;
};

export type TimeZoneSelectOptionType = {
  label: string;
  value: string;
};

const DEFAULT_USER_FORM_DATA: UpdateProfileFormDataType = {
  firstname: '',
  lastname: '',
  currency: DEFAULT_CURRENCY,
  contact: null,
  timezone: DEFAULT_TIME_ZONE,
};

// Derived from the supported currencies (currencyConstants.ts) so the list cannot
// drift from what the rest of the application accepts.
const currencyOptions: CurrencyOptionType[] = SELECT_CURRENCY_OPTIONS;

const PROFILE_FIELD_MAPPING = {
  user_firstname: 'firstname',
  user_lastname: 'lastname',
  currency: 'currency',
  contact: 'contact',
  timezone: 'timezone',
} as const;

// Built once per module: the ICU catalog does not change while the tab lives,
// and it is around 420 entries.
const timeZoneOptions = buildTimeZoneOptions();

const UpdateProfileContainer = ({
  onClose,
  LoadingComponent = LoadingSpinner,
}: UpdateProfileContainerPropsType) => {
  const userData = useAuthStore((state) => state.userData);

  const {
    handleUpdateUserProfile,
    isLoading: isApiLoading,
    clearError: clearApiError,
    clearSuccessMessage: clearApiSuccessMessage,
  } = useAuth();

  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const transformations = useMemo(
    () => ({
      formToApi,
      storeToForm,
      getChangedFields,
    }),
    [],
  );
  const initialFormData = useMemo(() => {
    return userData
      ?
        transformations.storeToForm(userData)
      :
        DEFAULT_USER_FORM_DATA;
  }, [userData, transformations]);

  const profileValidation = useProfileValidation({
    fieldMapping: PROFILE_FIELD_MAPPING,
    schema: updateProfileSchema,
  });

  const updateProfileApiWrapper = React.useCallback(
    async (
      payload: Record<string, unknown>,
    ): Promise<NormalizedProfileUpdateResultType> => {
      try {

        const apiResult = await handleUpdateUserProfile(payload);

        if (apiResult.success) {
          return {
            success: true,
            fieldErrors: {},
            message: apiResult.message || 'Profile updated successfully',
          };
        }

        // Keep the server's retry delay so the form can disable Save while rate limited.
        if (!apiResult.success && apiResult.retryAfter) {
          setRetryAfter(apiResult.retryAfter);
        }

        // The server sends string[] per field; the logic hook takes one string, so keep the first.
        const normalizedFieldErrors: Record<string, string> = {};
        if (apiResult.fieldErrors) {
          Object.entries(apiResult.fieldErrors).forEach(([key, value]) => {
            normalizedFieldErrors[key] = Array.isArray(value)
              ? value[0]
              : String(value);
          });
        }

        return {
          success: false,
          error: apiResult.error ?? apiResult.message,
          message: apiResult.message,
          fieldErrors: normalizedFieldErrors,
        };
      } catch (error) {
        console.error('API call failed:', error);
        return {
          success: false,
          error: 'Network error',
          fieldErrors: {},
        };
      }
    },
    [handleUpdateUserProfile],
  );

  const formLogic = useUpdateProfileFormLogic({
    initialData: initialFormData,
    updateProfileApi: updateProfileApiWrapper,
    validation: profileValidation,
    transformations,
  });

  // Clear the shared API error and success message on unmount.
  useEffect(() => {
    return () => {
      clearApiError();
      clearApiSuccessMessage();
    };
  }, [clearApiError, clearApiSuccessMessage]);

  // Warn on tab close or reload while there are unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formLogic.isDirty && !formLogic.successMessage) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  const handleFormSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearApiError();
      clearApiSuccessMessage();

      const result = await formLogic.handleSubmit(e);

      if (import.meta.env.VITE_ENVIRONMENT === 'developmentX') {
        console.log('🚀 ~ UpdateProfileContainer ~ result:', result);
      }
    },
    [formLogic, clearApiError, clearApiSuccessMessage],
  );

  // After a successful save the Done button closes directly; otherwise unsaved changes need a confirm.
  const handleClose = React.useCallback(() => {
    if (formLogic.successMessage) {
      if (onClose) onClose();
      return;
    }
    if (formLogic.isDirty && !formLogic.successMessage) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close?',
      );

      if (!confirmClose) return;
    }

    if (onClose) {
      onClose();
    }
  }, [formLogic.isDirty, formLogic.successMessage, onClose]);

  const isLoading = isApiLoading || formLogic.isLoading;

  if (!userData) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingComponent />
        <p className={styles.loadingText}>Loading user profile...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <LoadingComponent />
          <p className={styles.loadingOverlayText}>Saving your changes...</p>
        </div>
      )}

      <UpdateProfileForm
        formData={formLogic.formData}
        errors={formLogic.errors}
        touchedFields={formLogic.touchedFields}
        isDirty={formLogic.isDirty}
        isLoading={isLoading}
        onChange={formLogic.handleChange}
        onSubmit={handleFormSubmit}
        onReset={formLogic.resetForm}
        onClearErrors={formLogic.clearError}
        onMarkAllTouched={formLogic.markAllFieldsTouched}
        onClose={onClose ? handleClose : undefined}
        apiErrorMessage={formLogic.apiError}
        successMessage={formLogic.successMessage}
        currencyOptions={currencyOptions}
        timeZoneOptions={timeZoneOptions}
        retryAfter={retryAfter}
      />

      {import.meta.env.VITE_ENVIRONMENT === 'developmentX' && (
        <div className={styles.debugInfo}>
          <h4 className={styles.debugInfoHeader}>🐛 Development Debug Info</h4>
          <div className={styles.debugGrid}>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>isDirty:</span>
              <span className={styles.debugValue}>
                {formLogic.isDirty ? '🟢 YES' : '⚪ NO'}
              </span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>isLoading:</span>
              <span className={styles.debugValue}>
                {isLoading ? '🔄 YES' : '⚪ NO'}
              </span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>Error Count:</span>
              <span className={styles.debugValue}>
                {Object.keys(formLogic.errors).length}
              </span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>Touched Fields:</span>
              <span className={styles.debugValue}>
                {Object.keys(formLogic.touchedFields).length}
              </span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>User ID:</span>
              <span className={styles.debugValue}>
                {userData?.user_id || 'N/A'}
              </span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugLabel}>Initial Loaded:</span>
              <span className={styles.debugValue}>
                {initialFormData ? '✅' : '❌'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateProfileContainer;

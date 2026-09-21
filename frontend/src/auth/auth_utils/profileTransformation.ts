import { DEFAULT_CURRENCY } from '../../fintrack/helpers/constants';
import { CurrencyType } from '../../fintrack/types/types';
import {
  UpdateProfileFormDataType,
  UserDataType,
} from '../types/authTypes';
import { DEFAULT_TIME_ZONE } from './timeZoneOptions';

export type ProfileApiPayloadType = {
  firstname?: string;
  lastname?: string;
  currency?: CurrencyType;
  contact?: string | null;
  timezone?: string;
};

/** Maps the store's user_firstname/user_lastname fields to the form's firstname/lastname. */
export const storeToForm = (
  userData: UserDataType | null,
): UpdateProfileFormDataType => ({
  firstname: userData?.user_firstname || '',
  lastname: userData?.user_lastname || '',
  currency:
    (userData?.currency?.toLowerCase() as CurrencyType) || DEFAULT_CURRENCY,
  contact: userData?.contact ?? null,
  // Column default, not the device zone: seeding from Intl would offer to move
  // the account whenever the owner travels.
  timezone: userData?.timezone || DEFAULT_TIME_ZONE,
});

/** Builds the API payload, omitting empty values; an empty contact is sent as null to clear it. */
export const formToApi = (
  formData: Partial<UpdateProfileFormDataType>,
): ProfileApiPayloadType => {
  const payload: ProfileApiPayloadType = {};
  if (formData.firstname?.trim()) {
    payload.firstname = formData.firstname;
  }

  if (formData.lastname?.trim()) {
    payload.lastname = formData.lastname;
  }

  if (formData.currency) {
    payload.currency = formData.currency;
  }

  if (formData.contact !== undefined) {
    payload.contact = formData.contact === '' ? null : formData.contact;
  }

  if (formData.timezone) {
    payload.timezone = formData.timezone;
  }

  return payload;
};
/** Returns only the fields that changed, compared as strings so null, undefined and '' are equal. */
export const getChangedFields = (
  currentData: UpdateProfileFormDataType,
  originalData: UpdateProfileFormDataType,
): Partial<UpdateProfileFormDataType> => {
  type ChangedType = {
    [K in keyof UpdateProfileFormDataType]?: UpdateProfileFormDataType[K] extends
      | string
      | null
      ? string | null
      : UpdateProfileFormDataType[K];
  };

  const normalize = (val: unknown) => String(val ?? '');

  const changed: ChangedType = {};

  (Object.keys(currentData) as Array<keyof UpdateProfileFormDataType>).forEach(
    (key) => {
      if (normalize(currentData[key]) !== normalize(originalData[key])) {
        changed[key] = currentData[key];
      }
    },
  );

  return changed as Partial<UpdateProfileFormDataType>;
};

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AxiosRequestConfig } from 'axios';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import FormDatepicker from '../../../general_components/datepicker/Datepicker.tsx';
import InputNumberFormHandler from '../../../general_components/inputNumberHandler/InputNumberFormHandler.tsx';
import LabelNumberValidation from '../../../general_components/labelNumberValidation/LabelNumberValidation.tsx';
import CharacterCounter from '../../../general_components/characterCounter/CharacterCounter.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';

import {
  ACCOUNT_TYPE_DEFAULT,
  DEFAULT_CURRENCY,
  VARIANT_FORM,
} from '../../../helpers/constants.ts';

import { url_create_basic_account } from '../../../../urlConfig.ts';

import '../styles/forms-styles.css';

import {
  CurrencyType,
  DropdownOptionType,
  FormNumberInputType,
  VariantType,
} from '../../../types/types.ts';

import { CreateBasicAccountApiResponseType } from '../../../types/responseApiTypes.ts';

import {
  capitalize,
  earliestDatableDay,
  latestDatableDay,
  toCalendarDay,
} from '../../../helpers/functions.ts';
import { validationData } from '../../../validations/utils/custom_validation.ts';

import {
  RequestFailureType,
  useFetchLoad,
} from '../../../hooks/useFetchLoad.ts';
import { useRatePreview } from '../../../hooks/useRatePreview.ts';
import { readAmountInCurrency } from '../../../helpers/amountInCurrency.ts';
import useAuth from '../../../../auth/hooks/useAuth.ts';
import { AUTH_ROUTE } from '../../../../auth/auth_constants/constants.ts';

import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';

import { useAccountExistence } from '../../../hooks/useAccountExistence.ts';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback.ts';
const defaultCurrency = DEFAULT_CURRENCY;

type AccountDataType = {
  name: string;
  date: Date;
  type: string | undefined | null;
  amount: number | '';
  currency: string;
};

// The body the endpoint reads. `date` dates the account row; `transactionActualDate`
// dates the movement that opens it, and falls back to the server clock when absent -
// so a backdated account used to report nothing for the months before its creation.
type NewAccountPayloadType = AccountDataType & {
  transactionActualDate: string;
};

const initialNewAccountData: AccountDataType = {
  name: '',
  type: '',
  date: new Date(),
  amount: '',
  currency: 'usd',
};

export type TypeOptionsType = {
  title: string;
  options: {
    value: string;
    label: string;
  }[];
  variant: VariantType;
};

// Both ends of the opening window come from the shared helpers rather than being
// recomputed here: New Category and New Profile ask the same question, and three
// copies of one policy would let the three calendars disagree.
const latestOpeningDay = latestDatableDay;
const earliestOpeningDay = earliestDatableDay;

// A value the server put in details, only when it really is text.
const asText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

// Owner-facing text for a refused creation, keyed on the server's stable error code, not its sentence;
// unlisted codes fall through to the server's prose. Date entries are a backstop for the calendar's
// back-dating window.
const openingErrorText = (failure: RequestFailureType | null): string | null => {
  if (!failure) return null;

  const details = failure.details ?? {};

  switch (failure.code) {
    case 'OPENING_DATE_BEFORE_CURRENT_MONTH': {
      const from = asText(details.currentMonthStart);
      return from
        ? `That day is outside the window an account can be opened in. Pick a day from ${from} onwards.`
        : 'That day is outside the window an account can be opened in. Pick a more recent one.';
    }
    case 'OPENING_DATE_AFTER_TODAY':
      return 'An account cannot be opened on a future day. Pick today, or an earlier one.';
    case 'INVALID_OPENING_DATE':
      return 'The opening date could not be read. Pick the day again from the calendar.';
    case 'FX_RATE_UNAVAILABLE': {
      const day = asText(details.requestedDay);
      return `No exchange rate has been published for ${day ?? 'that day'} yet. Try again in a moment, or open the account dated today.`;
    }
    default:
      return null;
  }
};

const formDataNumber = { keyName: 'amount', title: 'value' };
const initialFormData: FormNumberInputType = {
  [formDataNumber.keyName]: '',
};
function NewAccount() {
  const location = useLocation();
  const navigateTo = useNavigate();
  const { isAuthenticated } = useAuth();

  const [accountData, setAccountData] = useState<AccountDataType>(
    initialNewAccountData,
  );

  const [currency, setCurrency] = useState<CurrencyType>(defaultCurrency);

  const [isCurrencyDisabled, setIsCurrencyDisabled] = useState<boolean>(false);

  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [isDisabledValue, setIsDisabledValue] = useState<boolean>(false);

  const [isReset, setIsReset] = useState<boolean>(false);

  const [formData, setFormData] =
    useState<FormNumberInputType>(initialFormData);

  const [messageToUser, setMessageToUser] = useState<string | null | undefined>(
    null,
  );

   const { getSuggestions, checkDuplicate } = useAccountExistence();
  
   const debouncedCheckDuplicate = useDebouncedCallback((name: string, type: string) => {
     const trimmed = name.trim();
     if (trimmed.length > 0 && type && checkDuplicate(trimmed, type)) {
       setValidationMessages(prev => ({
         ...prev,
         name: 'ℹ️ This account name already exists for this type'
       }));
     } else {
       setValidationMessages(prev => ({ ...prev, name: '' }));
     }
   }, 300);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessageToUser('Please log in to create an account');
      setTimeout(() => navigateTo(AUTH_ROUTE), 3500);
    }
  }, [isAuthenticated, navigateTo]);

  const title = 'type';
  const optionsTypeAccounts = ACCOUNT_TYPE_DEFAULT;

  const { data, isLoading, error, failure, requestFn } = useFetchLoad<
    CreateBasicAccountApiResponseType,
    AccountDataType
  >({ url: url_create_basic_account, method: 'POST' });

  const accountSelectionProp = {
    title,
    options: optionsTypeAccounts,
    variant: VARIANT_FORM,
  };
  function inputHandler(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    const { name, value } = e.target;

    setAccountData((prev) => ({ ...prev, [name]: value }));

   if (name === 'name') {
    debouncedCheckDuplicate(value, accountData.type || '');
   }
  }

  function amountIncomeSource() {
    setIsDisabledValue(true);
    setAccountData((prev) => ({ ...prev, ['amount']: 0 }));
  }
  function accountTypeSelectHandler(selectedOption: DropdownOptionType | null) {
    if (selectedOption) {
      setAccountData((acc: AccountDataType) => ({
        ...acc,
        type: selectedOption?.label,
      }));

      if (selectedOption.label === 'income_source') {
        amountIncomeSource();
        setIsDisabledValue(true);
        setCurrency(defaultCurrency);
        setAccountData(prev => ({ ...prev, currency: defaultCurrency }));
       setIsCurrencyDisabled(true);         
        return;
      } else {
        setAccountData((acc: AccountDataType) => ({ ...acc, type: selectedOption?.label,
        }));
        setIsDisabledValue(false);
        setIsCurrencyDisabled(false);
      }
    } else {
      setAccountData((acc: AccountDataType) => ({
        ...acc,
        type: undefined,
      }));
      setIsDisabledValue(false);
      setIsCurrencyDisabled(false);
    }

   // Duplicate names are checked per type, so re-check when the type changes.
  const currentName = accountData.name.trim();
  if (currentName.length > 0 && selectedOption?.label) {
    const newType = selectedOption.label;
    if (checkDuplicate(currentName, newType)) { setValidationMessages(prev => ({
        ...prev,
        name: 'ℹ️ This account name already exists for this type'
      }));
    } else {
     setValidationMessages(prev => ({ ...prev, name: '' }));
    }
   } 
  }
  function changeStartingPoint(selectedDate: Date) {
    setAccountData((acc) => ({ ...acc, date: selectedDate }));
  }
  function updateDataCurrency(currency: CurrencyType) {
    setCurrency(currency);
    setAccountData((acc) => ({ ...acc, currency: currency }));
   }
  // Previews the opening balance accountCreationController.js will store, via the write path's
  // conversion service (rateDayForOpening); today's live rate would mis-preview a backdated account.
  const openingDay = toCalendarDay(accountData.date);

  // formData keeps what was typed; the amount sent is read under the currency
  // selected at save time.
  const { amountToSave } = readAmountInCurrency(
    formData[formDataNumber.keyName],
    currency,
  );

  const conversion = useRatePreview(amountToSave, currency, openingDay);

  const showRatePreview = conversion.status === 'resolved';

  async function onSubmitForm(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    if (!isAuthenticated) {
      setMessageToUser('Please log in to create an account');
      return;
    }

    // An income source carries no value field; its amount stays the 0 it was given.
    const amount = isDisabledValue ? accountData.amount : (amountToSave ?? '');
    const newValidationMessages = {
      ...validationData({ ...accountData, amount }),
    };

    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }
    try {
      const { name, type, currency, date } = accountData;

      // openingDay is the same calendar day as `date`, in the shape the movement
      // forms already send.
      const payload: NewAccountPayloadType = {
        name,
        type,
        currency,
        amount,
        date,
        transactionActualDate: openingDay,
      } as NewAccountPayloadType;

      console.log('data to post:', { ...accountData });

      const finalUrl = `${url_create_basic_account}/${type}`;

      await requestFn(payload, {
        url: finalUrl,
      } as AxiosRequestConfig);

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
        console.log('Data from New Account request:', data);
      }

      setIsReset(true);
      setValidationMessages({});
      setFormData(initialFormData);
      setAccountData(initialNewAccountData);
      setIsDisabledValue(false);
      setMessageToUser(null);

      // Delay clearing isReset so the type dropdown can update to null.
      setTimeout(() => {
        setIsReset(false);
      }, 1000);
    } catch (error) {
      const messageError = 'Submission error';
      console.error(messageError, error);
      setMessageToUser(messageError);
    }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (data && !isLoading && !error) {
      setMessageToUser(data.message || 'Account successfully  created!');

      timer = setTimeout(() => {
        setMessageToUser(null);
      }, 4000);
    } else if (error) {
      // This form's own wording when the server named the condition, and the
      // server's sentence when it did not.
      setMessageToUser(openingErrorText(failure) ?? error);
      timer = setTimeout(() => setMessageToUser(null), 4000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [data, isLoading, error, failure]);

  const isFormDisabled = !isAuthenticated;
  return (
    <section className='account__page__container page__container'>
      <TopWhiteSpace variant={'dark'} />
      <div className='account__page__content page__content'>
        <div className='main__title--container'>
          <Link
            // Optional chaining: a direct visit by URL has no location state, and an
            // unguarded read threw before the page rendered.
            to={location.state?.previousRoute || '/dashboard'}
            relative='path'
            className='backArrow backArrow--dark'
          >
            <LeftArrowLightSvg />
          </Link>
          <div className='form__title'>{'New Account'}</div>
        </div>

        {!isAuthenticated && (
          <div
            className='error-message'
            style={{ margin: '1rem 0', padding: '1rem' }}
          >
            Please log in to create a new account
          </div>
        )}

        <form className='form__box' autoComplete='off'>
          <div className=' form__container'>
           
            <div className='input__box'>
              <label className='label forms__label'>
                Account Type &nbsp;
                <span className='validation__errMsg'>
                  {validationMessages['type']}
                </span>
              </label>

              <DropDownSelection
                dropDownOptions={accountSelectionProp}
                updateOptionHandler={accountTypeSelectHandler}
                isReset={isReset}
                setIsReset={setIsReset}
              />
            </div>

            <div className='input__box'>
              <label htmlFor='name' className='label forms__label'>
                {'Account Name'}
                <CharacterCounter
                  value={accountData.name}
                  maxLength={NAME_MAX_LENGTHS.account_name}
                />
                &nbsp;
                <span className={`validation__errMsg ${validationMessages['name']?.includes('ℹ️') ? 'validation__msg--info' : ''}`}>
                 {validationMessages['name']}
                </span>
              </label>

              <input
                type='text'
                className='input__container'
                placeholder='Account Name'
                id='name'
                name='name'
                onChange={inputHandler}
                value={accountData.name}
                disabled={isFormDisabled}
                maxLength={NAME_MAX_LENGTHS.account_name}
                list='account-names'
              />
            </div>

            <datalist id='account-names'>
             {getSuggestions(accountData.type || '').map((name) => (
               <option key={name} value={name} />
             ))}
           </datalist>

            <div className='account__dateAndCurrency'>
              <div className='account__date'>
                <label className='label forms__label'>{'Starting Point'}</label>
                <div className='form__datepicker__container'>
                  <FormDatepicker
                    changeDate={changeStartingPoint}
                    date={accountData.date}
                    variant={'form'}
                    minDate={earliestOpeningDay()}
                    maxDate={latestOpeningDay()}
                  ></FormDatepicker>
                </div>
              </div>

              <div className='account__currency'>
                <div className='label forms__label'>Currency</div>
                <CurrencyBadge
                  variant={'form'}
                  updateOutsideCurrencyData={updateDataCurrency}
                  currency={currency}
                  disabled={isCurrencyDisabled}
                />
              </div>
            </div>

            {!isDisabledValue && (
              <div className='input__box'>
                {/* Label and conversion message share a row, as in NewCategory.tsx;
                    the message states what will be stored and the rate tooltip opens over it. */}
                <div className='form__label-row'>
                  <LabelNumberValidation
                    formDataNumber={formDataNumber}
                    validationMessages={validationMessages}
                    variant={VARIANT_FORM}
                  />

                  {showRatePreview && (
                    <RateTooltip
                      tipText={conversion.tooltipText}
                      surface='dark'
                      placement='anchor-left-below'
                    >
                      <span className='form__fx-preview'>
                        {conversion.previewText}
                      </span>
                    </RateTooltip>
                  )}

                  {conversion.status === 'failed' && (
                    <span className='form__fx-preview' role='status'>
                      No rate available yet
                    </span>
                  )}
                </div>

                <InputNumberFormHandler
                  validationMessages={validationMessages}
                  setValidationMessages={setValidationMessages}
                  keyName={formDataNumber.keyName as keyof AccountDataType}
                  placeholderText={formDataNumber.keyName}
                  formData={formData}
                  setFormData={setFormData}
                  setStateData={setAccountData}
                  currency={currency}
                />
           
              </div>
            )}
          </div>

          <div className='submit__btn__container'>
            <FormSubmitBtn
              onClickHandler={onSubmitForm}
              disabled={isLoading || isFormDisabled}
            >
              save
            </FormSubmitBtn>
          </div>
        </form>
      </div>

      {isLoading && <div style={{ color: 'cyan' }}>Loading...</div>}

      {error && (
        <div className='error-message'>
          <span
            className='validation__errMsg'
            style={{
              color: 'var(--error, #d32f2f)',
              borderRadius: '4px',
              margin: '1rem 0',
              fontSize: '1rem',
              fontWeight: '200',
              lineHeight: '1.5rem',
            }}
          >
            {messageToUser}
          </span>
        </div>
      )}

      {!error && messageToUser && (
        <div className='success-message'>
          <span
            style={{
              color: 'lightgreen',
              fontSize: '1rem',
              marginTop: '1rem',
              textAlign: 'center',
              fontWeight: '200',
              lineHeight: '1.5rem',
            }}
          >
            {capitalize(messageToUser)}
          </span>
        </div>
      )}
    </section>
  );
}

export default NewAccount;

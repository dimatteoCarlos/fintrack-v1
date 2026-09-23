import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import InputNumberFormHandler from '../../../general_components/inputNumberHandler/InputNumberFormHandler.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';

import '../styles/forms-styles.css';

import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';

import { useFetch } from '../../../hooks/useFetch.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import useAuth from '../../../../auth/hooks/useAuth.ts';
import { capitalize } from '../../../helpers/functions.ts';
import { validationData } from '../../../validations/utils/custom_validation.ts';
import { useRatePreview } from '../../../hooks/useRatePreview.ts';
import { readAmountInCurrency } from '../../../helpers/amountInCurrency.ts';

import {
  url_create_debtor_account,
  url_get_accounts_by_type,
} from '../../../../urlConfig.ts';

import {
  CurrencyType,
  DropdownOptionType,
  FormNumberInputType,
} from '../../../types/types.ts';
import {
  AccountByTypeResponseType,
  CreateDebtorAccountApiResponseType,
} from '../../../types/responseApiTypes.ts';

import {
  ACCOUNT_OPTIONS_DEFAULT,
  DEFAULT_CURRENCY,
  TYPEDEBTS_OPTIONS_DEFAULT,
  VARIANT_FORM,
} from '../../../helpers/constants.ts';
import { AUTH_ROUTE } from '../../../../auth/auth_constants/constants.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';
import CharacterCounter from '../../../general_components/characterCounter/CharacterCounter.tsx';

// Default until multi-currency handling is decided.
const defaultCurrency = DEFAULT_CURRENCY;

type ProfileInputDataType = {
  name: string;
  lastname: string;
  account: string;
  type: string;
  amount: string | '';
  currency?: CurrencyType;
};

type ProfilePayloadType = {
  name: string;
  lastname: string;
  transaction_type: string;
  account_type: string;
  amount: number | '';
  currency?: CurrencyType;
  selected_account_name: string;
  selected_account_type: string;
  user?: string;
};

const initialNewProfileData: ProfileInputDataType = {
  name: '',
  lastname: '',
  type: '',
  amount: '',
  account: '',
};
const typeSelectionProp = {
  title: 'select type',
  options: TYPEDEBTS_OPTIONS_DEFAULT,
  variant: VARIANT_FORM,
};
const formDataNumber: { keyName: keyof ProfileInputDataType; title: string } = {
  keyName: 'amount',
  title: 'value',
};
// Not Partial<>: the key is always written, and an optional one would hand
// undefined to every reader. Same type the other number forms use.
const initialFormData: FormNumberInputType = {
  [formDataNumber.keyName]: '',
};

const selected_account_type = 'bank',
  account_type = 'debtor';

function NewProfile() {
  const location = useLocation();
  const navigateTo = useNavigate();

  const { isAuthenticated } = useAuth();

  const [formData, setFormData] =
    useState<FormNumberInputType>(initialFormData);

  const [profileData, setProfileData] = useState<ProfileInputDataType>(
    initialNewProfileData,
  );

  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [isReset, setIsReset] = useState<boolean>(false);

  const [messageToUser, setMessageToUser] = useState<
    { message: string; status?: number } | string | null | undefined
  >(null);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessageToUser('Please log in to create an account');
      setTimeout(() => navigateTo(AUTH_ROUTE), 5000);
    }
  }, [isAuthenticated, navigateTo]);
  const fetchUrl = `${url_get_accounts_by_type}/?type=bank&${reloadTrigger}`;

  const {
    apiData: BankAccountsResponse,
    isLoading: isLoadingBankAccounts,
    error: fetchedErrorBankAccounts,
  } = useFetch<AccountByTypeResponseType>(fetchUrl as string);

  const optionAccounts = useMemo(() => {
    if (fetchedErrorBankAccounts) {
      return ACCOUNT_OPTIONS_DEFAULT;
    }
    const accountList = BankAccountsResponse?.data?.accountList ?? [];

    return accountList.length
      ? accountList.map((acc) => ({
          value: acc.account_name,
          label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${acc.account_balance})`,
        }))
      : ACCOUNT_OPTIONS_DEFAULT;
  }, [BankAccountsResponse?.data.accountList, fetchedErrorBankAccounts]);

  const accountSelectionProp = {
    title: 'Select Account',
    options: optionAccounts,
    variant: VARIANT_FORM,
  };
  const { data, isLoading, error, status, requestFn } = useFetchLoad<
    CreateDebtorAccountApiResponseType,
    ProfilePayloadType
  >({ url: url_create_debtor_account, method: 'POST' });
  const selectedCurrency = profileData.currency ?? defaultCurrency;

  function updateDataCurrency(currency: CurrencyType) {
    setProfileData((data) => ({ ...data, currency }));
  }

  // formData keeps what was typed; the amount sent is read under the currency
  // selected at save time.
  const { amountToSave } = readAmountInCurrency(
    formData[formDataNumber.keyName],
    selectedCurrency,
  );

  // States what the backend will store as the loan value, which is also the
  // figure checked against the bank account's funds.
  const ratePreview = useRatePreview(amountToSave, selectedCurrency);
  const showRatePreview = ratePreview.status === 'resolved';

  function inputHandler(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  }
  function typeSelectHandler(selectedOption: DropdownOptionType | null) {
    const newValue = selectedOption === null ? '' : selectedOption?.value || '';
    setProfileData((prev) => ({
      ...prev,
      type: newValue,
    }));

    if (selectedOption === null) {
      setValidationMessages((prev) => ({
        ...prev,
        type: '* Please provide the Type',
      }));
    } else {
      setValidationMessages((prev) => ({
        ...prev,
        type: '',
      }));
    }
  }
  function accountSelectHandler(selectedOption: DropdownOptionType | null) {
    const newValue = selectedOption === null ? '' : selectedOption?.value || '';
    setProfileData((prev) => ({
      ...prev,
      account: newValue,
    }));

    if (selectedOption === null) {
      setValidationMessages((prev) => ({
        ...prev,
        account: '* Please provide the Account',
      }));
    } else {
      setValidationMessages((prev) => ({
        ...prev,
        account: '',
      }));
    }
  }
  async function onSubmitForm(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const amount = amountToSave ?? '';
    const newValidationMessages = validationData({ ...profileData, amount });
    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }
    try {
      const finalAmount = amount === '' ? 0 : amount;

      const payload: ProfilePayloadType = {
        account_type,
        currency: selectedCurrency,
        amount: finalAmount,
        lastname: capitalize(profileData.lastname),
        name: capitalize(profileData.name),
        transaction_type: profileData.type,
        selected_account_name: profileData.account,
        selected_account_type,
      };
      const data = await requestFn(payload);
      if (data.error) {
        return;
      }

      if (import.meta.env.VITE_ENVIRONMENT === 'developmentX') {
        console.log('Data from New Debtor request:', data);
      }

      setIsReset(true);
      setValidationMessages({});
      setProfileData(initialNewProfileData);
      setFormData(initialFormData);
      setReloadTrigger((prev) => prev + 1);
      setTimeout(() => setIsReset(false), 300);
    } catch (error) {
      console.log('Error when posting data:', error);
    }
  }
  useEffect(() => {
    if (data && !isLoading && !error) {
      setMessageToUser(
        data.message || 'New Profile account successfully created!',
      );
    } else if (!isLoading && error) {
      // status travels with the message now: a bare string here defaults to 200
      // in MessageToUser.tsx, which painted a rejection toast green.
      setMessageToUser({ message: error, status: status ?? undefined });
    }

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      setMessageToUser(null);
    }, 5000);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [data, error, isLoading, status]);

  return (
    <section className='profile__page__container page__container '>
      <TopWhiteSpace variant={'dark'} />
      <div className='profile__page__content page__content'>
        <div className='main__title--container '>
          <Link
            to={location.state.previousRoute}
            relative='path'
            className='backArrow backArrow--dark'
          >
            <LeftArrowLightSvg />
          </Link>
          <div className='form__title'>{'New Profile'}</div>
        </div>

        <form className='form__box' autoComplete='off'>
          <div className='container--profileName form__container '>
            <div className='input__box'>
              <label htmlFor='name' className='label forms__label'>
                {'Name'}

                <CharacterCounter
                  value={profileData.name}
                  maxLength={NAME_MAX_LENGTHS.debtor_name}
                />

                <span className='validation__errMsg'>
                  {validationMessages['name']}
                </span>
              </label>

              <input
                type='text'
                className={`input__container`}
                placeholder={`Name`}
                name={'name'}
                id={'name'}
                onChange={inputHandler}
                value={profileData.name}
                maxLength={NAME_MAX_LENGTHS.debtor_name}
              />
            </div>

            <div className='input__box'>
              <label htmlFor='lastname' className='label forms__label'>
                {'Last Name'}

                <CharacterCounter
                  value={profileData.lastname}
                  maxLength={NAME_MAX_LENGTHS.debtor_lastname}
                />

                <span className='validation__errMsg'>
                  {validationMessages['lastname']}
                </span>
              </label>

              <input
                type='text'
                className={`input__container`}
                placeholder={`last name`}
                name={'lastname'}
                id={'lastname'}
                onChange={inputHandler}
                value={profileData.lastname}
                maxLength={NAME_MAX_LENGTHS.debtor_lastname}
              />
            </div>

            <div className='input__box'>
              <label className='label forms__label'>
                Account &nbsp;
                <span className='validation__errMsg'>
                  {validationMessages['account']}
                </span>
              </label>

              <DropDownSelection
                dropDownOptions={accountSelectionProp}
                updateOptionHandler={accountSelectHandler}
                isReset={isReset}
                setIsReset={setIsReset}
              />

              {/* Label and conversion message share a row, as in New Account.
                  The tooltip sits outside the label so hovering it does not
                  focus the input. */}
              <div className='form__label-row'>
                <label
                  htmlFor={formDataNumber.keyName}
                  className='label forms__label'
                >
                  {capitalize(formDataNumber.title)}&nbsp;
                  <span
                    className={`validation__errMsg${
                      validationMessages[formDataNumber.keyName]
                        ?.toLowerCase()
                        .includes('format:')
                        ? ' validation__errMsg--ok'
                        : ''
                    }`}
                  >
                    {validationMessages[formDataNumber.keyName]?.replace(
                      'Format:',
                      '',
                    )}
                  </span>
                </label>

                {showRatePreview && (
                  <RateTooltip
                    tipText={ratePreview.tooltipText}
                    surface='dark'
                    placement='anchor-left-below-badge'
                  >
                    <span className='form__fx-preview'>
                      {ratePreview.previewText}
                    </span>
                  </RateTooltip>
                )}
              </div>

              <div className='form__amount-row'>
                <InputNumberFormHandler
                  validationMessages={validationMessages}
                  setValidationMessages={setValidationMessages}
                  keyName={formDataNumber.keyName}
                  placeholderText={formDataNumber.title}
                  formData={formData}
                  setFormData={setFormData}
                  setStateData={setProfileData}
                  currency={selectedCurrency}
                />

                <CurrencyBadge
                  variant={'form'}
                  updateOutsideCurrencyData={updateDataCurrency}
                  currency={selectedCurrency}
                />
              </div>
            </div>

            <div className='input__box'>
              {/* A div, not a label: DropDownSelection is a sibling and there is
                  no htmlFor, so a label would name nothing. The control is named
                  below through its ariaLabel. */}
              <div className='label forms__label'>
                {'Type'}
                <span className='validation__errMsg'>
                  {validationMessages['type']}
                </span>
              </div>
              <DropDownSelection
                dropDownOptions={typeSelectionProp}
                updateOptionHandler={typeSelectHandler}
                ariaLabel='Type'
                isReset={isReset}
                setIsReset={setIsReset}
              />
            </div>
          </div>

          <div className='submit__btn__container'>
            <FormSubmitBtn onClickHandler={onSubmitForm}>save</FormSubmitBtn>
          </div>
        </form>

        <MessageToUser
          isLoading={isLoading || isLoadingBankAccounts}
          error={error || fetchedErrorBankAccounts}
          messageToUser={messageToUser}
          variant='form'
        />
      </div>
    </section>
  );
}

export default NewProfile;

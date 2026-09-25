// Income tracker; input is validated with Zod.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosRequestConfig } from 'axios';
import { useLocation } from 'react-router-dom';

import { useFetch } from '../../../hooks/useFetch.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';

// form input validation manager
import useFormManager from '../../../hooks/useFormManager.ts';
import { useTransactionDate } from '../../../hooks/useTransactionDate.ts';

import useBalanceStore from '../../../stores/useBalanceStore.ts';
import { notifyTransactionRecorded } from '../../../stores/transactionEvents.ts';
import {
  url_get_accounts_by_type,
  url_get_total_account_balance_by_type,
  url_movement_transaction_record,
} from '../../../../urlConfig.ts';

import {
  DEFAULT_CURRENCY,
  ACCOUNT_OPTIONS_DEFAULT,
  SOURCE_OPTIONS_DEFAULT,
  PAGE_LOC_NUM,
} from '../../../helpers/constants.ts';
import {
  MESSAGE_DURATION,
  noticeCarriesLink,
  TRACKER_MESSAGES,
} from '../trackerMessages.ts';

import type {
  AccountByTypeResponseType,
  BalanceBankRespType,
  MovementTransactionResponseType,
} from '../../../types/responseApiTypes.ts';

import type {
  CurrencyType,
  IncomeInputDataType,
  VariantType,
  MovementTransactionType,
} from '../../../types/types.ts';

import { incomeSchema } from '../../../validations/zod_schemas/trackerMovementSchema.ts';
import { IncomeValidatedDataType } from '../../../validations/types.ts';

import TopCard from '../components/TopCard.tsx';
import CardSeparator from '../components/CardSeparator.tsx';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import CardNoteSave from '../components/CardNoteSave.tsx';
import EmptyListNotice, {
 resolveEmptyCase,
} from '../components/EmptyListNotice.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import { authFetch } from '../../../../auth/auth_utils/authFetch.ts';
export type ShowValidationType = {
  amount: boolean;
  account: boolean;
  source: boolean;
  note: boolean;
};

const defaultCurrency = DEFAULT_CURRENCY;

const initialIncomeData: IncomeInputDataType = {
  amount: '', //string for input
  account: '',
  source: '',
  note: '',
  currency: DEFAULT_CURRENCY,
};
const VARIANT_DEFAULT: VariantType = 'tracker';
// Main component: Income tracker movement
function Income(): JSX.Element {
  // Rule: only bank accounts receive income amounts. The account options are all existing bank accounts except
  // the slack account, which is not shown.

  const { pathname } = useLocation();
  const trackerState = pathname.split('/')[PAGE_LOC_NUM];
  const typeMovement: MovementTransactionType = trackerState.toLowerCase();
  const [currency, setCurrency] = useState<CurrencyType>(defaultCurrency);

  const [isReset, setIsReset] = useState<boolean>(false);
  const [isResetDropdown, setIsResetDropdown] = useState<boolean>(false);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [messageToUser, setMessageToUser] = useState<string | null>(null);
  // Zustand store action that updates the available balance.
  const setAvailableBudget = useBalanceStore(
    (state) => state.setAvailableBudget,
  );
  // useFormManager centralizes form handling, validation and event handlers.
  const {
    formData: incomeData,
    showValidation,
    validationMessages,
    handlers: {
      updateField,
      debouncedValidateField,
      createDropdownHandler,
      createTextareaHandler,
      updateCurrency,
      handleApiError,
    },

    validateAll,
    resetForm,
    activateAllValidations,

    setters: { setShowValidation, setValidationMessages, setFormData },
  } = useFormManager<IncomeInputDataType, IncomeValidatedDataType>(
    incomeSchema,
    initialIncomeData,
  );
  // The day this entry happened. Defaults to today, which is always inside the
  // window and always shows every account.
  const {
    transactionActualDate,
    isOpenOnChosenDay,
    dateProps: transactionDateProps,
  } = useTransactionDate();

  const fetchUrl = `${url_get_accounts_by_type}?type=bank&reload=${reloadTrigger}`;

  const {
    apiData: BankAccountsResponse,
    isLoading: isLoadingBankAccounts,
    error: fetchedErrorBankAccounts,
    status: bankAccountsStatus,
  } = useFetch<AccountByTypeResponseType>(fetchUrl as string);
 // The backend answers 404 "No accounts of type" for a user with none, and
 // useFetch turns that into error null. Status is null until a fetch ends.
 const isBankListSettled = !isLoadingBankAccounts && !fetchedErrorBankAccounts;
 const receivedBankAccounts = isBankListSettled
  ? (BankAccountsResponse?.data?.accountList ?? [])
  : [];
 const bankEmptyCase = resolveEmptyCase(
  isBankListSettled && bankAccountsStatus === 404,
  receivedBankAccounts.map((acc) => acc.account_start_date),
  transactionActualDate,
 );
  // Data transformation: account dropdown options, memoized to avoid recalculation.
  const optionsIncomeAccounts = useMemo(
    () =>
      BankAccountsResponse?.data?.accountList?.length &&
      !fetchedErrorBankAccounts &&
      !isLoadingBankAccounts
        ? BankAccountsResponse?.data.accountList
            // An account that did not exist on the chosen day is not a disabled
            // option, it is not an option.
            .filter((acc) => isOpenOnChosenDay(acc.account_start_date))
            .map((acc) => ({
              value: acc.account_name,
              label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code.toLowerCase()} ${acc.account_balance})`,
            }))
        : ACCOUNT_OPTIONS_DEFAULT,
    [
      BankAccountsResponse?.data.accountList,
      fetchedErrorBankAccounts,
      isLoadingBankAccounts,
      isOpenOnChosenDay,
    ],
  );

  const accountOptions = {
    title: 'Select Account',
    options: optionsIncomeAccounts,
    variant: VARIANT_DEFAULT,
  };
  const fetchSourceUrl = `${url_get_accounts_by_type}/?type=income_source&${reloadTrigger}`;
  const {
    apiData: sources,
    isLoading: isLoadingSources,
    error: errorSources,
    status: sourcesStatus,
  } = useFetch<AccountByTypeResponseType>(fetchSourceUrl as string);
 // Same empty answer as the bank list above.
 const isSourceListSettled = !isLoadingSources && !errorSources;
 const receivedSources = isSourceListSettled
  ? (sources?.data?.accountList ?? [])
  : [];
 const sourceEmptyCase = resolveEmptyCase(
  isSourceListSettled && sourcesStatus === 404,
  receivedSources.map((acc) => acc.account_start_date),
  transactionActualDate,
 );

  const sourceOptions = useMemo(
    () => ({
      title: sources && !isLoadingSources ? 'Source of income' : '',
      options:
        !errorSources && sources?.data.accountList.length
          ? sources?.data.accountList
              .filter((acc) => isOpenOnChosenDay(acc.account_start_date))
              .map((acc) => ({
                value: acc.account_name,
                label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${Math.abs(acc.account_balance)})`,
              }))
          : SOURCE_OPTIONS_DEFAULT,
      variant: VARIANT_DEFAULT as VariantType,
    }),
    [errorSources, isLoadingSources, sources, isOpenOnChosenDay],
  );

  // A selection may stop qualifying when the date moves back. Both fields are cleared and both dropdowns reset
  // together: clearing one while the other keeps its label would show a value the state no longer holds.
  useEffect(() => {
    const accountStillOffered =
      !incomeData.account ||
      optionsIncomeAccounts.some(
        (option) => option.value === incomeData.account,
      );

    const sourceStillOffered =
      !incomeData.source ||
      sourceOptions.options.some((option) => option.value === incomeData.source);

    if (accountStillOffered && sourceStillOffered) return;

    setFormData((prev) => ({ ...prev, account: '', source: '' }));
    setIsReset(true);
  }, [
    optionsIncomeAccounts,
    sourceOptions,
    incomeData.account,
    incomeData.source,
    setFormData,
  ]);
  type PayloadType = IncomeValidatedDataType & {
    user?: string;
    type?: string;
    // The day the movement happened, as the calendar label the server validates.
    transactionActualDate: string;
  };
  const {
    data,
    isLoading,
    error: postError,
    requestFn,
  } = useFetchLoad<MovementTransactionResponseType, PayloadType>({
    url: url_movement_transaction_record,
    method: 'POST',
  });

  // Fetches the total bank balance on demand, as an alternative to the useEffect Expense.tsx uses.
  const fetchNewBalance = useCallback(async () => {
    try {
      const balanceBankResponse = await authFetch<BalanceBankRespType>(
        `${url_get_total_account_balance_by_type}?type=bank`,
      );

      const total_balance = balanceBankResponse.data?.data.total_balance;

      if (typeof total_balance === 'number') {
        return total_balance;
      }
      return null;
    } catch (error) {
      console.error('Error fetching new balance:', error);
      return null;
    }
  }, []);

  const handleCurrencyChange = useCallback(
    (newCurrency: CurrencyType) => {
      setCurrency(newCurrency);
      updateCurrency(newCurrency);
    },
    [updateCurrency],
  );

  const handleSourceChange = createDropdownHandler('source');
  const handleAccountChange = createDropdownHandler('account');
  const handleNoteChange = createTextareaHandler('note');

  // Amount handler: entering an amount activates validation on all fields.
  const handleAmountChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = evt.target;
      updateField(name as keyof IncomeInputDataType, value);
      debouncedValidateField('amount', value);

      if (value) {
        setShowValidation({
          amount: true,
          account: true,
          source: true,
          note: true,
          currency: true,
        });
      }
    },
    [updateField, debouncedValidateField, setShowValidation],
  );
  // Save handler: validation, API request and reset. One path, two entries: the + button's click and Enter in
  // any field (via the form's onSubmit). The preventDefault below serves both and stops the + click from also
  // firing the submit.
  async function onSaveHandler(
    e: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    setMessageToUser(TRACKER_MESSAGES.processing);
    //--data validation messages --
    activateAllValidations();
    const { fieldErrors, dataValidated } = validateAll();
    if (Object.keys(fieldErrors).length > 0) {
      setValidationMessages(fieldErrors);
      setMessageToUser(TRACKER_MESSAGES.correction);
      setTimeout(() => {
        setMessageToUser(null);
      }, MESSAGE_DURATION.action);
      return;
    }
    // Server side: updates the balances of the bank account and of the income_source account (user_accounts)
    // and records both transaction descriptions with the corresponding account info.
    try {
      if (!dataValidated) {
        throw new Error(TRACKER_MESSAGES.validationFailure);
      }
      const payload: PayloadType = {
        ...(dataValidated as IncomeValidatedDataType & { type?: string }),
        type: typeMovement,
        transactionActualDate,
      };
      const postUrl = `${url_movement_transaction_record}/?movement=${typeMovement}`;

      const response = await requestFn(payload, {
        url: postUrl,
      } as AxiosRequestConfig);

      if (response?.error) {
        throw new Error(
          response?.error || postError || TRACKER_MESSAGES.submissionFailure,
        );
      }

      // Caches holding transaction-derived data are now stale. Issues no request.
      notifyTransactionRecorded();

      // After success, refresh the global available balance.
      const newTotalBalance = await fetchNewBalance();
      if (typeof newTotalBalance === 'number') {
        setAvailableBudget(newTotalBalance);
      }

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
        console.log(
          'Data from record transaction request:',
          data,
          response.data,
        );
      }
      setMessageToUser('Transaction successfully recorded!');
      resetForm(); //from useFormManager
      setCurrency(DEFAULT_CURRENCY);
      setReloadTrigger((prev) => prev + 1);
      setIsReset(true);
      setIsResetDropdown(true);
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.confirmation);

      // setTimeout(() => {
      //   setIsReset(false);
      // }, 1500);
    } catch (err) {
      console.error('Submission error:', postError);
      const errorMessage = handleApiError(err);
      setMessageToUser(errorMessage);
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.action);
    }
  }
  // Clears the UI reset flags shortly after they are raised.
  useEffect(() => {
    if (isReset || isResetDropdown) {
      const timer = setTimeout(() => {
        setIsReset(false);
        setIsResetDropdown(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReset, isResetDropdown]);
  const topCardElements = {
    titles: { title1: 'amount', title2: 'account' },
    value: incomeData.amount,
    selectOptions: accountOptions,
  };
  return (
    <>
      <form
        className='income'
        style={{ color: 'inherit' }}
        onSubmit={onSaveHandler}
      >
        <TopCard
          topCardElements={topCardElements}
          validationMessages={validationMessages}
          setValidationMessages={setValidationMessages}
          updateTrackerData={handleAmountChange}
          trackerName={trackerState}
          currency={currency}
          updateCurrency={handleCurrencyChange}
          setSelectState={setFormData}
          isReset={isReset}
          isResetDropdown={isResetDropdown}
          setIsReset={setIsReset}
          setIsResetDropdown={setIsResetDropdown}
          customSelectHandler={handleAccountChange}
          transactionDateProps={transactionDateProps}
          accountNotice={
            bankEmptyCase && (
              <EmptyListNotice
               kind='bank'
               action='record income'
               emptyCase={bankEmptyCase}
              />
            )
          }
        />
        <CardSeparator />
        <div className='state__card--bottom '>
          <div className='card--title card--title--top'>
            Source
            {/* Silent while the notice stands in for the dropdown below: that
                notice is this field's message. */}
            <span className='validation__errMsg'>
              {sourceEmptyCase ? '' : validationMessages['source']}
            </span>
          </div>

          {sourceEmptyCase ? (
            <EmptyListNotice
             kind='income_source'
             action='record income'
             emptyCase={sourceEmptyCase}
             linkShownElsewhere={noticeCarriesLink('bank', bankEmptyCase?.case)}
            />
          ) : (
            <DropDownSelection
              dropDownOptions={sourceOptions}
              updateOptionHandler={handleSourceChange}
              isReset={isReset}
              setIsReset={setIsReset}
            />
          )}

          <CardNoteSave
            title={'note'}
            validationMessages={validationMessages}
            dataHandler={handleNoteChange}
            inputNote={incomeData.note}
            onSaveHandler={onSaveHandler}
            // A notice stands where a dropdown would be, so there is nothing to
            // select and nothing the button could submit.
            isDisabled={
              isLoading ||
              isLoadingBankAccounts ||
              isLoadingSources ||
              !!bankEmptyCase ||
              !!sourceEmptyCase
            }
            showError={showValidation.note}
          />
        </div>
      </form>

      {messageToUser && (
        <div className='fade-message'>
          <MessageToUser
            isLoading={isLoading || isLoadingBankAccounts || isLoadingSources}
            error={postError || errorSources || fetchedErrorBankAccounts}
            messageToUser={messageToUser}
            variant='tracker'
            tone={
              messageToUser === TRACKER_MESSAGES.correction
                ? 'correction'
                : 'confirmation'
            }
          />
        </div>
      )}
    </>
  );
}
export default Income;

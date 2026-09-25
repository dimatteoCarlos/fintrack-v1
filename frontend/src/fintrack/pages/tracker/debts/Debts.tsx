// Custom validation, no Zod: validates the current field in real time and the whole form on submit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosRequestConfig } from 'axios';
import { useLocation } from 'react-router-dom';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import { useFetch } from '../../../hooks/useFetch.ts';
import useInputNumberHandler from '../../../hooks/useInputNumberHandler.ts';
import useBalanceStore from '../../../stores/useBalanceStore.ts';
import { notifyTransactionRecorded } from '../../../stores/transactionEvents.ts';
import { capitalize } from '../../../helpers/functions.ts';
import {
  checkNumberFormatValue,
  validateAmount,
  validationData,
} from '../../../validations/utils/custom_validation.ts';
import { fetchNewBalance } from '../../../../auth/auth_utils/fetchNewTotalBalance.ts';
import {
  url_get_accounts_by_type,
  url_movement_transaction_record,
} from '../../../../urlConfig.ts';
import CardNoteSave from '../components/CardNoteSave.tsx';
import EmptyListNotice, {
  resolveEmptyCase,
} from '../components/EmptyListNotice.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import RadioInput from '../../../general_components/radioInput/RadioInput.tsx';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import TopCard from '../components/TopCard.tsx';
import CardSeparator from '../components/CardSeparator.tsx';
import { useTransactionDate } from '../../../hooks/useTransactionDate.ts';
import {
  AccountByTypeResponseType,
  AccountListType,
  MovementTransactionResponseType,
} from '../../../types/responseApiTypes.ts';

import {
  CurrencyType,
  DebtsTrackerInputDataType,
  DebtsTransactionType,
  DropdownOptionType,
  FormNumberInputType,
  TopCardElementsType,
  VariantType,
} from '../../../types/types.ts';
import {
  DEBTOR_OPTIONS_DEFAULT,
  DEFAULT_CURRENCY,
  PAGE_LOC_NUM,
} from '../../../helpers/constants.ts';
import {
  MESSAGE_DURATION,
  noticeCarriesLink,
  TRACKER_MESSAGES,
} from '../trackerMessages.ts';

const VARIANT_DEFAULT: VariantType = 'tracker';
const defaultCurrency: CurrencyType = DEFAULT_CURRENCY;
const initialTrackerData: DebtsTrackerInputDataType = {
  amount: '',
  debtor: '',
  currency: defaultCurrency,
  type: 'lend',
  note: '',
  account: '',
  accountType: 'bank',
};

const initialFormData: FormNumberInputType = {
  amount: '',
};

const inputRadioOptionsDebtTransactionType = [
  { value: 'lend', label: 'lend' },
  { value: 'borrow', label: 'borrow' },
];
// Shown when the movement recorded but the balance could not be read back, so the figure on screen is stale;
// a named constant so the render can tell it apart from a plain confirmation (tone and announcement).
const BALANCE_STALE_PROMPT =
  'Debt recorded. The available balance could not be refreshed.';

function Debts(): JSX.Element {
  // Rule: lend/borrow is a deposit/withdrawal on the debtor account; the user must enter the type and pick
  // the counter account.
  const trackerState = useLocation().pathname.split('/')[PAGE_LOC_NUM];
  const typeMovement = trackerState.toLowerCase();
  const [currency, setCurrency] = useState<CurrencyType>(defaultCurrency);
  const [type, setType] = useState<DebtsTransactionType>('lend');

  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [isReset, setIsReset] = useState<boolean>(false);

  const [isResetAccount, setIsResetAccount] = useState<boolean>(true);

  const [datatrack, setDataTrack] =
    useState<DebtsTrackerInputDataType>(initialTrackerData);

  const [formData, setFormData] =
    useState<FormNumberInputType>(initialFormData);

  const [isAmountError, setIsAmountError] = useState<boolean>(false);

  const [messageToUser, setMessageToUser] = useState<string | null | undefined>(
    null,
  );
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const setAvailableBudget = useBalanceStore(
    (state) => state.setAvailableBudget,
  );
  // Maps account_name to account_id.
  const [accountIdMap, setAccountIdMap] = useState<{
    [accountName: string]: string;
  }>({});
  const [debtorIdMap, setDebtorIdMap] = useState<{
    [accountName: string]: string;
  }>({});

  const fetchDebtorUrl = `${url_get_accounts_by_type}/?type=debtor&reload=${reloadTrigger}`;

  const {
    apiData: debtorsResponse,
    error: fetchedErrorDebtors,
    isLoading: isLoadingDebtors,
    status: debtorsStatus,
  } = useFetch<AccountByTypeResponseType>(fetchDebtorUrl as string);

  // The day this entry happened. Defaults to today, which is always inside the
  // window and always shows every account.
  const {
    transactionActualDate,
    isOpenOnChosenDay,
    dateProps: transactionDateProps,
  } = useTransactionDate();

  const debtors = useMemo(() => {
    if (
      fetchedErrorDebtors ||
      isLoadingDebtors ||
      !debtorsResponse?.data.accountList.length
    )
      return DEBTOR_OPTIONS_DEFAULT;

    const newIdMap: { [accountName: string]: string } = {};

    // A debtor account that did not exist on the chosen day is not a disabled
    // option, it is not an option.
    const options = debtorsResponse?.data.accountList
      .filter((debtor) => isOpenOnChosenDay(debtor.account_start_date))
      .map((debtor) => {
      newIdMap[debtor.account_name] = String(debtor.account_id);

      return {
        label: `${debtor.account_name} (${debtor.currency_code} ${debtor.account_balance}) (${debtor.account_balance >= 0 ? 'Debtor' : 'Lender'})`,
        value: `${debtor.account_name}`,
      };
    });

    setDebtorIdMap(newIdMap);
    return options;
  }, [
    debtorsResponse?.data.accountList,
    fetchedErrorDebtors,
    isLoadingDebtors,
    isOpenOnChosenDay,
  ]);
  const debtorOptions = {
    title: debtorsResponse?.data.accountList.length
      ? 'Select Debtor/Lender'
      : '',
    options: debtors,
    variant: VARIANT_DEFAULT as VariantType,
  };
  // Counter accounts of the selected type.
  const fetchAccountUrl = `${url_get_accounts_by_type}/?type=${datatrack.accountType}&reload=${reloadTrigger}`;
  const {
    apiData: accountsResponse,
    isLoading: isLoadingAccounts,
    error: fetchedErrorAccounts,
    status: accountsStatus,
  } = useFetch<AccountByTypeResponseType>(fetchAccountUrl as string);
  // The backend answers 404 "No accounts of type" for a user with none, and
  // useFetch turns that into error null. Status is null until a fetch ends.
  // datatrack.accountType never leaves its initial 'bank', so this is the bank list.
  const isAccountListSettled = !isLoadingAccounts && !fetchedErrorAccounts;
  const receivedAccounts = isAccountListSettled
    ? (accountsResponse?.data?.accountList ?? [])
    : [];
  const accountEmptyCase = resolveEmptyCase(
    isAccountListSettled && accountsStatus === 404,
    receivedAccounts.map((acc) => acc.account_start_date),
    transactionActualDate,
  );

  const isDebtorListSettled = !isLoadingDebtors && !fetchedErrorDebtors;
  const receivedDebtors = isDebtorListSettled
    ? (debtorsResponse?.data?.accountList ?? [])
    : [];
  const debtorEmptyCase = resolveEmptyCase(
    isDebtorListSettled && debtorsStatus === 404,
    receivedDebtors.map((debtor) => debtor.account_start_date),
    transactionActualDate,
  );
  // NewProfile needs a bank account to open a debtor, so while the bank notice
  // offers its link the debtor notice states its fact without one: they are one
  // sequence, not two alternatives.
  const isDebtorLinkDeferred = noticeCarriesLink('bank', accountEmptyCase?.case);

  const optionsAccounts = useMemo(() => {
    if (fetchedErrorAccounts) {
      return [];
    }
    const optionsAccountList = (
      accountsResponse?.data.accountList ?? []
    ).filter((acc: AccountListType) => isOpenOnChosenDay(acc.account_start_date));
    const idMap: { [accountName: string]: string } = {};

    const options = optionsAccountList.length
      ? optionsAccountList.map((acc: AccountListType) => {
          idMap[acc.account_name] = acc.account_id.toString();
          return {
            label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${acc.account_balance})`,
            value: acc.account_name,
          };
        })
      : [];

    setAccountIdMap(idMap);
    return options;
  }, [
    accountsResponse?.data.accountList,
    fetchedErrorAccounts,
    isOpenOnChosenDay,
  ]);

  // A selection may stop qualifying when the date moves back. Both fields are cleared and both dropdowns reset
  // together: clearing one while the other keeps its label would show a value the state no longer holds.
  useEffect(() => {
    const debtorStillOffered =
      !datatrack.debtor ||
      debtors.some((option) => option.value === datatrack.debtor);

    const accountStillOffered =
      !datatrack.account ||
      optionsAccounts.some((option) => option.value === datatrack.account);

    if (debtorStillOffered && accountStillOffered) return;

    setDataTrack((prev) => ({ ...prev, debtor: '', account: '' }));
    setIsReset(true);
  }, [debtors, optionsAccounts, datatrack.debtor, datatrack.account]);

  const accountOptionsToRender = {
    title: accountsResponse?.data?.accountList?.length ? 'Select account' : '',
    options: optionsAccounts,
    variant: VARIANT_DEFAULT as VariantType,
  };
  type PayloadType = DebtsTrackerInputDataType & {
    user?: string;
    debtor_id?: string;
    account_id?: string;
    // The day the movement happened, as the calendar label the server validates.
    transactionActualDate: string;
  };
  const {
    data,
    isLoading,
    error: postError,
    requestFn,
    resetFn,
  } = useFetchLoad<MovementTransactionResponseType, PayloadType>({
    url: url_movement_transaction_record,
    method: 'POST',
  });
  const error = fetchedErrorDebtors || fetchedErrorAccounts || postError;
  const updateDataCurrency = useCallback((currency: CurrencyType) => {
    setCurrency(currency);
    setDataTrack((prev) => ({ ...prev, currency: currency }));
  }, []);
  const { inputNumberHandlerFn } = useInputNumberHandler(
    setFormData, //numeric state
    setValidationMessages, //validation message for amount
    setDataTrack, //setStateData with valueToSave in db
    setIsAmountError,
    setMessageToUser,
    currency,
  );
  function updateTrackerData(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    e.preventDefault();
    const { name, value } = e.target;

    if (name === 'amount') {
      // inputNumberHandlerFn sets the typed amount, its format or error message and the value to save.
      inputNumberHandlerFn(name, value);
      // Enable the field validations once an amount is entered.
      if (value !== '') {
        setShowValidation((prev) => ({
          ...prev,
          debtor: true,
          account: true,
          note: true,
        }));
      }
      // Immediate amount validation.
      if (isAmountError) {
        return;
      }
      const errorValidationAmount = validateAmount(value, currency);

      console.log(
        '🚀 ~ updateTrackerData ~ errorValidationAmount:',
        errorValidationAmount,
      );

      if (errorValidationAmount) {
        setValidationMessages((prev) => ({
          ...prev,
          [name]: errorValidationAmount,
        }));
        setIsAmountError(true);
        return;
      }
    } else {
      setDataTrack((prev) => ({ ...prev, [name]: value }));

      // Local validation of the changed field.
      setValidationMessages((prev) => {
        const updatedErrorMessages = { ...prev };

        if (value === '' || value === null) {
          updatedErrorMessages[name] =
            `* Please provide the ${capitalize(name)}`;
        } else if (!isNaN(Number(value)) && Number(value) <= 0) {
          updatedErrorMessages[name] =
            `* ${capitalize(name)} negative or zero values are not allowed`;
        } else {
          delete updatedErrorMessages[name];
        }

        return updatedErrorMessages;
      });
    }
  }
  function handleTransactionTypeChange(newType: DebtsTransactionType) {
    setDataTrack((prev) => ({ ...prev, type: newType }));
  }
  function accountSelectHandler(selectedOption: DropdownOptionType | null) {
    setDataTrack((prev) => ({
      ...prev,
      ['account']: selectedOption?.value || '',
    }));
    setValidationMessages((prev) => ({ ...prev, account: '' }));
  }
  // One path, two entries: the + button's click and Enter in any field (via the form's onSubmit). The
  // preventDefault below serves both and stops the + click from also firing the submit.
  async function onSaveHandler(
    e: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    if (resetFn) resetFn();

    //show all validation messages
    setShowValidation({
      amount: true,
      debtor: true,
      account: true,
      note: true,
    });
    const amountString = formData.amount;
    const amountChecked = checkNumberFormatValue(amountString, currency);

    if (amountChecked.isError && !amountChecked.valueToSave) {
      setValidationMessages((prev) => ({
        ...prev,
        amount: amountChecked.formatMessage,
      }));
      setDataTrack((prev) => ({ ...prev, amount: '' })); //string type
      return;
    }
    setValidationMessages((prev) => ({ ...prev, amount: '' }));
    setDataTrack((prev) => ({
      ...prev,
      amount: amountChecked?.valueToSave as number,
    }));
    const newValidationMessages = validationData(datatrack);

    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }
    // The user id travels in the request body (a query parameter would also work).
    try {
      const debtorId = debtorIdMap[datatrack.debtor];
      const accountId = accountIdMap[datatrack.account];
      const payload = {
        ...datatrack,
        debtor_id: debtorId,
        account_id: accountId,
        transactionActualDate,
      } as PayloadType;
      const postUrl = `${url_movement_transaction_record}/?movement=${typeMovement}`;
      const { data, error: postError } = await requestFn(payload, {
        url: postUrl,
      } as AxiosRequestConfig);

      if (postError) {
        const errorMsg = postError ?? 'unexpected error';
        throw new Error(errorMsg);
      }

      // Caches holding transaction-derived data are now stale. Issues no request.
      notifyTransactionRecorded();

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
        console.log('Data from record transaction request:', data);
      }
      // Refresh the global available balance (the total in bank accounts) after success.
      const newTotalBalance = await fetchNewBalance();
      // console.log('newTotalBalance', newTotalBalance)
      // The success message must not overwrite the refresh warning in the same tick.
      // The movement is recorded either way, so the failing branch still says so.
      const isBalanceRefreshed = typeof newTotalBalance === 'number';

      if (isBalanceRefreshed) {
        setAvailableBudget(newTotalBalance);
        setMessageToUser('Debt transaction successfully recorded!');
      } else {
        setMessageToUser(BALANCE_STALE_PROMPT);
      }
      // The stale-balance warning is something the owner has to act on; the
      // plain confirmation is not, so the two do not stay on screen equally.
      setTimeout(
        () => setMessageToUser(null),
        isBalanceRefreshed
          ? MESSAGE_DURATION.confirmation
          : MESSAGE_DURATION.action,
      );
      //----------------------------------
    } catch (error) {
      console.error('Submission error (Zod):', error);
      setMessageToUser(
        error instanceof Error
          ? error.message
          : TRACKER_MESSAGES.submissionFailure,
      );
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.action);
    }
  }
  useEffect(() => {
    // if( !isLoading){setShowMessage(true);}
    const isMovementRecorded =
      Boolean(data) && !isLoading && !error && !isAmountError;

    if (isMovementRecorded) {
      // setShowMessage(true);
      //--success
      setMessageToUser('Movement completed successfully!');

      if (resetFn) resetFn();
      //if success, reset the state and the selected options on select component
      setIsReset(true);
      setValidationMessages({});
      setFormData(initialFormData);
      setReloadTrigger((prev) => prev + 1);
      setCurrency(defaultCurrency);
      setDataTrack({
        ...initialTrackerData,
        currency: defaultCurrency,
      });
      setType('lend');
      updateDataCurrency(defaultCurrency);
      setShowValidation({
        amount: false,
        debtor: false,
        account: false,
        note: false,
      });
    } else if (!isLoading && (error || isAmountError)) {
      setMessageToUser(error ?? (isAmountError ? 'Enter a valid amount' : ''));
    }

    // The branch above decides what is on screen, so it decides how long it stays.
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => {
        setMessageToUser(null);
        // setIsReset(false);
      },
      isMovementRecorded
        ? MESSAGE_DURATION.confirmation
        : MESSAGE_DURATION.action,
    );

    return () => {
      if (timer) clearTimeout(timer);
      setTimeout(() => {
        setIsReset(false);
      }, 100);
    };
  }, [data, error, isLoading, updateDataCurrency, isAmountError, resetFn]);
  //error messages rendering control
  const [showValidation, setShowValidation] = useState({
    amount: false,
    debtor: false,
    account: false,
    note: false,
  });
  useEffect(() => {
    setDataTrack((prev) => ({ ...prev, type: type }));
  }, [type]);
  useEffect(() => {
    // Show debtor validation only once an amount is entered.
    if (
      datatrack.debtor === '' &&
      (formData.amount !== '' ||
        validationMessages.amount ||
        showValidation.debtor)
    ) {
      setValidationMessages((prev) => ({
        ...prev,
        debtor: `* Please select the ${datatrack.type === 'lend' ? 'Debtor' : 'Lender'}`,
      }));
      setShowValidation((prev) => ({ ...prev, debtor: true }));
    } else {
      setValidationMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages.debtor;
        return newMessages;
      });
    }
  }, [
    datatrack.debtor,
    datatrack.type,
    formData.amount,
    showValidation.debtor,
    validationMessages.amount,
  ]);
  useEffect(() => {
    // show account validation messages after amount has been entered
    if (
      datatrack.account === '' &&
      (formData.amount !== '' || showValidation.account)
    ) {
      setValidationMessages((prev) => ({
        ...prev,
        account: TRACKER_MESSAGES.accountFieldRequired,
      }));
      setShowValidation((prev) => ({ ...prev, account: true }));
    } else {
      setValidationMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages.account;
        return newMessages;
      });
    }
  }, [datatrack.account, formData.amount, showValidation.account]);
  useEffect(() => {
    // show note validation message only if amount is entered
    if (
      datatrack.note === '' &&
      (formData.amount !== '' || showValidation.note)
    ) {
      setValidationMessages((prev) => ({
        ...prev,
        note: TRACKER_MESSAGES.noteFieldRequired,
      }));
      setShowValidation((prev) => ({ ...prev, note: true }));
    } else {
      setValidationMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages.note;
        return newMessages;
      });
    }
  }, [datatrack.note, formData.amount, showValidation.note]);
  const debtorAccountLabel = datatrack.type === 'lend' ? 'debtor' : 'lender';
  const topCardElements: TopCardElementsType = {
    titles: { title1: 'amount', title2: 'debtor', label2: debtorAccountLabel },
    value: formData.amount,
    selectOptions: debtorOptions,
  };
  return (
    <>
      <form
        className='debts'
        style={{ color: 'inherit' }}
        onSubmit={onSaveHandler}
      >
        <TopCard
          topCardElements={topCardElements}
          validationMessages={validationMessages}
          setValidationMessages={setValidationMessages}
          updateTrackerData={updateTrackerData}
          trackerName={trackerState}
          currency={currency}
          updateCurrency={updateDataCurrency}
          setSelectState={setDataTrack}
          isReset={isReset}
          setIsReset={setIsReset}
          transactionDateProps={transactionDateProps}
          accountNotice={
            debtorEmptyCase && (
              <EmptyListNotice
               kind='debtor'
               action='record a debt movement'
               emptyCase={debtorEmptyCase}
               linkShownElsewhere={isDebtorLinkDeferred}
              />
            )
          }
        />

        <CardSeparator />

        <div className='state__card--bottom'>
          <div className='account card--title card--title--top'>
            {datatrack.type === 'lend' ? 'From:' : 'To:'}

            <RadioInput
              radioOptionSelected={datatrack.type ?? initialTrackerData.type!}
              inputRadioOptions={inputRadioOptionsDebtTransactionType}
              setRadioOptionSelected={handleTransactionTypeChange}
              title={''}
              labelId='transaction'
              disabled={isLoading || isLoadingAccounts || isLoadingDebtors}
            />
          </div>

          {/* Silent while the notice stands in for the dropdown below: that
              notice is this field's message. */}
          <div className='validation__errMsg'>
            {!accountEmptyCase &&
              showValidation.account &&
              validationMessages['account']}
          </div>

          {accountEmptyCase ? (
            <EmptyListNotice
             kind='bank'
             action='record a debt movement'
             emptyCase={accountEmptyCase}
            />
          ) : (
            <DropDownSelection
              dropDownOptions={accountOptionsToRender}
              updateOptionHandler={accountSelectHandler}
              isReset={isReset}
              setIsReset={setIsReset}
              setIsResetDropdown={setIsResetAccount}
              isResetDropdown={isResetAccount}
            />
          )}

          <CardNoteSave
            title={'note'}
            validationMessages={validationMessages}
            dataHandler={updateTrackerData}
            inputNote={datatrack.note}
            onSaveHandler={onSaveHandler}
            // A notice stands where a dropdown would be, so there is nothing to
            // select and nothing the button could submit.
            isDisabled={
              isLoading ||
              isLoadingAccounts ||
              isLoadingDebtors ||
              !!accountEmptyCase ||
              !!debtorEmptyCase
            }
            showError={showValidation.note}
          />
        </div>
      </form>

      {messageToUser && (
        <div className='fade-message'>
          <MessageToUser
            isLoading={isLoading || isLoadingAccounts || isLoadingDebtors}
            error={error || fetchedErrorDebtors}
            messageToUser={messageToUser}
            variant='tracker'
            tone={
              messageToUser === BALANCE_STALE_PROMPT
                ? 'correction'
                : 'confirmation'
            }
          />
        </div>
      )}
    </>
  );
}

export default Debts;

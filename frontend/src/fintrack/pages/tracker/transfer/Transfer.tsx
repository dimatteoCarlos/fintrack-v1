import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosRequestConfig } from 'axios';
import { useLocation } from 'react-router-dom';

import { useFetch } from '../../../hooks/useFetch.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';

import useFormManager from '../../../hooks/useFormManager.ts';

import useBalanceStore from '../../../stores/useBalanceStore.ts';
import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { notifyTransactionRecorded } from '../../../stores/transactionEvents.ts';
import {
  url_get_accounts_by_type,
  url_movement_transaction_record,
  url_get_total_account_balance_by_type,
} from '../../../../urlConfig.ts';

import {
  DEFAULT_CURRENCY,
  CURRENCY_OPTIONS,
  ACCOUNT_OPTIONS_DEFAULT,
  PAGE_LOC_NUM,
} from '../../../helpers/constants.ts';

import type {
  DropdownOptionType,
  CurrencyType,
  MovementInputDataType,
  TransferAccountType,
  VariantType,
} from '../../../types/types.ts';

import type {
  AccountByTypeResponseType,
  AccountListType,
  MovementTransactionResponseType,
  BalanceBankRespType,
} from '../../../types/responseApiTypes.ts';

import { currencyFormat } from '../../../helpers/functions.ts';
import { isUnbudgeted } from '../../../helpers/budgetStatus.ts';

import { transferSchema } from '../../../validations/zod_schemas/trackerMovementSchema.ts';
import { MovementValidatedDataType } from '../../../validations/types.ts';

import TopCard from '../components/TopCard.tsx';
import CardSeparator from '../components/CardSeparator.tsx';
import { useTransactionDate } from '../../../hooks/useTransactionDate.ts';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import CardNoteSave from '../components/CardNoteSave.tsx';
import RadioInput from '../../../general_components/radioInput/RadioInput.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import { fetchNewBalance } from '../../../../auth/auth_utils/fetchNewTotalBalance.ts';
export type ShowValidationType = {
  amount: boolean;
  origin: boolean;
  currency: boolean;
  destination: boolean;
  note: boolean;
  originAccountType: boolean;
  destinationAccountType: boolean;
};

type RadioOptionType<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

const defaultCurrency = DEFAULT_CURRENCY;

const initialMovementData: MovementInputDataType = {
  amount: '',
  origin: '',
  destination: '',

  originAccountId: undefined,
  destinationAccountId: undefined,

  note: '',
  currency: defaultCurrency,

  originAccountType: 'bank',
  destinationAccountType: 'investment',
};
const VARIANT_DEFAULT: VariantType = 'tracker';

const inputRadioOptionsAccountTopCard: RadioOptionType<TransferAccountType>[] =
  [
    { value: 'bank', label: 'Bank' },
    { value: 'investment', label: 'Invest' },
    { value: 'category_budget', label: 'Rev.Expense' },
  ];

const inputRadioOptionsAccountBottomCard: RadioOptionType<TransferAccountType>[] =
  [
    { value: 'bank', label: 'Bank' },
    { value: 'investment', label: 'Invest' },
    { value: 'income_source', label: 'Rev. Income' },
  ];
// The one message on this screen that is not a confirmation; compared exactly
// rather than inferred from validation state (see Expense.tsx for why).
const CORRECTION_PROMPT = 'Please correct the fields';

function Transfer(): JSX.Element {
  const router = useLocation();
  const trackerState = router.pathname.split('/')[PAGE_LOC_NUM];
  const typeMovement = trackerState.toLowerCase();
  const [isReset, setIsReset] = useState<boolean>(false);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [messageToUser, setMessageToUser] = useState<string | null | undefined>(
    null,
  );

  const [showMessage, setShowMessage] = useState(false);

  const [isResetOriginAccount, setIsResetOriginAccount] =
    useState<boolean>(true);

  const [isResetDestinationAccount, setIsResetDestinationAccount] =
    useState<boolean>(true);
  const setAvailableBudget = useBalanceStore(
    (state) => state.setAvailableBudget,
  );
  const {
    formData,
    showValidation,
    validationMessages,
    handlers: {
      createNumberHandler,
      createTextareaHandler,
      updateCurrency,
      handleApiError,
    },

    validateAll,
    resetForm,
    activateAllValidations,

    setters: { setValidationMessages, setFormData },
  } = useFormManager<MovementInputDataType, MovementValidatedDataType>(
    transferSchema,
    initialMovementData,
  );
  const fetchOriginAccountUrl = `${url_get_accounts_by_type}?type=${formData.originAccountType}&reload=${reloadTrigger}`;

  const {
    apiData: originAccountsResponse,
    isLoading: isLoadingOriginAccounts,
    error: fetchedErrorOriginAccounts,
  } = useFetch<AccountByTypeResponseType>(fetchOriginAccountUrl as string);

  // Only a category_budget origin needs this month's spend against budget joined in: its account_balance is
  // a lifetime accumulator, while bank and investment running balances are already right.
  const isCategoryOrigin = formData.originAccountType === 'category_budget';

  // Month the budget figures report on. Undefined is sent as an omitted month, so
  // the server resolves the current one on the owner's calendar, not the browser
  // clock.
  const budgetMonth: string | undefined = undefined;

  const budgetAccounts = useBudgetStatusStore((state) => state.accounts);
  const isLoadingBudgetStatus = useBudgetStatusStore(
    (state) => state.isLoading,
  );
  const fetchBudgetStatus = useBudgetStatusStore((state) => state.fetchStatus);

  // Only the category origin fetches; bank and investment origins need no budget
  // figure. reloadTrigger is a dependency because a recorded movement invalidates
  // the store's memo.
  useEffect(() => {
    if (!isCategoryOrigin) return;

    void fetchBudgetStatus(budgetMonth);
  }, [isCategoryOrigin, fetchBudgetStatus, budgetMonth, reloadTrigger]);

  // Joined on account_id, the one key both payloads carry; a name is only what
  // the dropdown submits.
  const budgetStatusByAccountId = useMemo(
    () => new Map(budgetAccounts.map((account) => [account.accountId, account])),
    [budgetAccounts],
  );

  // Shared by both origin memos below, so the printed label cannot differ
  // depending on whether a destination is already chosen.
  const buildOriginLabel = useCallback(
    (acc: AccountListType): string => {
      if (!isCategoryOrigin) {
        return `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${acc.account_balance})`;
      }

      const status = budgetStatusByAccountId.get(acc.account_id);

      // While status is loading or missing show only the name: account_balance would put a lifetime figure
      // under a monthly label. Nothing budgeted and nothing spent counts as no budget, as on budget screens.
      if (
        !status ||
        isLoadingBudgetStatus ||
        !Number.isFinite(status.actualSpent) ||
        !Number.isFinite(status.budgetAmount) ||
        isUnbudgeted(status.budgetAmount, status.actualSpent)
      ) {
        return acc.account_name;
      }

      // currencyFormat already emits the symbol, so the bare currency code the
      // other branch prefixes would repeat it.
      const spent = currencyFormat(status.currency, status.actualSpent, CURRENCY_OPTIONS[status.currency]);
      const budget = currencyFormat(
        status.currency,
        status.budgetAmount,
        CURRENCY_OPTIONS[status.currency],
      );

      return `${acc.account_name} (${spent} / ${budget})`;
    },
    [isCategoryOrigin, budgetStatusByAccountId, isLoadingBudgetStatus],
  );
  // The day this entry happened. Defaults to today, which is always inside the
  // window and always shows every account.
  const {
    transactionActualDate,
    isOpenOnChosenDay,
    dateProps: transactionDateProps,
  } = useTransactionDate();

  const optionsOriginAccounts = useMemo(() => {
    if (fetchedErrorOriginAccounts) {
      return ACCOUNT_OPTIONS_DEFAULT;
    }
    // An account that did not exist on the chosen day is not a disabled option,
    // it is not an option.
    const originAccountList = (
      originAccountsResponse?.data?.accountList ?? []
    ).filter((acc) => isOpenOnChosenDay(acc.account_start_date));

    return originAccountList.length
      ? originAccountList.map((acc) => ({
          value: acc.account_name,
          label: buildOriginLabel(acc),
        }))
      : ACCOUNT_OPTIONS_DEFAULT;
  }, [
    originAccountsResponse?.data.accountList,
    fetchedErrorOriginAccounts,
    buildOriginLabel,
    isOpenOnChosenDay,
  ]);
  const filteredOriginOptions = useMemo(() => {
    if (!formData.destinationAccountId) {
      return optionsOriginAccounts;
    }
    const originAccountList = (
      originAccountsResponse?.data?.accountList ?? []
    ).filter((acc) => isOpenOnChosenDay(acc.account_start_date));

    const filteredAccounts = originAccountList.length
      ? originAccountList.filter(
          (acc) => acc.account_id !== formData.destinationAccountId,
        )
      : originAccountList;

    return filteredAccounts.map((acc) => ({
      value: acc.account_name,
      label: buildOriginLabel(acc),
    }));
  }, [
    formData.destinationAccountId,
    originAccountsResponse?.data.accountList,
    optionsOriginAccounts,
    buildOriginLabel,
    isOpenOnChosenDay,
  ]);

  const originAccountOptionsToRender = {
    title: originAccountsResponse?.data?.accountList.length
      ? 'Select Account'
      : '',
    options: filteredOriginOptions,
    variant: VARIANT_DEFAULT as VariantType,
  };
  const fetchDestinationAccountUrl = formData.destinationAccountType
    ? `${url_get_accounts_by_type}?type=${formData.destinationAccountType}&${reloadTrigger}`
    : undefined;

  const {
    apiData: destinationAccountsResponse,
    isLoading: isLoadingDestinationAccounts,
    error: fetchedErrorDestinationAccounts,
  } = useFetch<AccountByTypeResponseType>(fetchDestinationAccountUrl as string);

  // Total balance, refetched when reloadTrigger changes.
  const balanceBankResponse = useFetch<BalanceBankRespType>(
    `${url_get_total_account_balance_by_type}/?type=bank&v=${reloadTrigger}`,
  );

  const destinationAccountOptions = useMemo(
    () => ({
      title: destinationAccountsResponse?.data.accountList.length
        ? 'Select Account'
        : '',

      options:
        destinationAccountsResponse?.data?.accountList
          ?.filter(
            (dest) =>
              dest.account_id !== formData.originAccountId &&
              isOpenOnChosenDay(dest.account_start_date),
          )
          .map((acc) => ({
            value: acc.account_name,
            // An income source's balance sums withdraw legs and reads negative;
            // show what it has paid in, unsigned, as Income.tsx does.
            label: `${acc.account_name} (${acc.currency_code} ${
              formData.destinationAccountType === 'income_source'
                ? Math.abs(acc.account_balance)
                : acc.account_balance
            })`,
          })) || ACCOUNT_OPTIONS_DEFAULT,
      variant: VARIANT_DEFAULT,
    }),
    [
      destinationAccountsResponse,
      formData.originAccountId,
      formData.destinationAccountType,
      isOpenOnChosenDay,
    ],
  );

  // A selection may stop qualifying when the date moves back. Both legs are
  // cleared and both dropdowns reset together: clearing one while the other keeps
  // its label would show a value the state no longer holds.
  useEffect(() => {
    const originStillOffered =
      !formData.origin ||
      filteredOriginOptions.some((option) => option.value === formData.origin);

    const destinationStillOffered =
      !formData.destination ||
      destinationAccountOptions.options.some(
        (option) => option.value === formData.destination,
      );

    if (originStillOffered && destinationStillOffered) return;

    setFormData((prev) => ({
      ...prev,
      origin: '',
      originAccountId: undefined,
      destination: '',
      destinationAccountId: undefined,
    }));
    setIsReset(true);
  }, [
    filteredOriginOptions,
    destinationAccountOptions,
    formData.origin,
    formData.destination,
    setFormData,
  ]);

  type PayloadType = MovementValidatedDataType & {
    user?: string;
    type?: string;
    // The day the movement happened, as the calendar label the server validates.
    transactionActualDate: string;
  };
  const {
    isLoading,
    error: errorPost,
    requestFn,
    resetFn,
  } = useFetchLoad<MovementTransactionResponseType, PayloadType>({
    url: url_movement_transaction_record,
    method: 'POST',
  });

  const error =
    errorPost || fetchedErrorDestinationAccounts || fetchedErrorOriginAccounts;

  useEffect(() => {
    const total_balance = balanceBankResponse.apiData?.data?.total_balance;
    if (typeof total_balance === 'number') {
      setAvailableBudget(total_balance);
    }
  }, [balanceBankResponse.apiData, setAvailableBudget]);

  const handleAmountChange = createNumberHandler('amount');

  const handleCurrencyChange = useCallback(
    (newCurrency: CurrencyType) => {
      updateCurrency(newCurrency);
    },
    [updateCurrency],
  );
  const handleOriginChange = useCallback(
    (selectedOption: DropdownOptionType | null) => {
      const accountName = selectedOption?.value || '';

      const selectedAccount = originAccountsResponse?.data?.accountList?.find(
        (acc) => acc.account_name === accountName,
      );

      setFormData((prev) => ({
        ...prev,
        origin: accountName,
        originAccountId: selectedAccount?.account_id,
      }));

      if (accountName) {
        setValidationMessages((prev) => ({ ...prev, origin: '' }));
      }
    },
    [
      originAccountsResponse?.data?.accountList,
      setFormData,
      setValidationMessages,
    ],
  );

  const handleDestinationChange = useCallback(
    (selectedOption: DropdownOptionType | null) => {
      const accountName = selectedOption?.value || '';
      const selectedAccount =
        destinationAccountsResponse?.data.accountList.find(
          (acc) => acc.account_name === accountName,
        );
      setFormData((prev) => ({
        ...prev,
        destination: accountName,
        destinationAccountId: selectedAccount?.account_id,
      }));
      if (accountName) {
        setValidationMessages((prev) => ({ ...prev, destination: '' }));
      }
    },
    [
      destinationAccountsResponse?.data?.accountList,
      setFormData,
      setValidationMessages,
    ],
  );

  const handleNoteChange = createTextareaHandler('note');
  const handleOriginAccountTypeChange = useCallback(
    (newType: string) => {
      setFormData((prev) => ({
        ...prev,
        originAccountType: newType as Exclude<
          TransferAccountType,
          'income_source'
        >,
        origin: '',
        originAccountId: undefined,
      }));
      setValidationMessages((prev) => ({ ...prev, origin: '' }));
      // Force the dropdown to reset: deactivate now, reactivate on the next render.
      setIsResetOriginAccount(false);
      setTimeout(() => setIsResetOriginAccount(true), 10);
    },
    [setFormData, setValidationMessages],
  );

  const handleDestinationAccountTypeChange = useCallback(
    (newType: string) => {
      setFormData((prev) => ({
        ...prev,
        destinationAccountType: newType as Exclude<
          TransferAccountType,
          'category_budget'
        >,
        destination: '',
        destinationAccountId: undefined,
      }));

      setValidationMessages((prev) => ({ ...prev, destination: '' }));
      // Force the dropdown to reset: deactivate now, reactivate on the next render.
      setIsResetDestinationAccount(false);
      setTimeout(() => setIsResetDestinationAccount(true), 10);
    },
    [setFormData, setValidationMessages],
  );

  // BUSINESS RULE: no transfer between an expense category and an income source.
  // Each side disables the option that would pair with what the other side holds,
  // so the combination cannot be selected. The server refuses it as well.
  const originTypeOptions = inputRadioOptionsAccountTopCard.map((option) => ({
    ...option,
    disabled:
      option.value === 'category_budget' &&
      formData.destinationAccountType === 'income_source',
  }));

  const destinationTypeOptions = inputRadioOptionsAccountBottomCard.map(
    (option) => ({
      ...option,
      disabled:
        option.value === 'income_source' &&
        formData.originAccountType === 'category_budget',
    }),
  );

  // One path, two entries: the + button's click and Enter in any field (via the
  // form's onSubmit). preventDefault serves both, so clicking + does not also
  // submit the form.
  async function onSaveHandler(
    e: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    if (resetFn) resetFn();
    setShowMessage(true);
    setMessageToUser('Processing transaction...');
    activateAllValidations();
    
    const { fieldErrors, dataValidated } = validateAll();
    
    console.log('🔍 [DEBUG] formData.currency:', formData.currency);
    console.log('🔍 [DEBUG] formData.amount:', formData.amount);
    console.log('🔍 [DEBUG] fieldErrors completo:', fieldErrors);
    console.log('🔍 [DEBUG] fieldErrors keys length:', Object.keys(fieldErrors).length);
    console.log('🔍 [DEBUG] fieldErrors stringified:', JSON.stringify(fieldErrors));
        
    if (formData.origin === formData.destination) {
      fieldErrors.destination = 'Origin and destination must be different';
    }

    if (Object.keys(fieldErrors).length > 0) {
    console.log('🔍 [DEBUG] Entrando al if de fieldErrors');
    
      setValidationMessages(fieldErrors);
      setMessageToUser(CORRECTION_PROMPT);
      setTimeout(() => {
        setShowMessage(false);
        setMessageToUser(null);
      }, 4000);
      return;
    }
    // The POST updates the account balances (user_accounts) and records both legs,
    // transfer and receive, with the matching account info.
    try {
      if (!dataValidated) {
        throw new Error('Validation failed. Please check your inputs.');
      }
      const payload: PayloadType = {
        ...dataValidated,
        type: typeMovement,
        transactionActualDate,
      };

      const finalUrl = `${url_movement_transaction_record}/?movement=${typeMovement}`;
      const response = await requestFn(payload, {
        url: finalUrl,
      } as AxiosRequestConfig);

      if (response?.error) {
        throw new Error(
          response?.error ||
            error ||
            'An unexpected error occurred during submission.',
        );
      }

      // Caches holding transaction-derived data are now stale. Issues no request.
      notifyTransactionRecorded();

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
      }
      const newTotalBalance = await fetchNewBalance();
      if (typeof newTotalBalance === 'number') {
        setAvailableBudget(newTotalBalance);
      }

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
      }
      setMessageToUser('Transaction recorded successfully!');
      setShowMessage(true);
      resetForm();
      setReloadTrigger((prev) => prev + 1);
      setIsReset(true);
      setTimeout(() => {
        setMessageToUser(null);
        setShowMessage(false);
        setIsReset(false);
      }, 4000);

      if (resetFn) resetFn();
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = handleApiError(error);
      setMessageToUser(errorMessage);
      setTimeout(() => {
        setMessageToUser(null);
        setShowMessage(false);
      }, 5000);
    }
  }
  useEffect(() => {
    if (isReset) {
      const timer = setTimeout(() => {
        setIsReset(false);
        setIsResetOriginAccount(false);
        setIsResetDestinationAccount(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReset]);
  const topCardElements = {
    titles: { title1: 'amount', title2: 'origin', label2: 'From: ' }, // match validationMessages keys
    value: formData.amount,
    selectOptions: originAccountOptionsToRender,
  };

  return (
    <>
      <form
        autoComplete={'off'}
        className='transfer'
        style={{ color: 'inherit' }}
        onSubmit={onSaveHandler}
      >
        <TopCard
          topCardElements={topCardElements}
          validationMessages={validationMessages}
          setValidationMessages={setValidationMessages}
          updateTrackerData={handleAmountChange}
          trackerName={trackerState}
          currency={formData.currency}
          updateCurrency={handleCurrencyChange}
          setSelectState={setFormData}
          isReset={isReset}
          setIsReset={setIsReset}
          isResetDropdown={isResetOriginAccount}
          setIsResetDropdown={setIsResetOriginAccount}
          customSelectHandler={handleOriginChange}
          radioInputProps={{
            radioOptionSelected:
              formData.originAccountType ??
              initialMovementData.originAccountType!,
            inputRadioOptions: originTypeOptions,
            setRadioOptionSelected: handleOriginAccountTypeChange,
            title: '',
            disabled:
              isLoading ||
              isLoadingOriginAccounts ||
              isLoadingDestinationAccounts,
            accountTypeSelectionMode: 'inputChipMode',
            labelId: 'origin',
          }}
          transactionDateProps={transactionDateProps}
        />

        <CardSeparator />

        <div className='state__card--bottom'>
          <div className='account card--title card--title--top'>
            <span className='account-label'>To:</span>
            <RadioInput
              radioOptionSelected={
                formData.destinationAccountType ??
                initialMovementData.destinationAccountType!
              }
              inputRadioOptions={destinationTypeOptions}
              setRadioOptionSelected={handleDestinationAccountTypeChange}
              title={''}
              labelId='destination'
              disabled={
                isLoading ||
                isLoadingOriginAccounts ||
                isLoadingDestinationAccounts
              }
              accountTypeSelectionMode='inputChipMode'
            />
          </div>

          <div className='validation__errMsg'>
            {validationMessages['destination']}
          </div>
          {/* ariaLabel is "To" (the word above it), not the placeholder: the
              placeholder reads "Select Account" on both dropdowns and is empty
              while the account list loads. */}
          <DropDownSelection
            dropDownOptions={destinationAccountOptions}
            updateOptionHandler={handleDestinationChange}
            ariaLabel='To'
            isReset={isReset}
            setIsReset={setIsReset}
            setIsResetDropdown={setIsResetDestinationAccount}
            isResetDropdown={isResetDestinationAccount}
          />

          <CardNoteSave
            title={'note'}
            validationMessages={validationMessages}
            dataHandler={handleNoteChange}
            inputNote={formData.note}
            onSaveHandler={onSaveHandler}
            isDisabled={
              isLoading ||
              isLoadingOriginAccounts ||
              isLoadingDestinationAccounts
            }
            showError={showValidation.note}
          />
        </div>
      </form>

      {showMessage && messageToUser && (
        <div className='fade-message'>
          <MessageToUser
            isLoading={false}
            error={error}
            messageToUser={messageToUser}
            variant='tracker'
            tone={
              messageToUser === CORRECTION_PROMPT ? 'correction' : 'confirmation'
            }
          />
        </div>
      )}
    </>
  );
}
export default Transfer;

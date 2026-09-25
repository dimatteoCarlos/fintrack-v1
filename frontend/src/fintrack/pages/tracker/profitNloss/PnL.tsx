// Custom input validation through the useFormManagerPnL hook.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosRequestConfig } from 'axios';
import { useLocation } from 'react-router-dom';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import { useFetch } from '../../../hooks/useFetch.ts';

import { useFormManagerPnL } from '../../../hooks/useFormManagerPnL.ts';
import useBalanceStore from '../../../stores/useBalanceStore.ts';
import { notifyTransactionRecorded } from '../../../stores/transactionEvents.ts';
import {
  url_get_accounts_by_type,
  url_get_total_account_balance_by_type,
  url_movement_transaction_record,
} from '../../../../urlConfig.ts';
import CardSeparator from '../components/CardSeparator.tsx';
import Datepicker from '../../../general_components/datepicker/Datepicker.tsx';
import CardNoteSave from '../components/CardNoteSave.tsx';
import EmptyListNotice, {
  resolveEmptyCase,
} from '../components/EmptyListNotice.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import TopCard from '../components/TopCard.tsx';

import '../styles/tracker-style.css';

import { BasicTrackerMovementValidatedDataType } from '../../../validations/types.ts';
import {
  AccountByTypeResponseType,
  AccountListType,
  MovementTransactionResponseType,
  BalanceBankRespType,
} from '../../../types/responseApiTypes.ts';

import {
  CurrencyType,
  BasicTrackerMovementInputDataType,
  VariantType,
  TopCardElementsType,
  DropdownOptionType,
} from '../../../types/types.ts';
import { earliestDatableDay, toCalendarDay } from '../../../helpers/functions.ts';
import { isAccountOpenOn } from '../../../hooks/useTransactionDate.ts';
import { DEFAULT_CURRENCY, PAGE_LOC_NUM } from '../../../helpers/constants.ts';
import { MESSAGE_DURATION, TRACKER_MESSAGES } from '../trackerMessages.ts';

const VARIANT_DEFAULT: VariantType = 'tracker';
const defaultCurrency: CurrencyType = DEFAULT_CURRENCY;
const initialData: BasicTrackerMovementInputDataType = {
  amount: '',
  account: '',
  currency: defaultCurrency,
  type: 'deposit',
  date: new Date(),
  note: '',
  accountType: '',
};

const initialValidatedData: BasicTrackerMovementValidatedDataType = {
  amount: 0,
  currency: defaultCurrency,
  account: '',
  accountType: '',
  type: 'deposit',
  date: new Date(),
  note: '',
};

// Main component: profit and loss adjustment tracker
// Rule: external deposit/withdraw transfers come from the slack bank account, which is not rendered or visible.
function PnL(): JSX.Element {
  const { pathname } = useLocation();
  const trackerState = pathname.split('/')[PAGE_LOC_NUM];
  const typeMovement = trackerState.toLowerCase();
  // Centralized form state and validation (useFormManagerPnL).
  const {
    formInputData,
    formValidatedData,
    validationMessages,
    showValidation,

    createInputNumberHandler,
    createDropdownHandler,
    createTextareaHandler,
    validateAllPnL,
    activateAllValidations,

    setFormValidatedData,
    setFormInputData,
    setValidationMessages,
    resetForm,
  } = useFormManagerPnL<
    BasicTrackerMovementInputDataType,
    BasicTrackerMovementValidatedDataType
  >(initialData, initialValidatedData);

  const [messageToUser, setMessageToUser] = useState<string | null | undefined>(
    '',
  );

  const [showMessage, setShowMessage] = useState(false);

  const [isReset, setIsReset] = useState<boolean>(false);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);

  // Maps account_name to account_id.
  const [accountIdMap, setAccountIdMap] = useState<{
    [accountName: string]: string;
  }>({});

  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const setAvailableBudget = useBalanceStore(
    (state) => state.setAvailableBudget,
  );

  // Reactive fetch of the total balance (as in Expense.tsx); reloadTrigger refreshes it after every submit.
  const balanceBankResponse = useFetch<BalanceBankRespType>(
    `${url_get_total_account_balance_by_type}/?type=bank&reload=${reloadTrigger}`,
  );

  const fetchUrl = `${url_get_accounts_by_type}?type=bank_and_investment&reload=${reloadTrigger}`;

  const {
    apiData: accountDataApiResponse,
    isLoading: isLoadingAccountDataApiResponse,
    error: fetchedErrorAccountDataApiResponse,
    status: accountDataStatus,
  } = useFetch<AccountByTypeResponseType>(fetchUrl as string);

  // The chosen day as the calendar label the server validates, so the account
  // list and the payload agree on which day is being recorded.
  const chosenCalendarDay = useMemo(
    () => toCalendarDay(formInputData.date ?? new Date()),
    [formInputData.date],
  );

  // The backend answers 404 "No accounts of type" for a user with none, and
  // useFetch turns that into error null. Status is null until a fetch ends.
  const isAccountListSettled =
    !isLoadingAccountDataApiResponse && !fetchedErrorAccountDataApiResponse;
  const receivedAccounts = isAccountListSettled
    ? (accountDataApiResponse?.data?.accountList ?? [])
    : [];
  const accountEmptyCase = resolveEmptyCase(
    isAccountListSettled && accountDataStatus === 404,
    receivedAccounts.map((acc) => acc.account_start_date),
    chosenCalendarDay,
  );

  //Transform accounts data for dropdown
  const accountsToSelect = useMemo(() => {
    if (isLoadingAccountDataApiResponse) return [];
    if (fetchedErrorAccountDataApiResponse) return [];
    if (!accountDataApiResponse?.data?.accountList?.length) return [];

    const idMap: { [accountName: string]: string } = {};
    const options = accountDataApiResponse?.data.accountList
      // An account not yet open on the chosen day is not an option. Other tracker forms get this from
      // useTransactionDate; this one keeps its day in form state, so it calls the predicate directly.
      ?.filter((acc: AccountListType) =>
        isAccountOpenOn(acc.account_start_date, chosenCalendarDay),
      )
      .map((acc: AccountListType) => {
        idMap[acc.account_name] = acc.account_id.toString();
        return {
          label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${acc.account_balance})`,
          value: acc.account_name,
        };
      });
    setAccountIdMap(idMap);
    return options;
  }, [
    accountDataApiResponse?.data.accountList,
    fetchedErrorAccountDataApiResponse,
    isLoadingAccountDataApiResponse,
    chosenCalendarDay,
  ]);

  // A selection may stop qualifying when the date moves back; the dropdown is reset too, or it
  // would show a label the state no longer holds.
  useEffect(() => {
    if (!formInputData.account) return;

    const stillOffered = accountsToSelect.some(
      (option) => option.value === formInputData.account,
    );
    if (stillOffered) return;

    setFormInputData((prev) => ({ ...prev, account: '', accountType: '' }));
    setFormValidatedData((prev) => ({ ...prev, account: '', accountType: '' }));
    setIsReset(true);
  }, [
    accountsToSelect,
    formInputData.account,
    setFormInputData,
    setFormValidatedData,
  ]);

  const optionsAccountsToSelect = {
    title: 'Select account',
    options: accountsToSelect,
    variant: VARIANT_DEFAULT,
  };
  const accountsListInfo = useMemo(
    () =>
      !isLoadingAccountDataApiResponse &&
      !fetchedErrorAccountDataApiResponse &&
      accountDataApiResponse?.data?.accountList?.length
        ? accountDataApiResponse?.data.accountList?.map((account) => ({
            ...account,
          }))
        : [],
    [
      accountDataApiResponse?.data.accountList,
      fetchedErrorAccountDataApiResponse,
      isLoadingAccountDataApiResponse,
    ],
  );

  // The form's `date` (a Date the calendar binds to) is omitted: the server reads only the
  // calendar label below, and sending both would give it two answers to one question.
  type PayloadType = Omit<BasicTrackerMovementValidatedDataType, 'date'> & {
    user?: string;
    // The day the entry happened, as the calendar label the server validates; this key reaches
    // transaction_actual_date.
    transactionActualDate: string;
    account_id?: string;
  };
  const {
    isLoading,
    error: postError,
    requestFn,
    resetFn,
  } = useFetchLoad<MovementTransactionResponseType, PayloadType>({
    url: url_movement_transaction_record,
    method: 'POST',
  });
  const error = fetchedErrorAccountDataApiResponse || postError;
  const handleAmountChange = createInputNumberHandler('amount');

  const handleAccountSelect = useCallback(
    (selectedOption: DropdownOptionType | null) => {
      const accountName = selectedOption?.value || '';
      setHasUserInteracted(true);

      // Use the dropdown handler from useFormManager custom hook for validation
      const handler = createDropdownHandler('account');
      handler(selectedOption);

      //set accountType based on selection
      const selectedAccount = accountsListInfo.find(
        (acc) => acc.account_name === accountName,
      );

      if (selectedAccount) {
        setFormInputData((prev) => ({
          ...prev,
          accountType: selectedAccount.account_type_name,
        }));

        setFormValidatedData((prev) => ({
          ...prev,
          accountType: selectedAccount.account_type_name,
        }));
      }
    },
    [
      createDropdownHandler,
      accountsListInfo,
      setFormInputData,
      setFormValidatedData,
    ],
  );

  const updateDataCurrency = useCallback(
    (currency: CurrencyType) => {
      setFormInputData((prev) => ({ ...prev, currency }));
      setFormValidatedData((prev) => ({ ...prev, currency }));
    },
    [setFormInputData, setFormValidatedData],
  );

  const toggleTransactionType = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const newType = formInputData.type === 'deposit' ? 'withdraw' : 'deposit';

      setFormInputData((prev) => ({
        ...prev,
        type: newType,
      }));

      setFormValidatedData((prev) => ({
        ...prev,
        type: newType,
      }));
    },
    [formInputData.type, setFormInputData, setFormValidatedData],
  );

  // Back-dating window, floor to today; the server validates the same window, this only keeps the
  // calendar from offering a refused day. The floor comes from the helper shared with useTransactionDate.
  // Memoised so the memoised Datepicker is not handed new Date objects on every render.
  const { monthFloor, todayBound } = useMemo(
    () => ({
      monthFloor: earliestDatableDay(),
      todayBound: new Date(),
    }),
    [],
  );

  const changeDate = useCallback(
    (selectedDate: Date) => {
      setFormInputData((prev) => ({ ...prev, date: selectedDate }));
      setFormValidatedData((prev) => ({ ...prev, date: selectedDate }));
    },
    [setFormInputData, setFormValidatedData],
  );

  const handleNoteChange = createTextareaHandler('note');

  // Unified handler for TopCard input changes
  const handleTopCardChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name } = e.target;
    if (name === 'amount') {
      handleAmountChange(e);
    }
  };
  // One path, two entries: the + button's click and Enter in any field (via the form's onSubmit). The
  // preventDefault below serves both and stops the + click from also firing the submit.
  async function onSaveHandler(
    e: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    if (resetFn) resetFn();
    setShowMessage(true);
    setMessageToUser(TRACKER_MESSAGES.processing);
    // Evaluate all fields using useFormManager custom hook's validation system
    const { isValid, messages, validatedData } = validateAllPnL();

    if (!isValid || !validatedData) {
      setValidationMessages(messages);
      // Force showing all validation messages
      activateAllValidations(true);
      setMessageToUser(TRACKER_MESSAGES.correction);
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.action);
      return;
    }
    // Server side: updates the balances of the bank or investment account and of its counter account, slack
    // (user_accounts), and records both transaction descriptions with the corresponding account info.
    try {
      const accountId = accountIdMap[formValidatedData.account];

      // Split out rather than spread: the Date stays on the form, the calendar
      // day goes on the wire.
      const { date: chosenDate, ...validatedPayload } = validatedData!;

      const payload: PayloadType = {
        ...validatedPayload,
        // validatedData, not formValidatedData: React state may lag one update and send the previous value.
        account_id: accountId,
        transactionActualDate: toCalendarDay(chosenDate || new Date()),
      };
      const postUrl = `${url_movement_transaction_record}?movement=${typeMovement}`;

      const response = await requestFn(payload, {
        url: postUrl,
      } as AxiosRequestConfig);

      if (response?.error) {
        throw new Error(
          response?.error ||
            error ||
            'An unexpected error occurred during form submission.',
        );
      }

      // Caches holding transaction-derived data are now stale. Issues no request.
      notifyTransactionRecorded();

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
        console.log('Data from record transaction request:', response);
      }

      setMessageToUser('Transaction completed successfully!');
      setShowMessage(true);

      // Reset form only on successful submission
      resetForm();
      setHasUserInteracted(false);
      setReloadTrigger((prev) => prev + 1);
      setIsReset(true);
      if (resetFn) resetFn();

      setTimeout(() => {
        setMessageToUser(null);
        setShowMessage(false);
        setIsReset(false);
      }, MESSAGE_DURATION.confirmation);
    } catch (error) {
      console.error('Submission error:', error);
      setMessageToUser('Error processing transaction');
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.action);
      setShowMessage(true);
    }
  }
  // Syncs the global balance store with the fetched bank total.
  useEffect(() => {
    const total_balance = balanceBankResponse.apiData?.data?.total_balance;
    if (typeof total_balance === 'number') {
      setAvailableBudget(total_balance);
    }
  }, [balanceBankResponse.apiData, setAvailableBudget]);

  useEffect(() => {
    if (error && !isLoading) {
      setMessageToUser(error);
      setShowMessage(true);
      setTimeout(() => setShowMessage(false), MESSAGE_DURATION.action);
    }
  }, [error, isLoading]);

  useEffect(() => {
    //show errors upon user interaction
    if (!hasUserInteracted) {
      setValidationMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages.account;
        delete newMessages.note;
        delete newMessages.amount;
        return newMessages;
      });
    }
    if (
      formInputData.account === '' &&
      (formInputData.amount !== '' || formInputData.note !== '')
    ) {
      setValidationMessages((prev) => ({
        ...prev,
        account: '* Please select an Account',
      }));
      activateAllValidations(true);
    }
    if (
      formInputData.note === '' &&
      (formInputData.amount !== '' || formInputData.account !== '')
    ) {
      setValidationMessages((prev) => ({
        ...prev,
        note: '* Please insert a Note',
      }));
      activateAllValidations(true);
    }
  }, [
    formInputData.account,
    formInputData.note,
    formInputData.amount,
    hasUserInteracted,
    setValidationMessages,
    activateAllValidations,
  ]);

  const topCardElements: TopCardElementsType = {
    titles: { title1: 'amount', title2: 'account' },
    value: formInputData.amount,
    accountsListInfo,
    selectOptions: optionsAccountsToSelect,
  };

  return (
    <>
      <form
        className='trackerFormAccount'
        style={{ color: 'inherit' }}
        onSubmit={onSaveHandler}
      >
        <TopCard
          topCardElements={topCardElements}
          validationMessages={validationMessages}
          setValidationMessages={setValidationMessages}
          updateTrackerData={handleTopCardChange}
          trackerName={trackerState}
          currency={formInputData.currency}
          updateCurrency={updateDataCurrency}
          setSelectState={setFormInputData}
          isReset={isReset}
          setIsReset={setIsReset}
          customSelectHandler={handleAccountSelect}
          day={chosenCalendarDay}
          accountNotice={
            accountEmptyCase && (
              <EmptyListNotice
               kind='bank_and_investment'
               action='record a profit or loss'
               emptyCase={accountEmptyCase}
              />
            )
          }
        />
        <CardSeparator />
        <div className='state__card--bottom'>
          <div className='card__typeDate__container'>
            <div className='card__typeDate--type'>
              <div className='card--title'>Type</div>
              <button
                className='card__screen--type'
                onClick={toggleTransactionType}
              >
                <div className='screen--concept'>{formInputData.type}</div>
              </button>
            </div>

            <div className='card__typeDate--date  '>
              <div className='card--title '> Date </div>
              <div className='card__screen--date '>
                <Datepicker
                  changeDate={changeDate}
                  date={formInputData.date ?? new Date()}
                  variant={'tracker'}
                  popperClassName='pnl-datepicker-popper'
                  minDate={monthFloor}
                  maxDate={todayBound}
                />
              </div>
            </div>
          </div>

          <CardNoteSave
            title={'note'}
            validationMessages={validationMessages}
            dataHandler={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setHasUserInteracted?.(true);
              handleNoteChange(e);
            }}
            inputNote={formInputData.note}
            onSaveHandler={onSaveHandler}
            // A notice stands where the dropdown would be, so there is nothing
            // to select and nothing the button could submit.
            isDisabled={isLoading || !!accountEmptyCase}
            showError={showValidation.note}
          />
        </div>
      </form>

      {showMessage && !isLoading && (
        <div className='fade-message'>
          {/* The tone is read off the exact message and never off the validation
              state: this screen sets the progress line BEFORE it validates and
              never empties validationMessages. */}
          <MessageToUser
            isLoading={false}
            error={error}
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
export default PnL;

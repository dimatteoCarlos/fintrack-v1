import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosRequestConfig } from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

import useAuth from '../../../../auth/hooks/useAuth.ts';

import { useFetch } from '../../../hooks/useFetch.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback.ts';

import { useBalanceStore } from '../../../stores/useBalanceStore.ts';
import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { useTransactionDate } from '../../../hooks/useTransactionDate.ts';
import { notifyTransactionRecorded } from '../../../stores/transactionEvents.ts';
import TopCard from '../components/TopCard.tsx';
import CardSeparator from '../components/CardSeparator.tsx';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import CardNoteSave from '../components/CardNoteSave.tsx';
import EmptyListNotice, {
 resolveEmptyCase,
} from '../components/EmptyListNotice.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import {
  url_get_accounts_by_type,
  url_get_total_account_balance_by_type,
  url_movement_transaction_record,
} from '../../../../urlConfig.ts';
import {
  ACCOUNT_OPTIONS_DEFAULT,
  CATEGORY_OPTIONS_DEFAULT,
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  PAGE_LOC_NUM,
} from '../../../helpers/constants.ts';
import {
  MESSAGE_DURATION,
  noticeCarriesLink,
  TRACKER_MESSAGES,
} from '../trackerMessages.ts';
//---
// 📝 DATA TYPE IMPORTS
import {
  AccountByTypeResponseType,
  BalanceBankRespType,
  MovementTransactionResponseType,
} from '../../../types/responseApiTypes.ts';

import {
  CurrencyType,
  DropdownOptionType,
  ExpenseInputDataType,
  VariantType,
  MovementTransactionType,
  TopCardElementsType,
} from '../../../types/types.ts';
import { validateForm } from '../../../validations/utils/zod_validation.ts';
import { expenseSchema } from '../../../validations/zod_schemas/trackerMovementSchema.ts';
import {
  ExpenseValidatedDataType,
  ValidationMessagesType,
} from '../../../validations/types.ts';
import { handleError } from '../../../helpers/handleError.ts';
import { currencyFormat } from '../../../helpers/functions.ts';
import { isUnbudgeted } from '../../../helpers/budgetStatus.ts';
import { AUTH_ROUTE } from '../../../../auth/auth_constants/constants.ts';
export type ShowValidationType = {
  amount: boolean;
  account: boolean;
  category: boolean;
  note: boolean;
};
const defaultCurrency = DEFAULT_CURRENCY;

const initialExpenseData: ExpenseInputDataType = {
  amount: '', //string for input
  account: '',
  category: '',
  note: '',
  currency: DEFAULT_CURRENCY,
};
const VARIANT_DEFAULT: VariantType = 'tracker';
// Main component: Expense tracker movement
function Expense(): JSX.Element {
  // Only bank accounts are used for operations (e.g. expenses): all existing ones except the slack account.
  const router = useLocation();
  const trackerState = router.pathname.split('/')[PAGE_LOC_NUM];
  const typeMovement: MovementTransactionType = trackerState.toLowerCase();
  const navigateTo = useNavigate();
  const { isAuthenticated, isCheckingAuth } = useAuth();

  const [currency, setCurrency] = useState<CurrencyType>(defaultCurrency);

  const [isReset, setIsReset] = useState<boolean>(false);
  const [isResetDropdown, setIsResetDropdown] = useState<boolean>(false);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [expenseData, setExpenseData] =
    useState<ExpenseInputDataType>(initialExpenseData);

  // The day this entry happened. Defaults to today, which is always inside the
  // window and always shows every account, so an ordinary entry never touches it.
  const {
    transactionActualDate,
    isOpenOnChosenDay,
    dateProps: transactionDateProps,
  } = useTransactionDate();

  const [messageToUser, setMessageToUser] = useState<string | null | undefined>(
    null,
  );

  const [validationMessages, setValidationMessages] = useState<
    ValidationMessagesType<typeof initialExpenseData>
  >({});

  const [showValidation, setShowValidation] = useState<ShowValidationType>({
    amount: false,
    account: false,
    category: false,
    note: false,
  });
  const setAvailableBudget = useBalanceStore(
    (state) => state.setAvailableBudget,
  );

  const balanceBankResponse = useFetch<BalanceBankRespType>(
    `${url_get_total_account_balance_by_type}/?type=bank&reload=${reloadTrigger}`,
  );

  const fetchUrl = `${url_get_accounts_by_type}/?type=bank&reload=${reloadTrigger}`;

  const {
    apiData: BankAccountsResponse,
    isLoading: isLoadingBankAccounts,
    error: fetchedErrorBankAccounts,
    status: bankAccountsStatus,
    // ...rest
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
  // Memoized account options, recomputed only when the accounts response changes.
  const optionsExpenseAccounts = useMemo(() => {
    if (fetchedErrorBankAccounts) {
      return ACCOUNT_OPTIONS_DEFAULT;
    }
    // Filtered by the chosen day: an account that did not exist yet is not an option. The server refuses
    // it independently; this keeps the owner from meeting that refusal.
    const accountList = (BankAccountsResponse?.data?.accountList ?? []).filter(
      (acc) => isOpenOnChosenDay(acc.account_start_date),
    );

    return accountList.length
      ? accountList.map((acc) => ({
          value: acc.account_name,
          label: `${acc.account_name} (${acc.account_type_name} ${acc.currency_code} ${acc.account_balance})`,
        }))
      : ACCOUNT_OPTIONS_DEFAULT;
  }, [
    BankAccountsResponse?.data.accountList,
    fetchedErrorBankAccounts,
    isOpenOnChosenDay,
  ]);

  // A chosen account may stop qualifying when the date moves back. Cleared, or the form would post a name
  // the list no longer offers and take a 422 for a choice the owner cannot see.
  useEffect(() => {
    if (!expenseData.account) return;

    const stillOffered = optionsExpenseAccounts.some(
      (option) => option.value === expenseData.account,
    );

    if (stillOffered) return;

    setExpenseData((prev) => ({ ...prev, account: '' }));
    setIsResetDropdown(true);
  }, [optionsExpenseAccounts, expenseData.account]);

  const accountOptions = {
    title: 'Select Account',
    options: optionsExpenseAccounts,
    variant: VARIANT_DEFAULT,
  };
  // Category options come from this month's spend against its budget per category account; the status
  // payload carries accountName and currency too. undefined is sent as an omitted month, so the server
  // resolves the current month on the owner's calendar (a browser clock is wrong part of every day).
  const budgetMonth: string | undefined = undefined;

  const budgetAccounts = useBudgetStatusStore((state) => state.accounts);
  const isLoadingCategoryBudgetAccounts = useBudgetStatusStore(
    (state) => state.isLoading,
  );
  const fetchedErrorCategoryBudgetAccounts = useBudgetStatusStore(
    (state) => state.error,
  );
  // No answer yet is not an empty answer: without this the first frame, before the effect below runs,
  // reads as a user with no budget categories.
  const isBudgetStatusLoaded = useBudgetStatusStore(
    (state) => state.loadedMonth !== null,
  );
  const fetchBudgetStatus = useBudgetStatusStore((state) => state.fetchStatus);
  const refreshBudgetStatus = useBudgetStatusStore(
    (state) => state.refreshStatus,
  );

  // The store's own guard makes this free when budget or the transfer screen has
  // already asked for the same month. reloadTrigger is a dependency because a
  // recorded movement invalidates the memo, and this is what asks again for it.
  useEffect(() => {
    void fetchBudgetStatus(budgetMonth);
  }, [fetchBudgetStatus, budgetMonth, reloadTrigger]);

  // A name carried over while another month loads is the same account but its figures are not.
  // Closed categories never re-enter this picker; shared with the empty-case check so both agree.
  const activeBudgetAccounts = useMemo(
    () => budgetAccounts.filter((account) => account.closedDate === null),
    [budgetAccounts],
  );

  const optionsExpenseCategories = useMemo(() => {
    if (fetchedErrorCategoryBudgetAccounts) {
      return CATEGORY_OPTIONS_DEFAULT;
    }

    // Filtered by the chosen day like the bank list above: a category that did not exist yet is not an
    // option, and the server would refuse it.
    return activeBudgetAccounts
      .filter((account) => isOpenOnChosenDay(account.accountStartDate))
      .map((account) => {
      const hasFigures =
        !isLoadingCategoryBudgetAccounts &&
        Number.isFinite(account.actualSpent) &&
        Number.isFinite(account.budgetAmount) &&
        // Nothing budgeted and nothing spent is no budget, not a budget met; the budget screens print
        // nothing there and this must agree.
        !isUnbudgeted(account.budgetAmount, account.actualSpent);

      if (!hasFigures) {
        return { value: account.accountName, label: account.accountName };
      }

      // The currency travels once: currencyFormat emits the symbol itself.
      const spent = currencyFormat(
        account.currency,
        account.actualSpent,
        CURRENCY_OPTIONS[account.currency],
      );
      const budget = currencyFormat(
        account.currency,
        account.budgetAmount,
        CURRENCY_OPTIONS[account.currency],
      );

      return {
        value: account.accountName,
        label: `${account.accountName} (${spent} / ${budget})`,
      };
    });
  }, [
    activeBudgetAccounts,
    fetchedErrorCategoryBudgetAccounts,
    isLoadingCategoryBudgetAccounts,
    isOpenOnChosenDay,
  ]);
  // Same reason as the account effect above: a category already chosen may stop
  // qualifying when the date moves back, and a form that keeps it posts a name
  // the list no longer offers.
  useEffect(() => {
    if (!expenseData.category) return;

    const stillOffered = optionsExpenseCategories.some(
      (option) => option.value === expenseData.category,
    );

    if (stillOffered) return;

    setExpenseData((prev) => ({ ...prev, category: '' }));
    setIsResetDropdown(true);
  }, [optionsExpenseCategories, expenseData.category]);

  const categoryOptions = {
    title: optionsExpenseCategories ? 'Category / Subcategory' : '',
    options: optionsExpenseCategories ?? CATEGORY_OPTIONS_DEFAULT,
    variant: VARIANT_DEFAULT as VariantType,
  };
  type PayloadType = ExpenseValidatedDataType & {
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
  function updateDataCurrency(currency: CurrencyType) {
    setCurrency(currency);
    setExpenseData((prev) => ({ ...prev, currency: currency }));
  }
  function categorySelectHandler(selectedOption: DropdownOptionType | null) {
    setExpenseData((prev) => ({
      ...prev,
      ['category']: selectedOption?.value || '',
    }));

    // Only validate if showing validation for category
    if (showValidation.category) {
      setValidationMessages((prev) => ({
        ...prev,
        category: selectedOption?.value ? '' : '* Please select a category',
      }));
    }
  }
  function accountSelectHandler(selectedOption: DropdownOptionType | null) {
    setExpenseData((prev) => ({
      ...prev,
      ['account']: selectedOption?.value || '',
    }));

    // Only validates if showing validation msg for account
    if (showValidation.account) {
      setValidationMessages((prev) => ({
        ...prev,
        account: selectedOption?.value
          ? ''
          : TRACKER_MESSAGES.accountFieldRequired,
      }));
    }
  }
  // Real-time validation, extracted so it can be debounced; useCallback keeps it stable between changes.
  const processValidationAndUpdateFn = useCallback(
    (name: string, value: string) => {
      // Zod validates a whole object, so the changed value is merged into the current data. Runs only
      // when validation is showing for this field.
      if (showValidation[name as keyof ShowValidationType]) {
        const currentDataForValidation = {
          ...expenseData,
          [name]: value,
        };
        const { errors: fieldErrors } = validateForm(
          expenseSchema,
          currentDataForValidation,
        );

        // Update only the message of the changed field.
        if (fieldErrors[name as keyof ExpenseInputDataType]) {
          setValidationMessages((prev) => ({
            ...prev,
            [name]: fieldErrors[name as keyof ExpenseInputDataType],
          }));
        } else {
          setValidationMessages((prev) => {
            const newMessages = { ...prev };
            delete newMessages[name as keyof ExpenseInputDataType];
            return newMessages;
          });
        }
      }
    },
    [expenseData, showValidation],
  );
  const debouncedProcessValidationAndUpdateFn = useDebouncedCallback(
    processValidationAndUpdateFn,
    500,
  );
  // Updates the immediate state and calls the debounced validation.
  function updateTrackerData_Zod(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    e.preventDefault();
    const { name, value } = e.target;

    setExpenseData((prev) => ({ ...prev, [name]: value }));

    // immediate validation for amount
    if (name === 'amount') {
      setShowValidation((prev) => ({ ...prev, amount: true }));
      debouncedProcessValidationAndUpdateFn(name, value);

      // show validation message for other fields when amount value is entered.
      if (value && !showValidation.account) {
        setShowValidation((prev) => ({
          ...prev,
          account: true,
          category: true,
          note: true,
        }));
      }
    } else {
      debouncedProcessValidationAndUpdateFn(name, value);
    }
  }
  //---
  // The default serves the two failures below; the confirmations pass their own.
  function showMessage(
    message: string,
    duration: number = MESSAGE_DURATION.action,
  ) {
    setMessageToUser(message);
    setTimeout(() => setMessageToUser(null), duration);
  }
  // One path, two entries: the + button's click and Enter in any field (via the form's onSubmit). The
  // preventDefault below serves both and stops the + click from also firing the submit.
  async function onSaveHandler(
    e: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    // Show all validation messages when submitting
    setShowValidation({
      amount: true,
      account: true,
      category: true,
      note: true,
    });
    const { errors: fullFormErrors, data: dataValidated } = validateForm(
      expenseSchema,
      expenseData,
    );
    if (fullFormErrors && Object.keys(fullFormErrors).length > 0) {
      setValidationMessages(fullFormErrors);
      setMessageToUser(TRACKER_MESSAGES.correction);
      setTimeout(() => setMessageToUser(null), MESSAGE_DURATION.action);
      return; //abort
    }
    if (!dataValidated) {
      showMessage(TRACKER_MESSAGES.validationFailure);
      return;
    }
    showMessage(TRACKER_MESSAGES.processing, MESSAGE_DURATION.confirmation);
    // Post the movement transaction: updates the bank account and category budget account
    // balances in user_accounts.

    //record both transaction descriptions: transfer and receive transactions with the correspondent account info.

    //endpoint ex: http://localhost:5000/api/fintrack/transaction/transfer-between-accounts/?movement=expense

    try {
      const payload: PayloadType = {
        ...(dataValidated as ExpenseValidatedDataType & { type?: string }),
        type: typeMovement,
        transactionActualDate,
      };

      const finalUrl = `${url_movement_transaction_record}/?movement=${typeMovement}`;

      const response = await requestFn(payload, {
        url: finalUrl,
      } as AxiosRequestConfig);

      if (response.error) {
        const errorMsg = response.error;
        throw new Error(errorMsg);
      }

      // Caches holding transaction-derived data are now stale. Issues no request.
      notifyTransactionRecorded();

      //------------------------
      showMessage(
        TRACKER_MESSAGES.transactionRecorded,
        MESSAGE_DURATION.confirmation,
      );
    } catch (error) {
      const { message, status, isAuthError } = handleError(error);

      if (isAuthError) {
        return;
      }

      showMessage(`Error (${status}): ${message}`);

      console.error(`Error (${status}): ${message}`);
    }
  }
  // Copies the fetched bank total into the global balance store.
  useEffect(() => {
    const total_balance = balanceBankResponse.apiData?.data?.total_balance;

    // Only when the data has arrived and is a number.
    if (typeof total_balance === 'number') {
    // Called from an effect, outside the render phase.
      setAvailableBudget(total_balance);
    }
  }, [balanceBankResponse.apiData, setAvailableBudget]);

  // While auth is being checked or missing, tell the user and redirect to sign-in.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isCheckingAuth) {
      setMessageToUser('Verifying session status. Please wait...');
    } else if (!isAuthenticated) {
     // Use existing messageToUser state for feedback before redirecting
      setMessageToUser(
       'Session not active or expired. Redirecting to the sign-in page in 3 seconds...',
      );

      timer = setTimeout(() => {
        navigateTo(AUTH_ROUTE, { replace: true });
      }, 3000);
    } else {
      // If authenticated, clear the message (only if it was set by the auth check)
      if (
        messageToUser?.includes('Verifying') ||
        messageToUser?.includes('Session not active')
      ) {
        setMessageToUser(null);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, isCheckingAuth, navigateTo, messageToUser]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (data && !isLoading) {
      const success = data;
      setMessageToUser('Movement successfully completed!');
      if (success) {
        setCurrency(DEFAULT_CURRENCY);
        setExpenseData(initialExpenseData);
        setReloadTrigger((prev) => prev + 1);
        setIsReset(true);
        setIsResetDropdown(true);
        setValidationMessages({});
      }
      setShowValidation({
        amount: false,
        account: false,
        category: false,
        note: false,
      });

      timer = setTimeout(() => {
        setMessageToUser(null);
        setIsReset(false);
      }, MESSAGE_DURATION.confirmation);
    }
    return () => clearTimeout(timer);
  }, [data, isLoading]);
  useEffect(() => {
    if (!isAuthenticated || isCheckingAuth) return;
  }, [isAuthenticated, isCheckingAuth, reloadTrigger]);
  // Once an amount is entered, start showing and validating the note.
  useEffect(() => {
    if (expenseData.amount !== '' && !showValidation.note) {
      setShowValidation((prev) => ({
        ...prev,
        note: true,
      }));
      // Validate note field immediately when activated
      if (expenseData.note === '') {
        setValidationMessages((prev) => ({
          ...prev,
          note: TRACKER_MESSAGES.noteFieldRequired,
        }));
      } else {
        setValidationMessages((prev) => {
          const newMessages = { ...prev };
          delete newMessages.note;
          return newMessages;
        });
      }
    }
  }, [expenseData.amount, expenseData.note, showValidation.note]);

  // Once an amount is entered, start showing and validating the account.
  useEffect(() => {
    // Activate only if an amount is entered and validation is not already active.
    if (expenseData.amount !== '' && !showValidation.account) {
      setShowValidation((prev) => ({ ...prev, account: true }));

      // Initial validation with Zod
      const { errors } = validateForm(expenseSchema, {
        ...expenseData,
        account: expenseData.account,
      });

      if (errors.account) {
        setValidationMessages((prev) => ({ ...prev, account: errors.account }));
      }
    }
  }, [expenseData, showValidation.account]);
  // Once an amount is entered, start showing its validation.
  useEffect(() => {
    if (expenseData.amount !== '' && !showValidation.amount) {
      setShowValidation((prev) => ({ ...prev, amount: true }));
      // The actual validation runs in processValidationAndUpdateFn.
    }
  }, [expenseData.amount, showValidation.amount]);
  // Once an amount is entered, start showing and validating the category.
  useEffect(() => {
    if (expenseData.amount !== '' && !showValidation.category) {
      setShowValidation((prev) => ({
        ...prev,
        category: true,
      }));

      // Validate category field immediately when activated
      if (expenseData.category === '') {
        setValidationMessages((prev) => ({
          ...prev,
          category: '* Please select a category',
        }));
      } else {
        setValidationMessages((prev) => {
          const newMessages = { ...prev };
          delete newMessages.category;
          return newMessages;
        });
      }
    }
  }, [expenseData.amount, expenseData.category, showValidation.category]);

  const topCardElements: TopCardElementsType = {
    titles: { title1: 'amount', title2: 'account' },
    value: expenseData.amount as string,
    selectOptions: accountOptions,
  };
  // The category list's fetch states get their own surface (an option label cannot hold a skeleton or button).
  // They degrade only the failed control, so a budget-service outage does not block expense entry.
  // Resolved only once the status has landed, so an empty list is never claimed before the answer arrives.
  const categoryEmptyCase =
    fetchedErrorCategoryBudgetAccounts ||
    isLoadingCategoryBudgetAccounts ||
    !isBudgetStatusLoaded
      ? null
      : resolveEmptyCase(
          activeBudgetAccounts.length === 0,
          activeBudgetAccounts.map((account) => account.accountStartDate),
          transactionActualDate,
        );

  function renderCategoryStatus(): JSX.Element | null {
   if (fetchedErrorCategoryBudgetAccounts) {
    return (
     <div className='categoryStatus categoryStatus--error' role='alert'>
      <span className='categoryStatus__text'>
       Budget status could not be loaded.
      </span>

      <button
       type='button'
       className='categoryStatus__retry'
       onClick={() => {
        void refreshBudgetStatus();
       }}
      >
       Retry
      </button>
     </div>
    );
   }

   if (isLoadingCategoryBudgetAccounts || !isBudgetStatusLoaded) {
    return (
     <div className='categoryStatus' aria-hidden='true'>
      <span className='categoryStatus__skeleton'></span>
     </div>
    );
   }

   // The empty case is not rendered here: it takes the dropdown's place above,
   // because a category list with nothing to offer is not a control.
   return null;
  }
  // Separate UI for "checking" and "not authenticated".
  if (isCheckingAuth) {
    return (
      <div className='expense loading-screen' style={{ color: 'inherit' }}>
        <MessageToUser
          isLoading={true}
          messageToUser={messageToUser}
          variant='tracker'
          error={postError || fetchedErrorBankAccounts}
        />
        <CoinSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className='expense loading-screen' style={{ color: 'inherit' }}>
        <MessageToUser
          isLoading={false} // not checking, but not authenticated
          messageToUser={
            messageToUser ??
            'Session not active or expired. Redirecting to sign-in...'
          } // fallback message
          variant='tracker'
          error={postError || fetchedErrorBankAccounts}
        />
      </div>
    );
  }
  return (
    <>
      <form
        className='expense'
        style={{ color: 'inherit' }}
        onSubmit={onSaveHandler}
      >
        <TopCard<typeof initialExpenseData>
          topCardElements={topCardElements}
          validationMessages={validationMessages}
          setValidationMessages={setValidationMessages}
          updateTrackerData={updateTrackerData_Zod}
          trackerName={trackerState}

          currency={currency}
          updateCurrency={updateDataCurrency}

          setSelectState={
            setExpenseData as React.Dispatch<
              React.SetStateAction<typeof initialExpenseData>
            >
          }

          isReset={isReset}
          isResetDropdown={isResetDropdown}
          setIsReset={setIsReset}
          setIsResetDropdown={setIsResetDropdown}

          customSelectHandler={accountSelectHandler}
          transactionDateProps={transactionDateProps}
          accountNotice={
            bankEmptyCase && (
              <EmptyListNotice
               kind='bank'
               action='record an expense'
               emptyCase={bankEmptyCase}
              />
            )
          }
        />

        <CardSeparator />

        <div className='state__card--bottom'>
          <div className='card--title card--title--top'>
            Category{' '}
            {/* Silent while the notice stands in for the dropdown below: that
                notice is this field's message. */}
            <span className='validation__errMsg'>
              {categoryEmptyCase ? '' : validationMessages['category']}
            </span>
          </div>

          {categoryEmptyCase ? (
            <EmptyListNotice
             kind='category'
             action='record an expense'
             emptyCase={categoryEmptyCase}
             linkShownElsewhere={noticeCarriesLink('bank', bankEmptyCase?.case)}
            />
          ) : (
            <DropDownSelection
              dropDownOptions={categoryOptions}
              updateOptionHandler={categorySelectHandler}
              isReset={isReset}
              setIsReset={setIsReset}
            />
          )}

          {renderCategoryStatus()}

          <CardNoteSave
            title={'note'}
            validationMessages={validationMessages}
            dataHandler={updateTrackerData_Zod}
            inputNote={expenseData.note}
            onSaveHandler={onSaveHandler}
            // A notice stands where a dropdown would be, so there is nothing to
            // select and nothing the button could submit.
            isDisabled={
              isLoading ||
              isLoadingBankAccounts ||
              isLoadingCategoryBudgetAccounts ||
              !!bankEmptyCase ||
              !!categoryEmptyCase
            }
            showError={showValidation.note}
          />
        </div>
      </form>

      {messageToUser && (
        <div className='fade-message'>
          <MessageToUser
            isLoading={
             isLoading ||
             isLoadingBankAccounts ||
             isLoadingCategoryBudgetAccounts
            }
            error={postError || fetchedErrorBankAccounts}
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

export default Expense;

import { ZodType } from 'zod';
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';

import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { notifyAccountChanged } from '../../../stores/transactionEvents.ts';
import { useFetch } from '../../../hooks/useFetch.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import {
  GenericEditFormData,
  useEditAccountForm,
} from '../../hooks/useEditAccountForm.ts';

import {
  AccountByTypeResponseType,
  AccountListType,
} from '../../../types/responseApiTypes.ts';
import {
  BudgetAccountStatus,
  BudgetErrorResponse,
  BudgetWriteRequest,
} from '../../../types/budgetTypes.ts';
import { ValidationMessagesType } from '../../../validations/types.ts';
import { DropdownOptionType } from '../../../types/types.ts';

import {
  ACCOUNT_EDIT_SCHEMA_CONFIG,
  FieldConfigType,
} from '../../validations_zod/accountEditSchema.ts';
import { accountTypeEditSchemas } from '../../validations_zod/editSchemas.ts';
import { validateForm } from '../../../validations/utils/zod_validation.ts';

import {
  url_get_account_details_by_id_for_edition,
  url_patch_account_edit,
} from '../../../../urlConfig.ts';
// Outside pages/ because the account editor and the budget page are in different trees.
import { getBudgetAccountsStatus, setCurrentBudget } from '../../../api/budgetApi.ts';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import UniversalDynamicInput from './UniversalDynamicInput.tsx';
import SummaryDetailBox from '../../../pages/forms/accountDetailSharedComponents/summaryDetailBox/SummaryDetailBox.tsx';
import BudgetEditModal from '../../../pages/budget/components/budgetEditModal/BudgetEditModal.tsx';

import LeftArrowSvg from '../../../../assets/LeftArrowSvg.svg';
// '?react', not a bare import: a bare .svg is typed `string` and cannot take a className.
import EditSvg from '../../../../assets/pencil02Svg.svg?react';

import '../../../pages/forms/styles/forms-styles.css';
import './styles/editAccount-styles.css';

import { normalizeBudgetError } from '../../../helpers/normalizeBudgetError.ts';
import { formatBudgetMonthLabel } from '../../../helpers/functions.ts';

// Dates compare by instant, everything else by identity.
const areValuesEqual = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  return a === b;
};

export function EditAccount(): JSX.Element {
  const { accountId } = useParams<{ accountId: string }>();
  const navigateTo = useNavigate();
  const location = useLocation();
  const previousRoute =
    location.state?.previousRoute || '/fintrack/tracker/accounting';

  // Where the caller's own module starts. Carried, not consumed: a detail card
  // derives its back arrow from what it is handed, so returning without it
  // resets the card to its own default.
  const originRoute = location.state?.originRoute;

  // State carried by every return to previousRoute. previousRoute is restated as
  // the origin: one step back from the card is the module it opened from, not
  // the editor just closed.
  const returnState = { previousRoute: originRoute, originRoute };

  const fetchUrl = accountId
    ? `${url_get_account_details_by_id_for_edition}${accountId}`
    : null;

  const {
    apiData,
    isLoading: isFetching,
    error: fetchError,
    refetch: refetchAccount,
  } = useFetch<AccountByTypeResponseType>(fetchUrl);

  const accountData = apiData?.data?.accountList[0];

  const mutationUrl = accountId ? `${url_patch_account_edit}/${accountId}` : '';
  const {
    isLoading: isSaving,
    error: saveError,
    requestFn,
  } = useFetchLoad<AccountListType, GenericEditFormData>({
    url: mutationUrl,
    method: 'PATCH',
  });

  const [userMessage, setUserMessage] = useState<
    { message: string; status: number } | undefined
  >(undefined);

  const accountType = accountData ? accountData.account_type_name : null;

  const accountFields = useMemo(() => {
    if (!accountType) return [];
    const fields =
      ACCOUNT_EDIT_SCHEMA_CONFIG[
        accountType as AccountListType['account_type_name']
      ] || [];
    if (!fields) {
      console.error(
        `Error: Account type '${accountType}' not found in ACCOUNT_EDIT_SCHEMA_CONFIG.`,
      );
      return [];
    }
    return fields;
  }, [accountType]);

  const schema: ZodType<GenericEditFormData> | null = useMemo(
    () =>
      accountType
        ? (accountTypeEditSchemas[
            accountType as AccountListType['account_type_name']
          ] as ZodType<GenericEditFormData>)
        : null,
    [accountType],
  );

  const {
    formData,
    setFormData,
    validationMessages,
    setValidationMessages,
    runFieldValidation,
  } = useEditAccountForm(schema);

  // Applies one field change, recomputes the derived fields, validates both and
  // clears the feedback message.
  const updateFormAndDerivatives = useCallback(
    (
      name: string,
      value: string | number | boolean | Date | null | undefined,
    ) => {
      const newData = { ...formData, [name]: value };
      const derivedUpdates: Partial<GenericEditFormData> = {};

      accountFields.forEach((field) => {
        if (field.isDerived && typeof field.compute === 'function') {
          const calculatedValue = field.compute(
            newData as Record<string, unknown>,
          );
          if (!areValuesEqual(calculatedValue, formData[field.fieldName])) {
            derivedUpdates[field.fieldName] =
              calculatedValue as GenericEditFormData[keyof GenericEditFormData];
          }
        }
      });

      const finalData = {
        ...newData,
        ...derivedUpdates,
      } as GenericEditFormData;
      setFormData(finalData);

      runFieldValidation(name, value, finalData);

      Object.entries(derivedUpdates).forEach(([fName, fVal]) => {
        runFieldValidation(fName, fVal, finalData);
      });

      setUserMessage(undefined);
    },
    [formData, accountFields, runFieldValidation, setFormData],
  );

  // Snapshot of the served values, the baseline for isDirty. A ref, not state:
  // written once per load, and nothing should re-render when it changes.
  const pristineDataRef = useRef<GenericEditFormData | null>(null);

  useEffect(() => {
    if (accountData && accountFields.length > 0) {
      const initialData: GenericEditFormData = {} as GenericEditFormData;
      accountFields.forEach((field: FieldConfigType) => {
        const key = field.fieldName as keyof typeof accountData;
        const val = accountData[key];

        // null is dropped along with undefined: the field schemas are
        // .optional(), so a NULL column seeded as null fails validation and
        // aborts the whole submit, not just its own field.
        if (val !== undefined && val !== null) {
          // No date parsing here: pockets, the only accounts with a date
          // field, are edited on their own screen.
          initialData[field.fieldName] =
            val as GenericEditFormData[keyof GenericEditFormData];
        }
      });
      pristineDataRef.current = initialData;
      setFormData(initialData);
    }
  }, [accountData, accountFields, setFormData]);

  // Compared by value against the snapshot, not a "touched" flag: a field
  // edited and put back is not a change. areValuesEqual also resolves Date.
  const isDirty = useMemo(() => {
    const pristine = pristineDataRef.current;
    if (!pristine) return false;

    return accountFields.some(
      (field: FieldConfigType) =>
        !areValuesEqual(formData[field.fieldName], pristine[field.fieldName]),
    );
  }, [formData, accountFields]);

  const handleTextChange = useCallback(
    (fieldName: string) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateFormAndDerivatives(fieldName, e.target.value);
      },
    [updateFormAndDerivatives],
  );

  const handleDropdownChange = useCallback(
    (fieldName: string) => (option: DropdownOptionType | null) => {
      updateFormAndDerivatives(fieldName, option ? option.value : '');
    },
    [updateFormAndDerivatives],
  );

  const handleDateChange = useCallback(
    (fieldName: string) => (date: Date) => {
      updateFormAndDerivatives(fieldName, date);
    },
    [updateFormAndDerivatives],
  );

  const onSubmitForm = async (e: React.MouseEvent) => {
    e.preventDefault();

    // The button is already disabled here; this covers a keyboard-fired submit,
    // which reaches the handler whatever the control looks like.
    if (!isDirty) return;

    if (!accountType) {
      console.error('Submission failed: account type is not defined.');
      return;
    }
    if (!schema) {
      console.error('Submission failed: Zod schema is not defined.');
      return;
    }

    const { errors, data: validatedData } = validateForm(schema, formData);

    if (Object.keys(errors).length > 0) {
      setValidationMessages(
        errors as ValidationMessagesType<GenericEditFormData>,
      );
      console.log({ errors });

      setUserMessage({ message: 'Please fix validation errors', status: 400 });
      return;
    }

    if (!validatedData) return;

    const payloadToSend = {
      ...validatedData,
      type: accountType, // the edition controller needs it
    };

    const result = await requestFn(payloadToSend as GenericEditFormData, {});

    if (result.data) {
      // Announced rather than invalidating caches directly: this screen should
      // not know which caches went stale. Covers a rename, category or nature
      // change; the budget block invalidates for the amount itself.
      notifyAccountChanged();
      setUserMessage({ message: 'Account updated successfully!', status: 200 });
      setTimeout(() => {
        navigateTo(previousRoute, { state: returnState, viewTransition: true });
      }, 500);
    }
  };
  const isFormDisabled = isFetching || isSaving || !accountData || !schema;
  const finalError = fetchError || saveError;

  // Budget block, category_budget accounts only. Writes through PUT
  // /budget/accounts/:accountId/current, the only endpoint that can state an FX
  // origin and a range.
  const isCategoryBudget = accountType === 'category_budget';
  const numericAccountId = accountId ? Number(accountId) : null;

  const [budgetAccountStatus, setBudgetAccountStatus] =
    useState<BudgetAccountStatus | null>(null);
  // The month the status is about, as the server resolved it. Not
  // useBudgetStatusStore's referenceMonth, which follows whatever month the
  // budget screens have on screen.
  const [budgetReferenceMonth, setBudgetReferenceMonth] = useState<
    string | null
  >(null);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);
  const [budgetFetchError, setBudgetFetchError] = useState<string | null>(
    null,
  );
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetSaveError, setBudgetSaveError] =
    useState<BudgetErrorResponse | null>(null);

  // No month argument: the server resolves the current one from the owner's
  // timezone, the same month the write path writes. [accountIds] scopes the
  // request to this account instead of every budget account the user owns.
  const fetchBudgetAccountStatus = useCallback(async () => {
    if (!isCategoryBudget || numericAccountId === null) return;

    setIsBudgetLoading(true);
    setBudgetFetchError(null);

    try {
      const response = await getBudgetAccountsStatus([numericAccountId]);
      setBudgetAccountStatus(response.accounts[0] ?? null);
      setBudgetReferenceMonth(response.referenceMonth);
    } catch (err: unknown) {
      setBudgetFetchError(
        err instanceof Error ? err.message : 'Failed to load the budget.',
      );
    } finally {
      setIsBudgetLoading(false);
    }
  }, [isCategoryBudget, numericAccountId]);

  useEffect(() => {
    fetchBudgetAccountStatus();
  }, [fetchBudgetAccountStatus]);

  const closeBudgetEditor = () => {
    setIsEditingBudget(false);
    setBudgetSaveError(null);
  };

  // Does not close the modal on success: the modal decides whether a
  // confirmation renders, and closing here would make that branch unreachable.
  const handleSaveBudget = async ({
    amount,
    currency,
    month,
    appliesUntil,
  }: BudgetWriteRequest) => {
    if (numericAccountId === null) return null;

    setIsSavingBudget(true);
    setBudgetSaveError(null);

    try {
      const response = await setCurrentBudget(numericAccountId, {
        amount,
        currency,
        month,
        appliesUntil,
      });

      // Refetch this block's now-stale copy and invalidate the shared store's
      // memo so a budget screen opened later does not read the replaced value.
      await fetchBudgetAccountStatus();
      useBudgetStatusStore.getState().invalidate();

      return response;
    } catch (err: unknown) {
      setBudgetSaveError(normalizeBudgetError(err));
      return null;
    } finally {
      setIsSavingBudget(false);
    }
  };

  return (
    <>
      <section className='page__container'>
        <TopWhiteSpace variant={'dark'} />

        <div className='page__content'>
          <Link
            to={previousRoute}
            state={returnState}
            className='form__header main__title--container '
          >
            <div className='form__header--icon backArrow backArrow--dark'>
              {<LeftArrowSvg />}
            </div>
            <div className='form__title'>{'Edit Account'}</div>
          </Link>

          {/* Loading, error and empty are three separate states. Loading is a
              skeleton because the form's shape is known. */}
          {isFetching && (
            <div className='editAccount__formSkeleton' aria-hidden='true'>
              <span className='editAccount__skeletonField' />
              <span className='editAccount__skeletonField' />
              <span className='editAccount__skeletonField' />
              <span className='editAccount__skeletonField' />
            </div>
          )}

          {/* A message plus a retry: a manual reload would lose the route the
              editor was opened from. */}
          {!isFetching && fetchError && (
            <div className='editAccount__fetchError' role='alert'>
              <p className='editAccount__fetchErrorText'>
                The account could not be loaded: {fetchError}
              </p>
              <button
                type='button'
                className='editAccount__retry'
                onClick={refetchAccount}
              >
                Retry
              </button>
            </div>
          )}

          {/* Distinct from the error above: the request succeeded, but the id
              names no account of this user. */}
          {!isFetching && !fetchError && !accountData && (
            <p className='editAccount__emptyState'>
              This account no longer exists, or it is not yours to edit.
            </p>
          )}

          {/* The account exists but the module has no field list for its type:
              a configuration gap, not a fetch state. */}
          {!isFetching && accountType && accountFields.length === 0 && (
            <p className='editAccount__emptyState'>
              This account type cannot be edited yet: {accountType}
            </p>
          )}

          {/* Above the form: Save Changes must be last, and this block is written by a
              different endpoint. Has its own fetch states: skeleton, retry message, figures. */}
          {isCategoryBudget && (
            <div className='editAccount__budgetBlock'>
              {isBudgetLoading && !budgetAccountStatus && (
                <div
                  className='editAccount__budgetSkeleton'
                  aria-hidden='true'
                />
              )}

              {!isBudgetLoading && budgetFetchError && !budgetAccountStatus && (
                <div className='editAccount__budgetError'>
                  <p className='error-message'>
                    Could not load the budget: {budgetFetchError}
                  </p>
                  <button
                    type='button'
                    className='editAccount__budgetRetry'
                    onClick={fetchBudgetAccountStatus}
                  >
                    Retry
                  </button>
                </div>
              )}

              {budgetAccountStatus && (
                <>
                  {/* Names the month only, not the account: a copy of the editable name would
                      disagree with what is typed. A label, not a picker: this screen writes
                      only the current month; reaching forward is the modal's appliesUntil. */}
                  <div className='editAccount__budgetCaption'>
                    <span className='editAccount__budgetMonth'>
                      {formatBudgetMonthLabel(budgetReferenceMonth)}
                    </span>
                  </div>

                  <SummaryDetailBox
                    bubleInfo={{
                      title: 'Budget',
                      amount: budgetAccountStatus.budgetAmount,
                      subtitle1: 'Spent',
                      amount1: budgetAccountStatus.actualSpent,
                      status: budgetAccountStatus.isOverBudget,
                      amount2: budgetAccountStatus.remainingBudget,
                      currency_code: budgetAccountStatus.currency,
                      executionPercentage:
                        budgetAccountStatus.executionPercentage,
                    }}
                    action={
                      <button
                        type='button'
                        className='editAccount__editBudgetBtn'
                        onClick={() => setIsEditingBudget(true)}
                        aria-label={`Edit budget for ${budgetAccountStatus.subcategory ?? budgetAccountStatus.accountName}`}
                        title='Edit budget'
                      >
                        <EditSvg />
                      </button>
                    }
                  />

                  {budgetAccountStatus.nextMonthBudget !==
                    budgetAccountStatus.budgetAmount && (
                    <div className='editAccount__budgetActions'>
                      <span
                        className='editAccount__budgetException'
                        title='This amount applies to this month only'
                      >
                        this month only
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* The account's own fields and the button that writes them, last on
              the page. */}
          {!isFetching && !!accountType && accountFields.length > 0 && (
            <form className='form__box'>
              <div className='form__input__group'>
                <div className='form__container'>
                  {accountFields.map((fieldConfig) => (
                    <UniversalDynamicInput
                      key={fieldConfig.fieldName}
                      fieldConfig={fieldConfig as FieldConfigType}
                      formData={formData}
                      setFormData={setFormData}
                      validationMessages={validationMessages}
                      handleDropdownChange={handleDropdownChange}
                      handleDateChange={handleDateChange}
                      handleInputNumberChange={handleTextChange}
                      isReset={false}
                    />
                  ))}
                </div>
              </div>
              <div className='submit__btn__container'>
                <FormSubmitBtn
                  onClickHandler={onSubmitForm}
                  disabled={isFormDisabled || !accountId || !isDirty}
                >
                  Save Changes
                </FormSubmitBtn>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Mounted outside <section>, like CategoryDetail's panel, so it does not
          scroll with the frame under it. */}
      {isEditingBudget && budgetAccountStatus && (
        <BudgetEditModal
          accountName={
            budgetAccountStatus.subcategory ?? budgetAccountStatus.accountName
          }
          nature={budgetAccountStatus.nature}
          month={budgetReferenceMonth ?? ''}
          currency={budgetAccountStatus.currency}
          currentAmount={budgetAccountStatus.budgetAmount}
          nextMonthBudget={budgetAccountStatus.nextMonthBudget}
          actualSpent={budgetAccountStatus.actualSpent}
          remainingBudget={budgetAccountStatus.remainingBudget}
          executionPercentage={budgetAccountStatus.executionPercentage}
          isOverBudget={budgetAccountStatus.isOverBudget}
          isSaving={isSavingBudget}
          error={budgetSaveError}
          onClose={closeBudgetEditor}
          onSave={handleSaveBudget}
        />
      )}

      <section className='Toastify'>
        <MessageToUser
          isLoading={isSaving}
          error={finalError}
          messageToUser={userMessage}
          variant='form'
        />
      </section>
    </>
  );
}

export default EditAccount;

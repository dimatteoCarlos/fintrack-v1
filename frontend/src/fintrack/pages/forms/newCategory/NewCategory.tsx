import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import LeftArrowSvg from '../../../../assets/LeftArrowSvg.svg';
import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import LabelNumberValidation from '../../../general_components/labelNumberValidation/LabelNumberValidation.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';
import FormDatepicker from '../../../general_components/datepicker/Datepicker.tsx';

import { validationData } from '../../../validations/utils/custom_validation.ts';

import '../styles/forms-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';

import useAuth from '../../../../auth/hooks/useAuth.ts';
import useInputNumberHandler from '../../../hooks/useInputNumberHandler.ts';
import { useFetchLoad } from '../../../hooks/useFetchLoad.ts';
import { useRatePreview } from '../../../hooks/useRatePreview.ts';
import { readAmountInCurrency } from '../../../helpers/amountInCurrency.ts';
import { notifyAccountChanged } from '../../../stores/transactionEvents.ts';

import { url_create_category_budget_account } from '../../../../urlConfig.ts';

import { CurrencyType, FormNumberInputType } from '../../../types/types.ts';

import {
  DEFAULT_CURRENCY,
  TILE_LABELS,
  VARIANT_FORM,
} from '../../../helpers/constants.ts';

import {
  earliestDatableDay,
  getCurrentBudgetMonthLabel,
  latestDatableDay,
  toCalendarDay,
} from '../../../helpers/functions.ts';

import { CreateCategoryBudgetAccountApiResponseType } from '../../../types/responseApiTypes.ts';
import { normalizeError } from '../../../helpers/normalizeError.ts';
import { AUTH_ROUTE } from '../../../../auth/auth_constants/constants.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';
import CharacterCounter from '../../../general_components/characterCounter/CharacterCounter.tsx';

import { useAccountExistence } from '../../../hooks/useAccountExistence.ts';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback.ts';
import {
  buildCategoryAccountName,
  extractCategories,
  extractSubcategories,
} from '../../../helpers/newCategoryHelper.ts';

const defaultCurrency = DEFAULT_CURRENCY;
const tileTitle = 'Category Nature';

type CategoryDataType = {
  category: string;
  subcategory?: string;
  amount: number | '';
  nature: string;
  currency?: CurrencyType;
  date: Date;
};

type CategoryBudgetPayloadType = {
  name: string;
  type: 'category_budget';
  currency: CurrencyType;
  budget: number | string;
  // The opening day travels twice. `date` dates the account row;
  // `transactionActualDate` dates the movement that opens it, which
  // accountCategoryCreationcontroller.js:53-56 otherwise stamps with the server
  // clock — leaving a backdated category reporting nothing for the months
  // between its starting point and its creation.
  date: Date | string;
  transactionActualDate: string;
  nature: string;
  subcategory?: string;
  user?: string;
};

// Both ends of the opening window come from the shared helpers, so this calendar
// cannot disagree with New Account's or New Profile's.
const latestOpeningDay = latestDatableDay;
const earliestOpeningDay = earliestDatableDay;

const initialNewCategoryData: CategoryDataType = {
  category: '',
  subcategory: '',
  amount: '',
  nature: '',
  currency: defaultCurrency,
  date: new Date(),
};
const formDataNumber = { keyName: 'amount', title: 'budget' };
const initialFormData: FormNumberInputType = {
  [formDataNumber.keyName]: '',
};

function NewCategory() {
  const location = useLocation();
  const navigateTo = useNavigate();
  const { isAuthenticated, userData } = useAuth();

  const [formData, setFormData] =
    useState<FormNumberInputType>(initialFormData);

  const [categoryData, setCategoryData] = useState<CategoryDataType>(
    initialNewCategoryData,
  );
  const [activeNature, setActiveNature] = useState(
    initialNewCategoryData.nature,
  );
  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [messageToUser, setMessageToUser] = useState<
    { message: string; status?: number } | string | null | undefined
  >(null);

  // A field's required-error shows only once it has been touched.
  const [touched, setTouched] = useState<{ category: boolean; subcategory: boolean }>({
    category: false,
    subcategory: false,
  });

  const previewAccountName = useMemo(() => {
    const fullName = buildCategoryAccountName(
    categoryData.category,
    categoryData.subcategory,
    categoryData.nature,
   );
   
     return fullName;

  }, [categoryData.category, categoryData.subcategory, categoryData.nature]);

  // The badge cycles the ORIGIN currency, the one the user thinks in. The backend
  // converts it before storing, so the preview states what will actually be saved.
  const selectedCurrency = categoryData.currency ?? defaultCurrency;

  function updateDataCurrency(currency: CurrencyType) {
    setCategoryData((data) => ({ ...data, currency }));
  }

  function changeStartingPoint(selectedDate: Date) {
    setCategoryData((data) => ({ ...data, date: selectedDate }));
  }

  // The allocation is written to the month the account starts in, which is now
  // the day the picker holds rather than always the current one.
  const currentBudgetMonth = getCurrentBudgetMonthLabel(
    userData?.timezone,
    undefined,
    categoryData.date,
  );

  // formData keeps what was typed; the currency only decides how it is read,
  // so leaving the yen brings the typed decimals back.
  const { amountToSave, displayedAmount } = readAmountInCurrency(
    formData[formDataNumber.keyName],
    selectedCurrency,
  );

  // Dated: the budget takes the rate of the day the category opens on, the same
  // day accountCategoryCreationController.js converts the amount with.
  const openingDay = toCalendarDay(categoryData.date);
  const ratePreview = useRatePreview(amountToSave, selectedCurrency, openingDay);
  const showRatePreview = ratePreview.status === 'resolved';

  const [duplicateHelperMessage, setDuplicateHelperMessage] = useState<string>('');

  const { getSuggestions, checkDuplicate } = useAccountExistence();

  const categoryBudgetNames = useMemo(() => {
    return getSuggestions('category_budget');
  }, [getSuggestions]);

  const uniqueCategories = useMemo(() => {
    return extractCategories(categoryBudgetNames);
  }, [categoryBudgetNames]);

  const uniqueSubcategories = useMemo(() => {
    return extractSubcategories(categoryBudgetNames);
  }, [categoryBudgetNames]);

   const debouncedCheckDuplicate = useDebouncedCallback((categoryData
   : CategoryDataType)  => {
     const fullName = buildCategoryAccountName(
       categoryData.category,
       categoryData.subcategory,
       categoryData.nature
     );

  console.log('🔍 fullName:', fullName);

  if (!fullName) {
    setDuplicateHelperMessage('');
    return;
  }

  const exists = checkDuplicate(fullName, 'category_budget');
  console.log('🔍 duplicate found:', exists);

  if (exists) {
    setDuplicateHelperMessage('ℹ️ This account name already exists');
  } else {
    setDuplicateHelperMessage('');
  }
}, 300);
 
  useEffect(() => {
    if (!isAuthenticated) {
      setMessageToUser('Please log in to create an account');
      setTimeout(() => navigateTo(AUTH_ROUTE), 5000);
    }
  }, [isAuthenticated, navigateTo]);

  const {
    isLoading,
    error,
    requestFn,
  } = useFetchLoad<
    CreateCategoryBudgetAccountApiResponseType,
    CategoryBudgetPayloadType
  >({ url: url_create_category_budget_account, method: 'POST' });
  // HTTP errors (400, 500) arrive in responseData with their status and message;
  // network errors arrive in requestError; anything unexpected goes to the catch.

  const { inputNumberHandlerFn } = useInputNumberHandler(
    setFormData,
    setValidationMessages,
    setCategoryData,
    undefined,
    undefined,
    // The budget takes the chosen currency's decimals: none for the yen.
    selectedCurrency,
  );

  const validateTextInRealTime = (fieldName: 'category' | 'subcategory', value: string) => {
    const trimmed = value.trim();
    const isValid = trimmed !== '';

    setValidationMessages(prev => {
      const newMessages = { ...prev };
      if (!isValid && touched[fieldName]) {
        const label = fieldName === 'category' ? 'Category' : 'Subcategory';
        newMessages[fieldName] = `* Please provide the ${label}`;
      } else if (isValid) {
        delete newMessages[fieldName];
      }
      return newMessages;
    });
  };

  function inputHandler(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    const { name, value } = e.target;

    if (name === formDataNumber.keyName) {
      inputNumberHandlerFn(name, value);
    } else {
      const nextData = { ...categoryData, [name]: value };
      setCategoryData(nextData);
      
    if (name === 'category' || name === 'subcategory') {
      setTouched(prev => ({ ...prev, [name]: true }));
      validateTextInRealTime(name as 'category' | 'subcategory', value);
      debouncedCheckDuplicate(nextData);
     }
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'category' || name === 'subcategory') {
      setTouched(prev => {
        if (prev[name as 'category' | 'subcategory']) return prev;
        return { ...prev, [name]: true };
      });

      validateTextInRealTime(name as 'category' | 'subcategory', value);
      // onChange already committed categoryData, so it is current here.
      debouncedCheckDuplicate(categoryData);
    }
  };

  function natureHandler(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const activeNature = e.currentTarget.id ? e.currentTarget.id : '';

    // nextData carries the new value straight to the duplicate check; state updates are async.

    const nextData = { ...categoryData, nature: activeNature };

    setActiveNature(activeNature);
     setCategoryData(nextData);

    debouncedCheckDuplicate(nextData);
  }

  async function onSubmitForm(e: React.MouseEvent<HTMLButtonElement>) {
   e.preventDefault();
   setMessageToUser(null);

   const subcategoryTrimmed = categoryData.subcategory?.trim() || '';
   if (!subcategoryTrimmed) {
     setValidationMessages(prev => ({
       ...prev,
       subcategory: '* Please provide the Subcategory'
     }));

     // Touched, so the error persists.
     setTouched(prev => ({ ...prev, subcategory: true }));

     return;
   }

    if (!isAuthenticated) {
      setMessageToUser('Please log in to create an account');
      return;
    }
    // The amount is read under the currency selected now, not the one it was typed under.
    const amount = amountToSave ?? '';
    const newValidationMessages = {
      ...validationData(
        { ...categoryData, amount },
        { nonZeroFields: ['amount'] },
      ),
    };

    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }

    try {
      const payload: CategoryBudgetPayloadType = {
        name: categoryData.category.toLowerCase().trim(),
        type: 'category_budget',
        currency: categoryData?.currency ?? defaultCurrency,
        budget: amount,
        date: categoryData.date.toISOString(),
        transactionActualDate: openingDay,
        nature: categoryData.nature,
        subcategory: categoryData.subcategory || undefined,
      };

      const { data: responseData, error: requestError } =
        await requestFn(payload);
      if (requestError) {
        console.log('🔴 Network error:', requestError);
        setMessageToUser({
          message: requestError,
          status: 500,
        });
        return;
      }
      if (responseData) {
        if (responseData.status >= 200 && responseData.status < 300) {
          setMessageToUser({
            message: responseData.message || 'Category created successfully!',
            status: responseData.status,
          });
          setActiveNature(initialNewCategoryData.nature);
          setValidationMessages({});
          setFormData(initialFormData);
          setCategoryData(initialNewCategoryData);

          // Announced, not invalidated here: the form does not know which
          // caches a new budget account made stale.
          notifyAccountChanged();
        } else {
          console.log('❌ Server error - setting message');
          setMessageToUser({
            message: responseData.message || 'Server error',
            status: responseData.status,
          });
        }
      }

      if (import.meta.env.VITE_ENVIRONMENT === 'development') {
        console.log('Data from New Category request:', responseData);
      }
    } catch (error) {
      console.log('🔥 Unexpected error:', error);
      const { message, status } = normalizeError(error);
      setMessageToUser({ message, status });
    }
  }
  useEffect(() => {
    if (messageToUser) {
      const timer = setTimeout(() => {
        setMessageToUser(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [messageToUser]);
  return (
    <section className='account__page__container page__container'>
      <TopWhiteSpace variant={'dark'} />
      <div className='page__content'>
        <div className='main__title--container'>
          <Link
            to={location.state.previousRoute}
            relative='path'
            className='backArrow backArrow--dark'
          >
            <LeftArrowSvg />
          </Link>

          <div className='form__title'>{'New Category'}</div>
        </div>

        <div className='month-badge month-badge--dark'>{currentBudgetMonth}</div>

        <form className='form__box'>
          <div className='container--categoryName form__container'>
            <div className='input__box'>
              <label htmlFor='category' className='label forms__label'>
                {'Category Name'}&nbsp;
                <CharacterCounter
                  value={categoryData.category}
                  maxLength={NAME_MAX_LENGTHS.category_name}
                />{' '}
                &nbsp;
                <span className='validation__errMsg'>
                  {validationMessages['category']}
                </span>
              </label>

              <input
                type='text'
                className={`input__container`}
                placeholder={`Category Name`}
                id={'category'}
                name={'category'}
                onChange={inputHandler}
                onBlur = {handleBlur}
                value={categoryData.category}
                maxLength={NAME_MAX_LENGTHS.category_name}
                list='category-suggestions' 

              />
             <datalist id='category-suggestions'>
             {uniqueCategories
             .map((name)=>(
              <option key={name} value={name}/>)
             )}
              </datalist> 
            </div>

            <div className='input__box'>
              <label htmlFor='subcategory' className='label forms__label'>
                {'Subcategory'}&nbsp;
                <CharacterCounter
                  value={categoryData.subcategory!}
                  maxLength={NAME_MAX_LENGTHS.subcategory}
                />{' '}
                &nbsp;
              </label>
              <div className='validation__errMsg'>
                {validationMessages['subcategory']}
              </div>

              <input
                type='text'
                className={`input__container`}
                placeholder={`subcategory name`}
                id={'subcategory'}
                name={'subcategory'}
                onBlur={handleBlur}
                onChange={inputHandler}
                value={categoryData.subcategory}
                maxLength={NAME_MAX_LENGTHS.subcategory}
                list='subcategory-suggestions'
              />

            <datalist id='subcategory-suggestions'>
              {uniqueSubcategories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
           </div>

            {/* STARTING POINT - the day the category opens on, also the month its
                first allocation lands in and the day its budget converts at. */}
            <div className='input__box'>
              <label className='label forms__label'>{'Starting Point'}</label>
              <div className='form__datepicker__container'>
                <FormDatepicker
                  changeDate={changeStartingPoint}
                  date={categoryData.date}
                  variant={'form'}
                  minDate={earliestOpeningDay()}
                  maxDate={latestOpeningDay()}
                ></FormDatepicker>
              </div>
            </div>

            <div className='input__box'>
              {/* Label and conversion message share a row, as in the tracker;
                  the rate tooltip opens over the message. */}
              <div className='form__label-row'>
                <LabelNumberValidation
                  formDataNumber={formDataNumber}
                  validationMessages={validationMessages}
                  variant={VARIANT_FORM}
                />

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
                <input
                  className={'input__container'}
                  type='text'
                  id={formDataNumber.keyName}
                  name={formDataNumber.keyName}
                  placeholder={formDataNumber.title}
                  value={displayedAmount}
                  onChange={inputHandler}
                  autoComplete='off'
                />

                <CurrencyBadge
                  variant={VARIANT_FORM}
                  updateOutsideCurrencyData={updateDataCurrency}
                  currency={selectedCurrency}
                />
              </div>
            </div>
          </div>

          <div className='container--nature input__box'>
            <div className='form__title form__title--tiles label forms__label'>
              {tileTitle}
              <div className='validation__errMsg'>
                {validationMessages['nature']}
              </div>
            </div>
            <div className='nature__tiles'>
              {TILE_LABELS.map((label, indx) => {
                return (
                  <button
                    className='nature__btn tile__button'
                    onClick={natureHandler}
                    key={`${indx}-tile`}
                    id={`${label.labelText.toLowerCase()}`}
                    style={
                      activeNature.toLowerCase() ===
                      label.labelText.toLowerCase()
                       ? {
                           backgroundColor: 'var(--creme)',
                           color: 'var(--dark)',
                         }
                       : {}
                    }
                  >
                    {label.labelText}
                  </button>
                );
              })}
            </div>
          </div>

         <div className='input__box'>
           <label className='label forms__label' style={{ color: 'var(--creme)',fontSize:'1rem',fontWeight:'300', opacity: 0.6}}>
           Account name to be created:
           </label>
           <input
             type='text'
             className='input__container readonly'
             readOnly
             value={previewAccountName || ' category/subcategory/nature'}
             style={{
             color: previewAccountName ? 'cyan' : 'var(--secondary)',
             fontStyle: previewAccountName ? 'normal' : 'italic',
             backgroundColor: 'rgba(255,255,255,0.03)', opacity:'0.8',fontWeight:'300'
             }}
           />
         </div>

          {duplicateHelperMessage && (
            <div className="duplicate-helper" style={{ margin: '0.5rem 0' }}>
              <span className="validation__msg--info">
                {duplicateHelperMessage}
              </span>
            </div>
          )}
          <div className='submit__btn__container'>
            <FormSubmitBtn onClickHandler={onSubmitForm} disabled={isLoading}>
              save
            </FormSubmitBtn>
          </div>
        </form>

        <MessageToUser
          isLoading={isLoading}
          error={error}
          messageToUser={messageToUser}
          variant='form'
        />
      </div>
    </section>
  );
}
export default NewCategory;
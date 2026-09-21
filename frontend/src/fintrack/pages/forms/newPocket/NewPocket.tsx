import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../styles/forms-styles.css';

import useInputNumberHandler from '../../../hooks/useInputNumberHandler.ts';
import { useRatePreview } from '../../../hooks/useRatePreview.ts';
import { readAmountInCurrency } from '../../../helpers/amountInCurrency.ts';
import useAuth from '../../../../auth/hooks/useAuth.ts';
import { validationData } from '../../../validations/utils/custom_validation.ts';
import { normalizeError } from '../../../helpers/normalizeError.ts';
import {
  toCalendarDay,
} from '../../../helpers/functions.ts';
import { createPocket } from '../../../api/pocketApi.ts';
import { usePocketDetailStore } from '../../../stores/usePocketDetailStore.ts';
import { usePocketBoardStore } from '../../../stores/usePocketBoardStore.ts';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import FormDatepicker from '../../../general_components/datepicker/Datepicker.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';

import LeftArrowSvg from '../../../../assets/LeftArrowSvg.svg';

import { CurrencyType, FormNumberInputType } from '../../../types/types.ts';
import { CreatePocketBody } from '../../../types/pocketTypes.ts';
import { DEFAULT_CURRENCY } from '../../../helpers/constants.ts';

import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';
import CharacterCounter from '../../../general_components/characterCounter/CharacterCounter.tsx';

type PocketDataType = {
  name: string;
  note: string;
  currency?: CurrencyType;
  desiredDate: Date;
  amount?: number | '';
};

const defaultCurrency = DEFAULT_CURRENCY;
// First day the calendar offers, from the device clock. Not the rule: the server
// refuses today or earlier on the owner's calendar (pocketController.js).
const startOfTomorrow = (): Date => {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

// A function, so a form opened or reset after midnight proposes the new tomorrow.
const initialNewPocketData = (): PocketDataType => ({
  name: '',
  note: '',
  amount: '',
  desiredDate: startOfTomorrow(),
  currency: defaultCurrency,
});

const formDataNumber = { keyName: 'amount', title: 'target' };
const initialFormData: FormNumberInputType = {
  [formDataNumber.keyName]: '',
};
function NewPocket() {
  const location = useLocation();
  const navigateTo = useNavigate();

  const { isAuthenticated, isCheckingAuth } = useAuth();

  const [formData, setFormData] =
    useState<FormNumberInputType>(initialFormData);

  const [pocketData, setPocketData] =
    useState<PocketDataType>(initialNewPocketData);

  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [messageToUser, setMessageToUser] = useState<
    { message: string; status?: number } | string | null | undefined
  >(null);

  // Local state, not useFetchLoad: the response is the next screen's payload, handed
  // to the detail store, so a hook holding it would keep a copy this screen never shows.
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { inputNumberHandlerFn } = useInputNumberHandler(
    setFormData,
    setValidationMessages,
    setPocketData,
    undefined,
    undefined,
    // The target takes the chosen currency's decimals: none for the yen.
    pocketData.currency ?? defaultCurrency,
  );
  function inputHandler(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    e.preventDefault();
    const { name, value } = e.target;

    if (name === formDataNumber.keyName) {
      inputNumberHandlerFn(name, value);
    } else {
      setPocketData((prev) => ({ ...prev, [name]: value }));
    }
  }
  const changeDesiredDate = useCallback((selectedDate: Date): void => {
    setPocketData((data) => ({
      ...data,
      desiredDate: selectedDate,
    }));
  }, []);
  const selectedCurrency = pocketData.currency ?? defaultCurrency;

  function updateDataCurrency(currency: CurrencyType) {
    setPocketData((data) => ({ ...data, currency }));
  }

  // formData keeps what was typed; the currency only decides how it is read,
  // so leaving the yen brings the typed decimals back.
  const { amountToSave, displayedAmount } = readAmountInCurrency(
    formData[formDataNumber.keyName],
    selectedCurrency,
  );

  // States what the backend will store as the target, which is the figure the
  // pocket detail compares against the balance.
  const ratePreview = useRatePreview(amountToSave, selectedCurrency);
  const showRatePreview = ratePreview.status === 'resolved';

  async function onSubmitForm(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    if (!isAuthenticated) {
      setMessageToUser('Your session has expired. Please log in again.');
      return;
    }

    // The amount is read under the currency selected now, not the one it was typed under.
    const amount = amountToSave ?? '';
    const newValidationMessages = {
      ...validationData(
        { ...pocketData, amount },
        { nonZeroFields: ['amount'] },
      ),
    };

    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }

    setIsSubmitting(true);
    setMessageToUser(null);

    try {
      // The strict schema accepts only these five keys; `type` or `user` would be a
      // 400, since identity comes from the token.
      const payload: CreatePocketBody = {
        name: pocketData.name.toLowerCase().trim(),
        currency: pocketData.currency ?? defaultCurrency,
        targetAmount: Number(amount),
        // The user's calendar day, converted once here and never sent as an instant.
        desiredDate: toCalendarDay(pocketData.desiredDate),
      };

      // Omitted rather than sent empty: the column is nullable and '' is a note
      // nobody wrote.
      const note = pocketData.note.trim();
      if (note) payload.note = note;

      const detail = await createPocket(payload);

      setValidationMessages({});
      setFormData(initialFormData);
      setPocketData(initialNewPocketData());

      // The 201 carries the full detail payload, so the detail screen needs no fetch;
      // the board is only marked stale and refetches when revisited.
      usePocketDetailStore.getState().setDetail(detail);
      usePocketBoardStore.getState().invalidate();

      navigateTo(`/fintrack/pocket/pockets/${detail.pocket.pocketId}`, {
        state: { previousRoute: '/fintrack/pocket' },
      });
    } catch (error) {
      // The client throws on refused requests and network faults alike, so both land
      // here and leave the form filled in.
      console.error('🔥 Error creating the pocket', error);
      const { message, status } = normalizeError(error);
      setMessageToUser({ message, status });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isFormDisabled = !isAuthenticated;
  if (isCheckingAuth) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div>Checking authentication...</div>
          </div>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h3>Authentication Required</h3>
            <p>Please log in to create a new pocket.</p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className='newPocket__page page__container'>
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

          <div className='form__title'>{'New Pocket'}</div>
        </div>

        <form className='form__box' autoComplete='off'>
          <div className='container--pocketName form__container'>
            <div className='input__box'>
              <label htmlFor='name' className='label forms__label'>
                {'Name'}
                <CharacterCounter
                  value={pocketData.name}
                  maxLength={NAME_MAX_LENGTHS.pocket_name}
                />
                &nbsp;
                <span className='validation__errMsg'>
                  {validationMessages['name']}
                </span>
              </label>

              <input
                type='text'
                className={`input__container`}
                placeholder={`${'purpose/name'}`}
                id={'name'}
                name={'name'}
                onChange={inputHandler}
                value={pocketData['name']}
                disabled={isFormDisabled}
                maxLength={NAME_MAX_LENGTHS.pocket_name}
                autoComplete='off'
              />
            </div>
            <div className='input__box'>
              <label htmlFor='note' className='label forms__label'>
                {'Note'}
                <CharacterCounter
                  value={pocketData.note}
                  maxLength={NAME_MAX_LENGTHS.note}
                />
                &nbsp;
                <span className='validation__errMsg'>
                  {validationMessages['note']}
                </span>
              </label>

              <textarea
                className={`input__container`}
                placeholder={`${'description'}`}
                onChange={inputHandler}
                id={'note'}
                name={'note'}
                value={pocketData['note']}
                maxLength={NAME_MAX_LENGTHS.note}
                autoComplete='off'
              />
            </div>

            {/* Label and conversion message share a row, as in New Category and
                New Account. The message sits outside the label so hovering it
                does not focus the input. */}
            <div className='form__label-row'>
              <label htmlFor={formDataNumber.keyName} className='form__title1'>
                {'Target Amount'}

                <CharacterCounter
                  value={formData[formDataNumber.keyName] || ''}
                  maxLength={15}
                />

                <div
                  className={`validation__errMsg${
                    validationMessages[formDataNumber.keyName]
                      ?.toLocaleLowerCase()
                      .includes('format:')
                      ? ' validation__errMsg--ok'
                      : ''
                  }`}
                >
                  {validationMessages[formDataNumber.keyName]}
                </div>
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
              <input
                className={`input__container`}
                type='text'
                id={formDataNumber.keyName}
                name={formDataNumber.keyName}
                placeholder={formDataNumber.keyName}
                value={displayedAmount}
                onChange={inputHandler}
                maxLength={15}
                autoComplete='off'
              />

              <CurrencyBadge
                variant={'form'}
                updateOutsideCurrencyData={updateDataCurrency}
                currency={selectedCurrency}
              />
            </div>

            <label className='label '>
              {'Desired Date'}&nbsp;
              <span className='validation__errMsg'>
                {validationMessages['date']}
              </span>
            </label>

            <div className='form__datepicker__container'>
              <FormDatepicker
                changeDate={changeDesiredDate}
                date={pocketData.desiredDate}
                variant={'form'}
                minDate={startOfTomorrow()}
                popperClassName='pocket-datepicker-popper'
              />
            </div>
          </div>{' '}
          <FormSubmitBtn
            onClickHandler={onSubmitForm}
            disabled={isSubmitting || isFormDisabled}
          >
            save
          </FormSubmitBtn>
        </form>

        <MessageToUser
          isLoading={isSubmitting}
          messageToUser={messageToUser}
          variant='form'
        />
      </div>
    </section>
  );
}

export default NewPocket;

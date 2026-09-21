// Pocket editor route (not a modal: editing needs an addressable URL); sends only changed fields.

import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import '../styles/forms-styles.css';

import useInputNumberHandler from '../../../hooks/useInputNumberHandler.ts';
import { useRatePreview } from '../../../hooks/useRatePreview.ts';
import { readAmountInCurrency } from '../../../helpers/amountInCurrency.ts';
import useAuth from '../../../../auth/hooks/useAuth.ts';
import { validationData } from '../../../validations/utils/custom_validation.ts';
import { normalizeError } from '../../../helpers/normalizeError.ts';
import {
  fromCalendarDay,
  toCalendarDay,
} from '../../../helpers/functions.ts';
import { editPocket } from '../../../api/pocketApi.ts';
import { usePocketDetailStore } from '../../../stores/usePocketDetailStore.ts';
import { usePocketBoardStore } from '../../../stores/usePocketBoardStore.ts';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import FormSubmitBtn from '../../../general_components/formSubmitBtn/FormSubmitBtn.tsx';
import FormDatepicker from '../../../general_components/datepicker/Datepicker.tsx';
import { MessageToUser } from '../../../general_components/messageToUser/MessageToUser.tsx';
import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';
import CharacterCounter from '../../../general_components/characterCounter/CharacterCounter.tsx';

import LeftArrowSvg from '../../../../assets/LeftArrowSvg.svg';

import { CurrencyType, FormNumberInputType } from '../../../types/types.ts';
import { EditPocketBody } from '../../../types/pocketTypes.ts';
import { DEFAULT_CURRENCY } from '../../../helpers/constants.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';

type PocketDataType = {
  name: string;
  note: string;
  currency?: CurrencyType;
  desiredDate: Date;
  amount?: number | '';
};

type LocationStateType = {
  previousRoute?: string;
};

const formDataNumber = { keyName: 'amount', title: 'target' };

// First day the calendar offers, from the device clock: ergonomics, not the rule.
// The server refuses a new date of today or earlier on the OWNER's calendar (pocketController.js).
const startOfTomorrow = (): Date => {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

function EditPocket() {
  const location = useLocation();
  const navigateTo = useNavigate();
  const routeState = location.state as LocationStateType | null;

  // Keep the name pocketId: renaming it to accountId let a pocket id be spent
  // against the account endpoints.
  const { pocketId } = useParams();
  const parsedPocketId = Number(pocketId);
  const hasValidId = Number.isInteger(parsedPocketId) && parsedPocketId > 0;

  const returnRoute =
    routeState?.previousRoute ?? `/fintrack/pocket/pockets/${pocketId}`;

  const { isAuthenticated, isCheckingAuth } = useAuth();

  const pocket = usePocketDetailStore((store) => store.pocket);
  const isLoaded = usePocketDetailStore((store) => store.isLoaded);
  const detailError = usePocketDetailStore((store) => store.error);
  const fetchDetail = usePocketDetailStore((store) => store.fetchDetail);

  const [formData, setFormData] = useState<FormNumberInputType>({
    [formDataNumber.keyName]: '',
  });

  const [pocketData, setPocketData] = useState<PocketDataType | null>(null);

  const [validationMessages, setValidationMessages] = useState<{
    [key: string]: string;
  }>({});

  const [messageToUser, setMessageToUser] = useState<
    { message: string; status?: number } | string | null | undefined
  >(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // The store skips the request when it already holds this pocket; a refresh or
  // pasted link finds it empty and fetches. Not cleared on the way out: the detail
  // card this returns to shows the same pocket, and the save already answered with it.
  useEffect(() => {
    if (!hasValidId) return;

    void fetchDetail(parsedPocketId);
  }, [parsedPocketId, hasValidId, fetchDetail]);

  // Seeded once, when the pocket arrives: re-seeding on every store change would
  // overwrite what the owner is typing.
  useEffect(() => {
    if (pocket === null || pocketData !== null) return;

    setPocketData({
      name: pocket.name,
      note: pocket.note ?? '',
      currency: pocket.currency,
      // Built from the parts of the calendar label. new Date() on one of these
      // is UTC midnight and opens the picker on the previous day west of UTC.
      desiredDate: fromCalendarDay(pocket.desiredDate) ?? startOfTomorrow(),
      // Seeded as well as shown: the validator reads the amount from this object,
      // not the input string, and would report a missing target otherwise.
      amount: pocket.target,
    });

    setFormData({ [formDataNumber.keyName]: String(pocket.target) });
  }, [pocket, pocketData]);

  // The hook expects always-present state but pocketData is null until load. Wrapped, not cast:
  // a cast would let the hook spread null. The wrapper cannot fire before the form renders.
  const setLoadedPocketData: React.Dispatch<
    React.SetStateAction<PocketDataType>
  > = useCallback((action) => {
    setPocketData((previous) => {
      if (previous === null) return previous;

      return typeof action === 'function' ? action(previous) : action;
    });
  }, []);

  const { inputNumberHandlerFn } = useInputNumberHandler(
    setFormData,
    setValidationMessages,
    setLoadedPocketData,
    undefined,
    undefined,
    // The target takes the chosen currency's decimals: none for the yen.
    pocketData?.currency ?? pocket?.currency ?? DEFAULT_CURRENCY,
  );

  function inputHandler(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    e.preventDefault();
    const { name, value } = e.target;

    if (name === formDataNumber.keyName) {
      inputNumberHandlerFn(name, value);
    } else {
      setPocketData((prev) => (prev ? { ...prev, [name]: value } : prev));
    }
  }

  const changeDesiredDate = useCallback((selectedDate: Date): void => {
    setPocketData((data) =>
      data ? { ...data, desiredDate: selectedDate } : data,
    );
  }, []);

  const selectedCurrency =
    pocketData?.currency ?? pocket?.currency ?? DEFAULT_CURRENCY;

  function updateDataCurrency(currency: CurrencyType) {
    setPocketData((data) => (data ? { ...data, currency } : data));
  }

  // formData keeps what was typed; the currency only decides how it is read,
  // so leaving the yen brings the typed decimals back.
  const { amountToSave, displayedAmount } = readAmountInCurrency(
    formData[formDataNumber.keyName],
    selectedCurrency,
  );

  // States what the backend will store as the target.
  const ratePreview = useRatePreview(amountToSave, selectedCurrency);
  const showRatePreview = ratePreview.status === 'resolved';

  async function onSubmitForm(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    if (!isAuthenticated) {
      setMessageToUser('Your session has expired. Please log in again.');
      return;
    }

    if (pocket === null || pocketData === null) return;

    // The amount is read under the currency selected now, not the one it was typed under.
    const newValidationMessages = {
      ...validationData(
        { ...pocketData, amount: amountToSave ?? '' },
        { nonZeroFields: ['amount'] },
      ),
    };

    if (Object.values(newValidationMessages).length > 0) {
      setValidationMessages(newValidationMessages);
      return;
    }

    // Only changed fields are sent: an overdue pocket's unchanged deadline would be
    // refused as a past date, and a re-sent target drags its currency along and
    // reconverts a figure nobody touched.
    const payload: EditPocketBody = {};

    const name = pocketData.name.toLowerCase().trim();
    if (name !== pocket.name) payload.name = name;

    // Three states: emptied where a note existed sends null (clears it); empty
    // where there was none is omitted; anything else is the new text.
    const note = pocketData.note.trim();
    if (note !== (pocket.note ?? '')) {
      payload.note = note === '' ? null : note;
    }

    const targetAmount = Number(amountToSave);
    if (targetAmount !== pocket.target) {
      payload.targetAmount = targetAmount;
      // Required whenever the amount is sent: a figure without its unit is not an
      // amount, and the server converts and stores it.
      payload.currency = selectedCurrency;
    }

    const desiredDate = toCalendarDay(pocketData.desiredDate);
    if (desiredDate !== pocket.desiredDate) payload.desiredDate = desiredDate;

    // The schema refuses an empty body, so the request is not sent. A message rather
    // than a disabled button, which would leave the owner guessing why.
    if (Object.keys(payload).length === 0) {
      setMessageToUser('Nothing changed yet.');
      return;
    }

    setIsSubmitting(true);
    setMessageToUser(null);

    try {
      const detail = await editPocket(parsedPocketId, payload);

      setValidationMessages({});

      // The response is the whole detail payload with figures recomputed, so the
      // screen returned to needs no fetch. The board is only marked stale and
      // refetches when the owner visits it.
      usePocketDetailStore.getState().setDetail(detail);
      usePocketBoardStore.getState().invalidate();

      navigateTo(returnRoute, { viewTransition: true });
    } catch (error) {
      // One path for every failure: the client throws on a refused request as well
      // as on a network fault, so a 400 and a lost connection both land here and
      // leave the form filled in.
      console.error('🔥 Error editing the pocket', error);
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
          <div className='form__title'>Checking authentication...</div>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          {/* h1 and not h3: this branch returns before the header below, so it
              is the whole screen and this is its only title. */}
          <h1 className='form__title'>Authentication Required</h1>
          <p>Please log in to edit a pocket.</p>
        </div>
      </section>
    );
  }

  const header = (
    <div className='main__title--container'>
      {/* aria-label because the link holds only a glyph. "Go back", not a destination:
          returnRoute is whatever the caller passed, falling back to this pocket's detail. */}
      <Link to={returnRoute} className='backArrow backArrow--dark' aria-label='Go back'>
        <LeftArrowSvg aria-hidden='true' />
      </Link>

      {/* h1 so the page has a top-level heading. Every rule for this class selects
          the class, so the tag does not affect layout. */}
      <h1 className='form__title'>{'Edit Pocket'}</h1>
    </div>
  );

  // Four distinct states: an invalid id is not a failed request, and a request
  // still in flight is not a pocket that could not be read.
  if (!hasValidId) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          {header}
          <p>That is not a pocket.</p>
        </div>
      </section>
    );
  }

  if (detailError) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          {header}
          <p>This pocket could not be loaded.</p>
        </div>
      </section>
    );
  }

  if (!isLoaded || pocketData === null) {
    return (
      <section className='newPocket__page page__container'>
        <TopWhiteSpace variant={'dark'} />
        <div className='page__content'>
          {header}
          <div className='pocketDetail__skeletonHero' aria-hidden='true'></div>
        </div>
      </section>
    );
  }

  return (
    <section className='newPocket__page page__container'>
      <TopWhiteSpace variant={'dark'} />
      <div className='page__content'>
        {header}

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
                value={pocketData.name}
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
                value={pocketData.note}
                maxLength={NAME_MAX_LENGTHS.note}
                autoComplete='off'
              />
            </div>

            <div className='form__label-row'>
              <label htmlFor={formDataNumber.keyName} className='form__title1'>
                {'Target Amount'}

                <CharacterCounter
                  value={formData[formDataNumber.keyName] || ''}
                  maxLength={15}
                />

                <div className='validation__errMsg'>
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
          </div>

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

export default EditPocket;

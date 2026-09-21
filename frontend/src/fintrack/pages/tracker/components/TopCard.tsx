import CurrencyBadge from '../../../general_components/currencyBadge/CurrencyBadge';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection';
import RadioInput, {
 RadioInputPropsType,
} from '../../../general_components/radioInput/RadioInput';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip';

import { capitalize, toCalendarDay } from '../../../helpers/functions';
import {
 readAmountInCurrency,
 refusesDecimalSeparator,
} from '../../../helpers/amountInCurrency';

import {
 CurrencyType,
 DropdownOptionType,
 TopCardElementsType,
} from '../../../types/types';

import { ValidationMessagesType } from '../../../validations/types';
import LabelNumberValidation from '../../../general_components/labelNumberValidation/LabelNumberValidation';

import { useRatePreview } from '../../../hooks/useRatePreview';
import TransactionDateTrigger, {
 TransactionDatePropsType,
} from '../../../general_components/transactionDateTrigger/TransactionDateTrigger';

type TopCardPropType<TFormDataType extends Record<string, unknown>> = {
  topCardElements: TopCardElementsType;

  validationMessages: ValidationMessagesType<TFormDataType>;

  setValidationMessages: React.Dispatch<
    React.SetStateAction<ValidationMessagesType<TFormDataType>>
  >;

  updateTrackerData: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;

  trackerName: string;

  currency: CurrencyType;
  updateCurrency: (x: CurrencyType) => void;

  setSelectState: React.Dispatch<React.SetStateAction<TFormDataType>>;

  //general reset
  isReset: boolean;
  setIsReset: React.Dispatch<React.SetStateAction<boolean>>;

  //select dropdown reset
  isResetDropdown?: boolean;
  setIsResetDropdown?: React.Dispatch<React.SetStateAction<boolean>>;

  radioInputProps?: RadioInputPropsType;

  // The date the entry is recorded on. Optional: a view that omits it records on the day of the request (PnL
  // does, with its own labelled calendar).
  transactionDateProps?: TransactionDatePropsType;

  // The chosen day as 'YYYY-MM-DD', for a view that owns its calendar and never passes transactionDateProps;
  // without it the rate preview would use today's rate while the save uses the chosen day's.
  day?: string;

  // Handler for Transfer's special case.
  customSelectHandler?: (selectedOption: DropdownOptionType | null) => void;
};

const TopCard = <TFormDataType extends Record<string, unknown>>({
  topCardElements,
  validationMessages,
  setValidationMessages, //could be undefined
  updateTrackerData,
  trackerName,
  currency,
  updateCurrency,

  setSelectState,
  isReset,
  isResetDropdown,
  setIsResetDropdown,
  setIsReset,
  radioInputProps,
  transactionDateProps,
  day,
  customSelectHandler,
}: TopCardPropType<TFormDataType>): JSX.Element => {
  const {
    selectOptions: topCardOptions,
    selectOptions: { variant },
    titles: { title1 }, //amount
    titles: { title2 }, //account
    titles: { label2 }, //account label or title
    value, //formData.amount
  } = topCardElements;

  const accountFieldName = title2.trim().toLowerCase() as keyof TFormDataType;

  // The word above the account dropdown and the dropdown's accessible name: one constant so they cannot drift
  // (WCAG 2.5.3), and it tells Transfer's two dropdowns apart.
  const accountFieldLabel = capitalize(label2 ?? title2)
    .trim()
    .replace(/:$/, '');
  const errorMessage = validationMessages[accountFieldName] || '';
  const shouldShowError = !!validationMessages[accountFieldName];
  function stateSelectHandler(selectedOption: DropdownOptionType | null) {
    // Stores the selected option's value (the account_id); assumes account_name is unique.
    setSelectState((prev) => ({
      ...prev,
      [accountFieldName]: selectedOption?.value || '',
    }));

    // If setValidationMessages is provided, clear the field's message: the value is assigned without zod
    // validation and assumed valid.
    if (setValidationMessages) {
      setValidationMessages((prev) => {
        const newMessages = { ...prev };
        if (newMessages[accountFieldName]) {
          delete newMessages[accountFieldName];
        }
        return newMessages;
      });
    }
  }
  const finalSelectHandler = customSelectHandler || stateSelectHandler;
  // The day the row will be dated on, which the rate is resolved for. A view with no calendar records on the
  // day of the request and sends nothing.
  const chosenDay =
    day ??
    (transactionDateProps ? toCalendarDay(transactionDateProps.date) : undefined);

  // The parent keeps the typed text and the currency only decides how it is read, so leaving the yen brings the
  // typed decimals back; every tracker view re-reads the text under the current currency when it saves.
  const { amountToSave, displayedAmount } = readAmountInCurrency(value, currency);

  // Resolved by the server for the row's day, the same service the write path uses, so the figure shown is
  // the figure stored.
  const conversion = useRatePreview(amountToSave, currency, chosenDay);
  const { accountingCurrency, previewText, tooltipText } = conversion;

  const showPreview = conversion.status !== 'inactive';

  function amountChangeHandler(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (refusesDecimalSeparator(e.target.value, currency)) return;
    updateTrackerData(e);
  }
  return (
   <>
     <div className='state__card--top  '>

      {/* position: relative so the rate chip anchors to the whole row, not the narrow preview span at its right
          end, which leaves it no room except over the navbar above. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>

        <LabelNumberValidation
          formDataNumber={{ keyName: title1, title: title1 }}
          validationMessages={validationMessages}
          variant={variant}
        />

        {/* Three independent states: a rate the server could not resolve must not render like an amount that
            needs no conversion (nothing), since that is the one case where the owner most needs to be told. */}
        {showPreview && conversion.status === 'querying' && (
          <span
            className='currency-preview currency-preview--querying'
            aria-live='polite'
            aria-label={`Converting to ${accountingCurrency}`}
          />
        )}

        {showPreview && conversion.status === 'resolved' && previewText && (
          <RateTooltip
            tipText={tooltipText}
            surface='light'
            placement='row-centred'
          >
            <span className='currency-preview'>{previewText}</span>
          </RateTooltip>
        )}

        {showPreview && conversion.status === 'failed' && (
          <span
            className='currency-preview currency-preview--failed'
            role='status'
          >
            No rate — the server resolves it on save.
            <button
              type='button'
              className='currency-preview__retry'
              onClick={conversion.retry}
            >
              Retry
            </button>
          </span>
        )}
      </div>

        <div className='card__screen'>
          {/* The date leads the amount field: the amount is the movement's headline and the date is a fact about
              that movement, so "this much, on this day" reads as one. */}
          {transactionDateProps && (
            <TransactionDateTrigger {...transactionDateProps} />
          )}

          {/* The error is rendered by LabelNumberValidation as a sibling above; aria-invalid and aria-describedby
              tie it to the input so a screen reader announces the field as invalid and reads the reason. */}
          <input
            className='inputNumber'
            id={title1}
            name={title1}
            type='text'
            /* Browser form history would offer past amounts over the account selector below. */
            autoComplete='off'
            placeholder={trackerName}
            value={displayedAmount}
            onChange={amountChangeHandler}
            aria-invalid={Boolean(validationMessages[title1])}
            aria-describedby={
              validationMessages[title1] ? `${title1}-validation` : undefined
            }
          />

          <CurrencyBadge
            variant={variant}
            updateOutsideCurrencyData={updateCurrency}
            currency={currency}
          />
        </div>

        <div className='account card--title '>
          {/* The date lives in the amount field above, not here: beside the account label it read as a property of
              the account (in Transfer, "From:" plus a date came out as a date range). */}
          <div className='account__labelGroup'>
            <span className='account-label'>{accountFieldLabel}</span>
          </div>

          {radioInputProps && (
            <RadioInput
              radioOptionSelected={radioInputProps.radioOptionSelected}
              inputRadioOptions={radioInputProps.inputRadioOptions}
              setRadioOptionSelected={radioInputProps.setRadioOptionSelected}
              title={radioInputProps.title}
              labelId={title2.trim()}
              disabled={radioInputProps.disabled}
              accountTypeSelectionMode={
                radioInputProps.accountTypeSelectionMode
              }
            />
          )}
        </div>

        <span className='validation__errMsg '>
          {shouldShowError ? errorMessage : ''}
        </span>

        <DropDownSelection
          dropDownOptions={topCardOptions}
          updateOptionHandler={finalSelectHandler}
          ariaLabel={accountFieldLabel}
          isReset={isReset}
          isResetDropdown={isResetDropdown}
          setIsReset={setIsReset}
          setIsResetDropdown={setIsResetDropdown}
        />
      </div>
    </>
  );
};

export default TopCard;

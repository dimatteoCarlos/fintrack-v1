// Form that writes one month of a budget and how far it reaches (this month, up to a month, every month).
// Owns no request: onSave resolves with the server's answer, so next month's wording needs no second call.
// The caller refuses to open it over a past month.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
 CURRENCY_OPTIONS,
 DEFAULT_CURRENCY,
} from '../../../../helpers/currencyConstants';
import CurrencyBadge from '../../../../general_components/currencyBadge/CurrencyBadge';
import RateTooltip from '../../../../general_components/rateTooltip/RateTooltip';
import { StatusSquare } from '../../../../general_components/boxComponents/BoxComponents';
// The one place the readings of a budget are decided. Imported rather than
// re-derived, so this panel cannot disagree with the other budget screens.
import {
 budgetRemainWord,
 budgetSquareState,
 isUnbudgeted,
} from '../../../../helpers/budgetStatus';
// VARIANT_DEFAULT and not VARIANT_FORM: 'form' paints the badge cream, which is
// the variant for the app's dark forms and is invisible on this white dialog.
// 'tracker' is the one that names a light surface.
import {
 DATE_TEXT_FORMAT,
 VARIANT_DEFAULT,
} from '../../../../helpers/constants';
import { numberFormatCurrency } from '../../../../helpers/functions';
import { useRatePreview } from '../../../../hooks/useRatePreview';
import {
 readAmountInCurrency,
 refusesDecimalSeparator,
} from '../../../../helpers/amountInCurrency';
import { useModalDialog } from '../../../../../hooks/useModalDialog';
import { CurrencyType } from '../../../../types/types';
import {
 OPEN_ENDED,
 BudgetErrorResponse,
 BudgetNature,
 BudgetWriteRequest,
 BudgetWriteResponse,
} from '../../../../types/budgetTypes';

import './styles/budgetEditModal-styles.css';

type BudgetEditModalPropsType = {
 accountName: string;
 // What the account is for, as the level-2 row already tags it. Nullable
 // because the column is: a row without one renders no tag rather than a blank.
 nature: BudgetNature | null;
 // The month the figures below are about, as 'YYYY-MM-01'.
 month: string;
 currency: CurrencyType;
 // The four figures the form reads. currentAmount is the row's budgetAmount;
 // an amount is decided against what was already spent, so the three that
 // qualify it travel with it rather than staying on the row behind the panel.
 currentAmount: number;
 nextMonthBudget: number;
 actualSpent: number;
 remainingBudget: number;
 // Served, not derived, so the panel lights the same square as its row.
 // Nullable: a share has no denominator over a budget of zero.
 executionPercentage: number | null;
 isOverBudget: boolean | null;
 isSaving: boolean;
 // The whole error envelope, not a sentence: its errors[] names the field each
 // issue belongs to, so the message can sit beside that field. A 400's own
 // message is the constant 'Validation Error'.
 error: BudgetErrorResponse | null;
 onClose: () => void;
 // Takes the whole payload because this form decides the range; the caller only adds accountId.
 // Resolves with what the server wrote, or null when the caller has nothing wired.
 onSave: (allocation: BudgetWriteRequest) => Promise<BudgetWriteResponse | null>;
};


// How far the month selector reaches, counting the month on screen. An
// interface limit and not a server rule: the write path puts no ceiling on
// appliesUntil, so widening this is a change to this number and nothing else.
const MAX_RANGE_MONTHS = 12;

// The three shapes appliesUntil can take, named rather than derived from the
// value: 'thisMonth' and 'untilMonth' both send a month, and only the mode
// tells them apart before one is picked.
type RangeModeType = 'thisMonth' | 'untilMonth' | 'recurring';

// Digits and at most one dot: type='number' accepts '3200e90' and Number()
// reports it finite, so every downstream guard passed it. No sign: the field is
// nonnegative.
const PLAIN_DECIMAL = /^\d*\.?\d*$/;

// The limit NewPocket already puts on its Target Amount, so two money fields of
// the same app do not disagree about how long an amount may be.
const MAX_AMOUNT_LENGTH = 15;

// Declared as data so the three tiles are one loop: written out, the middle one
// drifts from its neighbours every time the row is restyled.
const RANGE_MODES: { value: RangeModeType; label: string }[] = [
 { value: 'thisMonth', label: 'This month' },
 { value: 'untilMonth', label: 'Until…' },
 { value: 'recurring', label: 'Every month' },
];

// Built from the parts and never from new Date(month): that string parses as UTC
// midnight, so west of Greenwich it renders the previous month.
const formatMonth = (month: string) => {
 const [year, monthNumber] = month.split('-').map(Number);
 if (!year || !monthNumber) return month;

 return new Date(year, monthNumber - 1, 1).toLocaleDateString(DATE_TEXT_FORMAT, {
  month: 'long',
  year: 'numeric',
 });
};

// The `count` months that follow `month`, as 'YYYY-MM-01'. Reassembled from the
// parts for the same reason formatMonth is: a Date built from the string is UTC
// midnight, and adding to it west of Greenwich lands a month early.
const monthsAfter = (month: string, count: number) => {
 const [year, monthNumber] = month.split('-').map(Number);
 if (!year || !monthNumber) return [];

 return Array.from({ length: count }, (_, index) => {
  const offset = monthNumber + index;

  return `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, '0')}-01`;
 });
};

function BudgetEditModal({
 accountName,
 nature,
 month,
 currency,
 currentAmount,
 nextMonthBudget,
 actualSpent,
 remainingBudget,
 executionPercentage,
 isOverBudget,
 isSaving,
 error,
 onClose,
 onSave,
}: BudgetEditModalPropsType) {
 const amountRef = useRef<HTMLInputElement>(null);

 // Empty rather than prefilled: the figure being replaced is already in the strip
 // above, and seeding it would open the panel holding a decision nobody has
 // taken yet.
 const [amount, setAmount] = useState('');

 // A month whose next one differs is already an exception; opening on 'recurring' would change it unasked.
 // 'untilMonth' is never initial: the payload carries only this month and the next.
 const initialRangeMode: RangeModeType =
  nextMonthBudget !== currentAmount ? 'thisMonth' : 'recurring';
 const [rangeMode, setRangeMode] = useState<RangeModeType>(initialRangeMode);

 // One short of MAX_RANGE_MONTHS: the month on screen is the first radio, not
 // an option of this list.
 const rangeOptions = useMemo(
  () => monthsAfter(month, MAX_RANGE_MONTHS - 1),
  [month],
 );
 const [untilMonth, setUntilMonth] = useState(() => rangeOptions[0] ?? month);

 // The currency the user states the amount in. It travels: the write schema
 // requires it and the server converts against it, so moving the badge alone is
 // a different budget rather than a change the payload cannot express.
 const [originCurrency, setOriginCurrency] = useState<CurrencyType>(currency);

 // Removal is a two-step confirmation in place. The contract reserves an amount
 // of 0 for it; typing a zero would be the only other way to stop budgeting, and
 // a typed zero does not read as a decision.
 const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);


 // Portalled, so #root goes inert. select() lets typing replace the amount; the panel fallback is restated
 // because naming a callback stops the hook focusing the panel. Generated titleId keeps two panels distinct.
 const { titleId, dialogProps } = useModalDialog({
  onClose,
  onInitialFocus: (panel) => {
   const input = amountRef.current;

   if (input) input.select();
   else panel.focus();
  },
 });

 // The locale is the reader's, never the amount's. Taken from the amount's own
 // currency, Intl leaves every currency unmarked and the dollar, the Colombian
 // peso and the Mexican peso all narrow to '$'.
 const locale = CURRENCY_OPTIONS[DEFAULT_CURRENCY];
 const asMoney = (value: number) =>
  numberFormatCurrency(value, 2, currency, locale);

 // Word and square come from the helper that owns the threshold, so they match the other budget screens.
 // The square is withheld on an unbudgeted account: nothing budgeted and nothing spent is no reading.
 const unbudgeted = isUnbudgeted(currentAmount, actualSpent);
 const isOver =
  budgetRemainWord(currentAmount, actualSpent, remainingBudget) === 'over';

 // An empty field is not an incomplete form: it means the amount stays as it is,
 // so the range alone can be changed and saved without retyping the figure.
 const isBlank = amount.trim() === '';

 // amount keeps what was typed; the currency only decides how it is read, so
 // leaving the yen brings the typed decimals back.
 const { amountToSave, displayedAmount } = readAmountInCurrency(
  amount,
  originCurrency,
 );
 const parsedAmount = isBlank ? currentAmount : (amountToSave ?? NaN);
 const isNumber = isBlank || amountToSave !== undefined;

 // Would store as 0.00 while not being a zero the user typed. The service
 // rejects it; saying so here costs no round trip.
 const isSubCent =
  isNumber && parsedAmount > 0 && Math.round(parsedAmount * 100) === 0;

 // What the three radios resolve to on the wire. 'thisMonth' sends the month
 // itself: a range whose last month is its first is the exception.
 const appliesUntil =
  rangeMode === 'thisMonth'
   ? month
   : rangeMode === 'untilMonth'
     ? untilMonth
     : OPEN_ENDED;

 // Compared on the resulting appliesUntil rather than on the mode, because the
 // mode plus the selected month is the same decision stated twice.
 const initialAppliesUntil =
  initialRangeMode === 'thisMonth' ? month : OPEN_ENDED;

 // The currency counts. Stating the same figure in another currency is a
 // different budget, and the server stores the conversion, so a save that only
 // moved the badge writes a genuinely different amount.
 const isUnchanged =
  isNumber &&
  parsedAmount === currentAmount &&
  originCurrency === currency &&
  appliesUntil === initialAppliesUntil;

 // Compared against the empty field the panel opens with, not the stored amount:
 // an untouched form has nothing typed into it, and an overlay click must close
 // that one.
 const isDirty =
  amount !== '' ||
  originCurrency !== currency ||
  appliesUntil !== initialAppliesUntil;

 const canSave = isNumber && !isSubCent && !isUnchanged && !isSaving;

 // Renders nothing when the typed currency is the accounting one. The amount
 // sent is the one typed, NOT the converted figure, as in the other creation
 // forms; converting here would make the same input mean two different things.
 const ratePreview = useRatePreview(
  isBlank ? undefined : amountToSave,
  originCurrency,
 );
 const needsConversion = originCurrency !== ratePreview.accountingCurrency;

 // What Left becomes if saved. Withheld during a conversion: actualSpent is in the accounting
 // currency and the typed amount is not, so the subtraction would mix units.
 const previewRemaining =
  isNumber && !isUnchanged && !needsConversion
   ? parsedAmount - actualSpent
   : null;

 // Kept rather than dropped: the server is the only party that knows what the
 // month after the range goes back to, and saying so is the point of writing a
 // bounded one. Cleared on any edit, so it never describes a form that moved.
 const [saved, setSaved] = useState<BudgetWriteResponse | null>(null);

 // Any edit invalidates the confirmation. Called from handlers, not an effect on [amount, appliesUntil]:
 // the save empties the field itself, and an effect cannot tell that write from a keystroke.
 const clearSaved = () => setSaved(null);

 const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault();
  if (!canSave) return;

  const response = await onSave({
   amount: parsedAmount,
   currency: originCurrency,
   month,
   appliesUntil,
  });
  setSaved(response);

  // Emptied on the way out, the same state the panel opens in: the figure just
  // written is now the one in the strip above, and a field still holding it
  // would offer to write it a second time.
  if (response) setAmount('');
 };

 // Open-ended on purpose: stopping is a standing decision about the account, and a zero bounded to
 // one month is still budgeting. Reuses the form's onSave, so it adds no endpoint or prop.
 const handleRemove = async () => {
  const response = await onSave({
   amount: 0,
   currency: originCurrency,
   month,
   appliesUntil: OPEN_ENDED,
  });

  setIsConfirmingRemoval(false);
  setSaved(response);

  if (response) setAmount('');
 };

 // Not offered when there is nothing to remove: an account whose budget is
 // already 0 is byte-identical to one that never had a budget, so the control
 // would write a change that changes nothing.
 const canRemove = currentAmount > 0 && !saved && !isSaving;

 // One issue per field, first wins. The server may name the same field twice;
 // stacking both under one input says the same thing louder, not clearer.
 const issueFor = (field: string) =>
  error?.errors?.find((issue) => issue.field === field)?.message ?? null;

 // What no field claims. A 422 from the service carries no errors[] at all, and
 // its message is the one sentence that explains the refusal.
 const unfieldedError =
  error && !error.errors?.length
   ? error.message
   : (error?.errors?.filter(
       (issue) =>
         !['amount', 'currency', 'month', 'appliesUntil'].includes(issue.field),
      ) ?? [])
       .map((issue) => issue.message)
       .join(' ') || null;

 // restoresTo is a number on every bounded write and null only on an open-ended one, which ends nothing.
 // Two sentences: the first confirms, the second states what happens to the months after.
 const savedDetail = (() => {
  if (!saved) return null;

  // Said first when the currencies differ: every figure below is the converted
  // one and would otherwise read as a number the user never typed. Formatted on
  // the reader's locale so Intl marks the foreign origin currency with its code.
  const converted =
   saved.originalCurrency !== saved.currency
    ? `${numberFormatCurrency(saved.originalAmount, 2, saved.originalCurrency, locale)} converted at ${saved.exchangeRate}. `
    : '';

  const replaced =
   saved.overwrittenMonths.length > 0
    ? ` ${saved.overwrittenMonths.length} later month${saved.overwrittenMonths.length > 1 ? 's' : ''} replaced.`
    : '';

  if (saved.restoresFrom === null) {
   return `${converted}${asMoney(saved.budgetAmount)} applies from ${formatMonth(saved.budgetMonth)} onwards.${replaced}`;
  }

  const back =
   saved.restoresTo === 0
    ? 'this account has no budget'
    : `the budget goes back to ${asMoney(saved.restoresTo ?? 0)}`;

  return `${converted}From ${formatMonth(saved.restoresFrom)} ${back}.${replaced}`;
 })();

 // One slot under the field for what the typed amount says: it would round to
 // zero, or this is what it would leave. Never both, and each sentence fits one
 // line at --font-size-xs, so the panel does not grow and shrink while typing.
 const amountNote = isSubCent
  ? 'An amount under one cent would be stored as zero.'
  : previewRemaining !== null
    ? `${previewRemaining < 0 ? 'Over' : 'Left'} with new budget: ${asMoney(Math.abs(previewRemaining))}`
    : null;

 // One box for a confirmation, an unclaimed refusal or why Save is disabled; the shared two lines keep
 // the buttons from moving. Order is by recency: a fresh result outranks a standing explanation,
 // and the pending removal question outranks both.
 const [reportTone, reportTitle, reportDetail] = isConfirmingRemoval
  ? [
     'budgetEdit__report--warn',
     'Stop budgeting this account?',
     'It stays in the list from this month onwards, with no budget and no figures. Its transactions are untouched.',
    ]
  : saved
  ? ['budgetEdit__report--ok', 'Budget updated', savedDetail]
  : unfieldedError
    ? ['budgetEdit__report--error', 'Not saved', unfieldedError]
    : isUnchanged && !isSaving
      ? [
         'budgetEdit__report--idle',
         'Nothing to save',
         'Change the amount, or how far it applies.',
        ]
      : ['budgetEdit__report--empty', null, null];

 // A read-only modal can close on any outside click; one holding typed input
 // cannot, so the overlay only closes a form nothing has been done to.
 const handleOverlayClick = () => {
  if (!isDirty && !isSaving) onClose();
 };

 // Portalled to body so it lands outside #root, which useModalDialog marks inert,
 // and outside any ancestor transform, which would make `fixed` resolve against
 // that ancestor instead of the viewport.
 return createPortal(
  <div className='budgetEdit' onClick={handleOverlayClick}>
   <div
    className='budgetEdit__panel'
    {...dialogProps}
    onClick={(event) => event.stopPropagation()}
   >
    <div className='budgetEdit__header'>
     <span className='budgetEdit__heading'>Edit budget</span>

     <button
      type='button'
      className='budgetEdit__close'
      onClick={onClose}
      aria-label='Close budget editor'
      disabled={isSaving}
     >
      ✕
     </button>
    </div>

    <h2 id={titleId} className='budgetEdit__title'>
     {/* The caption names the value under it, as every field of the creation form
         does, and the month rides the same line. 'Subcategory', not 'Account':
         the column this row belongs to at level 2. */}
     <span className='budgetEdit__captionRow'>
      <span className='budgetEdit__caption'>Subcategory</span>
      <span className='budgetEdit__month'>{formatMonth(month)}</span>
     </span>

     <span className='budgetEdit__name'>
      {accountName}
      {nature && <span className='budgetEdit__nature'>{nature}</span>}
     </span>
    </h2>

    {/* What the amount is being decided against. Read-only: this form writes
        the budget and nothing else. */}
    <dl className='budgetEdit__context'>
     {/* 'Current budget' and not 'Current': level 3 already prints a Current
         Balance, and the two are different figures on the same screen. Paired
         with the New budget field below, which is what replaces it. */}
     <div className='budgetEdit__contextRow'>
      <dt
       className='budgetEdit__contextLabel'
       title='The amount in force this month. It carries forward from the last month it was set, so there need not be an entry for this one.'
      >
       Current budget
      </dt>
      <dd className='budgetEdit__contextValue'>{asMoney(currentAmount)}</dd>
     </div>

     <div className='budgetEdit__contextRow'>
      <dt className='budgetEdit__contextLabel'>Spent</dt>
      <dd className='budgetEdit__contextValue'>{asMoney(actualSpent)}</dd>
     </div>

     <div className='budgetEdit__contextRow'>
      <dt className='budgetEdit__contextLabel budgetEdit__contextLabel--status'>
       {!unbudgeted && (
        <StatusSquare
         alert={budgetSquareState(executionPercentage, isOverBudget)}
        />
       )}
       {isOver ? 'Over' : 'Left'}
      </dt>
      {/* The excess is the one figure in this strip that is a warning, and the
          square alone is 12px of colour beside a black number. */}
      <dd
       className={`budgetEdit__contextValue${isOver ? ' budgetEdit__contextValue--over' : ''}`}
      >
       {asMoney(Math.abs(remainingBudget))}
      </dd>
     </div>
    </dl>

    <form className='budgetEdit__form' onSubmit={handleSubmit}>
     {/* The approximation rides the label's line and not a row of its own, the
         way the tracker's top card carries it beside its own label. */}
     <div className='budgetEdit__labelRow'>
      <label className='budgetEdit__label' htmlFor='budgetEditAmount'>
       New budget
      </label>

      {ratePreview.status === 'resolved' && (
       <RateTooltip
        tipText={ratePreview.tooltipText}
        surface='light'
        placement='below'
       >
        <span className='budgetEdit__rate'>{ratePreview.previewText}</span>
       </RateTooltip>
      )}

      {/* Beside the label that owns the field, not at the foot of the form:
          a message far from its input makes the reader hunt for what to fix. */}
      {issueFor('amount') && (
       <span className='budgetEdit__error' role='alert'>
        {issueFor('amount')}
       </span>
      )}
     </div>

     {/* The badge shares the line rather than sitting under it: the amount and
         the currency it is stated in are one figure. */}
     <div className='budgetEdit__amountRow'>
      {/* type='text', not 'number': the number input accepts '3200e90' as a
          finite value. PLAIN_DECIMAL defines a plain amount, and inputMode still
          brings up the numeric keypad. */}
      <input
       id='budgetEditAmount'
       ref={amountRef}
       className='budgetEdit__input'
       type='text'
       inputMode='decimal'
       maxLength={MAX_AMOUNT_LENGTH}
       placeholder={String(currentAmount)}
       value={displayedAmount}
       onChange={(event) => {
        const next = event.target.value;
        if (!PLAIN_DECIMAL.test(next)) return;
        if (refusesDecimalSeparator(next, originCurrency)) return;
        setAmount(next);
        clearSaved();
       }}
       disabled={isSaving}
       autoComplete='off'
      />

      {/* Cycles the currency the amount is stated in. What it picks is sent, so
          moving it alone already makes the form saveable. */}
      <CurrencyBadge
       variant={VARIANT_DEFAULT}
       currency={originCurrency}
       updateOutsideCurrencyData={(next: CurrencyType) => {
        setOriginCurrency(next);
        clearSaved();
       }}
       disabled={isSaving}
      />
     </div>

     {/* One line, always present, whatever it has to say. */}
     <p className='budgetEdit__note'>{amountNote ?? ' '}</p>


     {/* A fieldset because the three are one question, and because its
         disabled attribute covers every control inside it. */}
     <fieldset className='budgetEdit__range' disabled={isSaving}>
      <legend className='budgetEdit__label budgetEdit__legend'>
       Applies to
       {issueFor('appliesUntil') && (
        <span className='budgetEdit__error' role='alert'>
         {issueFor('appliesUntil')}
        </span>
       )}
      </legend>

      {/* Tiles rather than radio dots, as the creation form asks closed questions. The input stays
          a radio for its arrow-key behaviour and group semantics, which no button imitates. */}
      <div className='budgetEdit__tiles'>
       {RANGE_MODES.map(({ value, label }) => (
        <label className='budgetEdit__tile' key={value}>
         <input
          className='budgetEdit__tileInput'
          type='radio'
          name='budgetEditRange'
          checked={rangeMode === value}
          onChange={() => {
           setRangeMode(value);
           clearSaved();
          }}
         />
         {label}
        </label>
       ))}

       {/* Inside the grid for the 'Until…' column, beside the labels so it stays out of a label's name.
           Always rendered and only hidden, since mounting it moved everything below. */}
       <select
        className={`budgetEdit__select${rangeMode === 'untilMonth' ? '' : ' budgetEdit__select--idle'}`}
        value={untilMonth}
        onChange={(event) => {
         setUntilMonth(event.target.value);
         clearSaved();
        }}
        disabled={rangeMode !== 'untilMonth'}
        aria-label='Last month the amount applies to'
       >
        {rangeOptions.map((option) => (
         <option key={option} value={option}>
          {formatMonth(option)}
         </option>
        ))}
       </select>
      </div>
     </fieldset>

     {/* Always mounted so it holds its height and a live region exists before its content changes.
         aria-live, not role='alert': the result was asked for, so it must not interrupt reading. */}
     <div
      className={`budgetEdit__report ${reportTone}`}
      aria-live='polite'
     >
      <p className='budgetEdit__reportTitle'>{reportTitle ?? ' '}</p>
      <p className='budgetEdit__reportDetail'>{reportDetail ?? ' '}</p>
     </div>

     {/* After a write, one emphasised Done: a disabled filled button beside a live one reads as stuck.
         The panel stays open because the confirmation names what the month after the range goes back to. */}
     <div className='budgetEdit__actions'>
      {saved ? (
       <button
        type='button'
        className='budgetEdit__button budgetEdit__button--primary'
        onClick={onClose}
       >
        Done
       </button>
      ) : isConfirmingRemoval ? (
       /* The trio is replaced, not extended: three answers leave an ambiguous
          default, and the way back must be as reachable as the way through. */
       <>
        <button
         type='button'
         className='budgetEdit__button budgetEdit__button--secondary'
         onClick={() => setIsConfirmingRemoval(false)}
         disabled={isSaving}
        >
         Keep budget
        </button>

        <button
         type='button'
         className='budgetEdit__button budgetEdit__button--danger'
         onClick={handleRemove}
         disabled={isSaving}
        >
         {isSaving ? 'Removing…' : 'Remove budget'}
        </button>
       </>
      ) : (
       <>
        {/* First in the row, away from Save, to avoid a misclick. type='button' is load-bearing:
            inside a <form> the default is submit, and this must not write by itself. */}
        {canRemove && (
         <button
          type='button'
          className='budgetEdit__button budgetEdit__button--danger'
          onClick={() => setIsConfirmingRemoval(true)}
         >
          Remove budget
         </button>
        )}

        <button
         type='button'
         className='budgetEdit__button budgetEdit__button--secondary'
         onClick={onClose}
         disabled={isSaving}
        >
         Cancel
        </button>

        <button
         type='submit'
         className='budgetEdit__button budgetEdit__button--primary'
         disabled={!canSave}
        >
         {isSaving ? 'Saving…' : 'Save'}
        </button>
       </>
      )}
     </div>
    </form>
   </div>
  </div>,
  document.body,
 );
}

export default BudgetEditModal;

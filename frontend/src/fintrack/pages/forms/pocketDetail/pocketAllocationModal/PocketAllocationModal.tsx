// Commit and release modal: one component, since they are one decision and only the endpoint differs.
// Direction sets the accounts offered (any bank vs those funding THIS pocket) and the bound
// (the ACCOUNT's uncommitted cash vs what THIS POCKET holds). The amount is always positive.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
 allocateToPocket,
 getPocketSourceAccounts,
 releaseFromPocket,
} from '../../../../api/pocketApi.ts';
import { usePocketDetailStore } from '../../../../stores/usePocketDetailStore.ts';
import { usePocketBoardStore } from '../../../../stores/usePocketBoardStore.ts';
import { normalizeError } from '../../../../helpers/normalizeError.ts';
import { showToastByStatus } from '../../../../helpers/showToastByStatus.ts';
import {
 formatCalendarDate,
 numberFormatCurrency,
} from '../../../../helpers/functions.ts';
import CurrencyBadge from '../../../../general_components/currencyBadge/CurrencyBadge.tsx';
import RateTooltip from '../../../../general_components/rateTooltip/RateTooltip.tsx';
import { useRatePreview } from '../../../../hooks/useRatePreview.ts';
import {
 readAmountInCurrency,
 refusesDecimalSeparator,
} from '../../../../helpers/amountInCurrency.ts';
import PocketSourcePicker, {
 PocketSourceOption,
} from './PocketSourcePicker.tsx';
import { CurrencyType } from '../../../../types/types.ts';
import {
 PocketAllocationBody,
 PocketEligibleAccount,
 PocketSource,
} from '../../../../types/pocketTypes.ts';
import { useModalDialog } from '../../../../../hooks/useModalDialog.ts';
import TransactionDateTrigger from '../../../../general_components/transactionDateTrigger/TransactionDateTrigger.tsx';
import { useTransactionDate } from '../../../../hooks/useTransactionDate.ts';

import './styles/pocketAllocationModal-styles.css';

export type PocketAllocationDirection = 'allocate' | 'release';

// Everything the direction decides, stated once so the body needs no branches.
const COPY: Record<
 PocketAllocationDirection,
 {
  title: string;
  explanation: string;
  ceilingLabel: string;
  submit: string;
  pending: string;
  confirmation: (figure: string, account: string, pocket: string) => string;
 }
> = {
 allocate: {
  // The bare verb: naming the object ("cash") would name an account type this
  // app does not have.
  title: 'Commit',
  // Pairs with the release line; must fit the panel's one line (about 44 characters), so it does
  // not restate "Commit". "Allocated" is the module's word for cash committed to a goal.
  explanation: 'Stays in the account, allocated to this goal.',
  ceilingLabel: 'Unassigned',
  submit: 'Commit',
  pending: 'Committing…',
  // Names the amount, the goal and the account: the panel is closed by the time
  // this toast is read.
  confirmation: (figure, account, pocket) =>
   `${figure} committed to ${pocket} from ${account}`,
 },
 release: {
  title: 'Release',
  // Fits the panel's one line (about 44 characters) and states what the money STOPS being;
  // mirrors the commit line.
  explanation: 'Stays in the account, no longer allocated.',
  // What THIS pocket holds in the account, the most a release may take. Named
  // for the pocket because "here" reads ambiguously with no account in view.
  ceilingLabel: 'To this pocket',
  submit: 'Release',
  pending: 'Releasing…',
  confirmation: (figure, account, pocket) =>
   `${figure} released from ${pocket} to ${account}`,
 },
};

// The plan the decision is measured against: target, due day and the pocket's
// position against both. Read as served on the detail payload, never derived.
type PocketPlan = {
 target: number;
 desiredDate: string;
 allocated: number;
 // Negative past the target: over-funding, not an error. Shown as an excess.
 remaining: number;
};

type PocketAllocationModalPropType = {
 pocketId: number;
 pocketName: string;
 plan: PocketPlan;
 // The pocket's accounting currency. Every figure the picker shows is stated in
 // it, and it is what the amount field starts in.
 currency: CurrencyType;
 direction: PocketAllocationDirection;
 // The accounts already funding this pocket, from the detail payload. Read only
 // in the releasing direction, where they are the whole set.
 sources: PocketSource[];
 onClose: () => void;
};

function PocketAllocationModal({
 pocketId,
 pocketName,
 plan,
 currency,
 direction,
 sources,
 onClose,
}: PocketAllocationModalPropType) {
 const amountRef = useRef<HTMLInputElement>(null);

 const copy = COPY[direction];

 // The plan's figures, always in the pocket's own currency. The amount below
 // may be typed in another and is converted; these are not.
 const planAmount = (value: number) =>
  numberFormatCurrency(value, 2, currency);

 const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
  null,
 );
 const [amountText, setAmountText] = useState<string>('');
 const [typedCurrency, setTypedCurrency] = useState<CurrencyType>(currency);
 const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);

 // Same hook as the four tracker forms, so a pocket dates a decision exactly as
 // a movement does: floor is the back-dating window, ceiling is today, both on
 // the owner's calendar.
 const {
  transactionActualDate: chosenDay,
  isOpenOnChosenDay,
  dateProps,
 } = useTransactionDate(isSubmitting);

 // Only committing fetches these; releasing already has its set in the detail
 // payload.
 const [banks, setBanks] = useState<PocketEligibleAccount[] | null>(null);
 const [banksFailed, setBanksFailed] = useState<boolean>(false);

 useEffect(() => {
  if (direction !== 'allocate') return;

  let isCurrent = true;

  const load = async () => {
   try {
    const accounts = await getPocketSourceAccounts();
    if (isCurrent) setBanks(accounts);
   } catch (error) {
    console.error('🔥 Error loading the source accounts', error);
    if (isCurrent) setBanksFailed(true);
   }
  };

  void load();

  return () => {
   isCurrent = false;
  };
 }, [direction]);

 // canClose blocks dismissal while the request is in flight. No initial focus is named, so focus
 // stays on the panel and the direction and pocket are read before a figure is typed.
 const { titleId, dialogProps } = useModalDialog({
  onClose,
  canClose: !isSubmitting,
 });

 // An account may back a decision only from its opening day, so the chosen day filters the list.
 // Convenience only: the server checks the same bound and hiding spares the owner a 422.
 const options = useMemo<PocketSourceOption[]>(() => {
  if (direction === 'release') {
   return sources
    .filter((source) => isOpenOnChosenDay(source.accountStartDate))
    .map((source) => ({
     accountId: source.accountId,
     // Same wording as the detail screen: the ledger names an account this read
     // cannot resolve. Only the name is missing; what it holds still counts.
     accountName: source.accountName ?? 'Account no longer available',
     balance: source.accountBalance,
     committed: source.accountAllocated,
     // The only figure a release is measured against: what THIS pocket holds
     // from THIS account.
     ceiling: source.heldByThisPocket,
    }));
  }

  return (banks ?? [])
   .filter((bank) => isOpenOnChosenDay(bank.account_start_date))
   .map((bank) => ({
    accountId: bank.account_id,
    accountName: bank.account_name,
    balance: bank.account_balance,
    // Absent rather than zero when the allocation read could not answer for the
    // row, and the server then applies the real bound.
    committed: bank.allocated ?? null,
    ceiling: bank.unassignedCash ?? null,
   }));
 }, [direction, sources, banks, isOpenOnChosenDay]);

 // Drops a selection the chosen day just invalidated; left in place it would
 // still be sent and the server would refuse an account no longer on screen.
 useEffect(() => {
  if (selectedAccountId === null) return;

  const isStillOffered = options.some(
   (option) => option.accountId === selectedAccountId,
  );

  if (!isStillOffered) setSelectedAccountId(null);
 }, [options, selectedAccountId]);

 const selected = options.find(
  (option) => option.accountId === selectedAccountId,
 );

 // amountText keeps what was typed; the currency only decides how it is read,
 // so leaving the yen brings the typed decimals back.
 const { amountToSave, displayedAmount } = readAmountInCurrency(
  amountText,
  typedCurrency,
 );
 const amount = amountToSave ?? 0;
 const isAmountUsable = amount > 0;

 // The ceiling is shown, never enforced here: it is in the pocket's currency
 // while the figure may be typed in another, so comparing needs a rate this
 // screen does not hold. The server checks the real bound inside its row lock.
 const ceilingText =
  selected && selected.ceiling !== null
   ? numberFormatCurrency(selected.ceiling, 2, currency)
   : null;

 // What the typed figure is worth in the stored currency, asked of the same
 // conversion service the write path uses so the preview matches what the row
 // will carry. It does not arm the ceiling above.
 const conversion = useRatePreview(amountToSave, typedCurrency, chosenDay);

 async function onSubmit() {
  if (selectedAccountId === null || !isAmountUsable) return;

  setIsSubmitting(true);
  setErrorMessage(null);

  const body: PocketAllocationBody = {
   // Always sent, including today: the server compares it against today on the
   // OWNER's calendar, and omitting it would leave that to the request's zone.
   allocationDate: chosenDay,
   sourceAccountId: selectedAccountId,
   amount,
   currency: typedCurrency,
  };

  try {
   const detail =
    direction === 'allocate'
     ? await allocateToPocket(pocketId, body)
     : await releaseFromPocket(pocketId, body);

   // The response already carries the recomputed hero, sources and history, so
   // the screen repaints from it with no refetch. The board is only marked stale
   // and refetches when the owner returns to it.
   usePocketDetailStore.getState().setDetail(detail);
   usePocketBoardStore.getState().invalidate();

   // A toast, because the repaint may be below the fold on a phone and is not
   // announced to screen readers (WCAG 4.1.3). Uses the currency TYPED in, not
   // the pocket's: it confirms what the owner did; conversion is the server's.
   showToastByStatus(
    copy.confirmation(
     numberFormatCurrency(amount, 2, typedCurrency),
     selected?.accountName ?? 'the account',
     pocketName,
    ),
    200,
   );

   onClose();
  } catch (error) {
   // The server's message verbatim: a refusal over the ceiling names both
   // figures, which tells the owner what to type instead.
   console.error('🔥 Error moving cash on the pocket', error);
   const { message } = normalizeError(error);
   setErrorMessage(message);
  } finally {
   setIsSubmitting(false);
  }
 }

 const isLoadingSources = direction === 'allocate' && banks === null;

 return createPortal(
  <div className='pocketAllocation__overlay'>
   <div className='pocketAllocation__panel' {...dialogProps}>
    {/* Two lines: the verb says what the panel does, the name says which pocket.
        Both stay inside the h2, so the dialog's accessible name covers both. */}
    <h2 className='pocketAllocation__title' id={titleId}>
     <span className='pocketAllocation__action'>{copy.title}</span>
     <span className='pocketAllocation__pocketName'>{pocketName}</span>
    </h2>

    <p className='pocketAllocation__body'>{copy.explanation}</p>

    {/* What the amount is measured against: the plan (target, due day) and where
        the pocket stands (allocated, still to allocate). The last two sum to the
        target, so the owner can check the row without arithmetic. */}
    <dl className='pocketAllocation__plan'>
     <div className='pocketAllocation__planItem'>
      <dt className='pocketAllocation__planLabel'>Target</dt>
      <dd className='pocketAllocation__planValue'>{planAmount(plan.target)}</dd>
     </div>

     <div className='pocketAllocation__planItem'>
      <dt className='pocketAllocation__planLabel'>By</dt>
      <dd className='pocketAllocation__planValue'>
       {formatCalendarDate(plan.desiredDate)}
      </dd>
     </div>

     <div className='pocketAllocation__planItem'>
      <dt className='pocketAllocation__planLabel'>Allocated</dt>
      <dd className='pocketAllocation__planValue'>{planAmount(plan.allocated)}</dd>
     </div>

     {/* Over target when the shortfall goes negative: the word carries the sign, so the amount
         never prints one. Its own colour (info level of pocketStatus.ts) marks the label as changing. */}
     <div className='pocketAllocation__planItem'>
      <dt
       className={`pocketAllocation__planLabel${
        plan.remaining < 0 ? ' pocketAllocation__planLabel--overTarget' : ''
       }`}
      >
       {plan.remaining < 0 ? 'Over target' : 'Still to allocate'}
      </dt>
      <dd className='pocketAllocation__planValue'>
       {planAmount(Math.abs(plan.remaining))}
      </dd>
     </div>
    </dl>

    {banksFailed && (
     <p className='pocketAllocation__error' role='alert'>
      The accounts could not be loaded.
     </p>
    )}

    {isLoadingSources && !banksFailed ? (
     <div className='pocketAllocation__skeleton' aria-hidden='true'>
      <div className='pocketAllocation__skeletonRow'></div>
      <div className='pocketAllocation__skeletonRow'></div>
     </div>
    ) : (
     <PocketSourcePicker
      options={options}
      selectedAccountId={selectedAccountId}
      onSelect={setSelectedAccountId}
      currency={currency}
      ceilingLabel={copy.ceilingLabel}
      disabled={isSubmitting}
     />
    )}

    {/* The rate chip anchors to this block: it centres on the field while its figure sits on the
        label line. Scoped here so the shared tooltip's other callers are unaffected. */}
    <div className='pocketAllocation__amountBlock'>
     <div className='pocketAllocation__labelRow'>
      {/* Kept as a group so the row has two children and its space-between
          holds the converted figure at the right end. */}
      <span className='pocketAllocation__labelGroup'>
       <label className='pocketAllocation__label' htmlFor='pocketAllocationAmount'>
        Amount
       </label>
      </span>

      {/* The converted figure rides the label line. Only the resolved state renders
          here; a failed rate is a sentence with a button, so it renders below the
          field, where it cannot be mistaken for "no conversion needed". */}
      {conversion.status === 'resolved' && (
       <RateTooltip tipText={conversion.tooltipText} surface='light'>
        <span className='pocketAllocation__fxPreview'>
         {conversion.previewText}
        </span>
       </RateTooltip>
      )}
     </div>

     <div className='pocketAllocation__amountRow'>
      {/* The date qualifies the amount, so it leads the row. */}
      <TransactionDateTrigger {...dateProps} />

      <input
       id='pocketAllocationAmount'
       className='pocketAllocation__amount'
       type='text'
       inputMode='decimal'
       autoComplete='off'
       maxLength={15}
       value={displayedAmount}
       onChange={(event) => {
        const next = event.target.value;
        if (refusesDecimalSeparator(next, typedCurrency)) return;
        setAmountText(next);
       }}
       disabled={isSubmitting}
       ref={amountRef}
      />

      <CurrencyBadge
       // Matches the tracker's amount field; 'light' rendered bare text that
       // read as a caption, not a control.
       variant={'tracker'}
       updateOutsideCurrencyData={setTypedCurrency}
       currency={typedCurrency}
      />
     </div>
    </div>

    {ceilingText && selected && (
     <p className='pocketAllocation__ceiling'>
      Up to {ceilingText} from {selected.accountName}
     </p>
    )}

    {conversion.status === 'failed' && (
     <div className='pocketAllocation__fxFailure' role='status'>
      <span className='pocketAllocation__fxFailureText'>
       No rate for {typedCurrency.toUpperCase()} right now. The amount is still
       sent; the server resolves the rate when it writes the row.
      </span>

      <button
       type='button'
       className='pocketAllocation__fxRetry'
       onClick={conversion.retry}
       disabled={isSubmitting}
      >
       Retry
      </button>
     </div>
    )}

    {errorMessage && (
     <p className='pocketAllocation__error' role='alert'>
      {errorMessage}
     </p>
    )}

    <div className='pocketAllocation__actions'>
     <button
      type='button'
      className='pocketAllocation__button pocketAllocation__button--quiet'
      onClick={onClose}
      disabled={isSubmitting}
     >
      Cancel
     </button>

     <button
      type='button'
      className='pocketAllocation__button pocketAllocation__button--confirm'
      onClick={() => void onSubmit()}
      disabled={isSubmitting || selectedAccountId === null || !isAmountUsable}
     >
      {isSubmitting ? copy.pending : copy.submit}
     </button>
    </div>
   </div>
  </div>,
  document.body,
 );
}

export default PocketAllocationModal;

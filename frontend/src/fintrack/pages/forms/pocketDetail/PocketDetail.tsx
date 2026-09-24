// Pocket detail screen: no transactions (no money moves into a pocket), only its allocations.

import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';
import { DEFAULT_CURRENCY } from '../../../helpers/constants.ts';
import {
 capitalize,
 formatCalendarDate,
 numberFormatCurrency,
} from '../../../helpers/functions.ts';
import SummaryPocketDetailBox from './summaryPocketDetailBox/SummaryPocketDetailBox.tsx';
import AccountActionsTrigger from '../../../general_components/accountActionsTrigger/AccountActionsTrigger.tsx';
import AccountActionsMenu from '../../../editionAndDeletion/components/accountActionMenu/AccountActionsMenu.tsx';
import DeletePocketModal from './deletePocketModal/DeletePocketModal.tsx';
import AllocationEntryModal from './allocationEntryModal/AllocationEntryModal.tsx';
import PocketAllocationModal, {
 PocketAllocationDirection,
} from './pocketAllocationModal/PocketAllocationModal.tsx';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import RateTooltip from '../../../general_components/rateTooltip/RateTooltip.tsx';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents.tsx';
import { pocketSquareClass } from '../../../helpers/pocketStatus.ts';
import { usePocketDetailStore } from '../../../stores/usePocketDetailStore.ts';
import useAuth from '../../../../auth/hooks/useAuth.ts';
import { isIanaTimeZone } from '../../../../auth/auth_utils/timeZoneOptions.ts';
import { PocketAllocationEntry } from '../../../types/pocketTypes.ts';
import { sourceAccountLabel } from './sourceAccountLabel.ts';

import '../styles/forms-styles.css';
import './styles/pocketDetail-styles.css';

// A figure the contract withheld. Never 0 and never an empty cell: a dash says
// the answer is absent, where 0 would state an amount.
const DASH = '—';

// How many placeholder rows each list draws while the answer is on the wire.
const SKELETON_ROWS = 3;

type LocationStateType = {
 previousRoute?: string;
};

function PocketDetail() {
 const location = useLocation();
 const state = location.state as LocationStateType | null;

 // The board, not the budget module. A pocket is reached from the pocket board
 // and the arrow goes back where the user came from.
 const previousRoute = state?.previousRoute ?? '/fintrack/pocket';

 // Keep the parameter named pocketId: pocket and account ids are separate
 // sequences that both start at 1, so aliasing it invites spending a pocket id
 // against the account endpoints.
 const { pocketId } = useParams();
 const parsedPocketId = Number(pocketId);
 const hasValidId = Number.isInteger(parsedPocketId) && parsedPocketId > 0;

 const pocket = usePocketDetailStore((store) => store.pocket);
 const sources = usePocketDetailStore((store) => store.sources);
 const history = usePocketDetailStore((store) => store.history);
 const isLoading = usePocketDetailStore((store) => store.isLoading);
 const isLoaded = usePocketDetailStore((store) => store.isLoaded);
 const error = usePocketDetailStore((store) => store.error);
 const fetchDetail = usePocketDetailStore((store) => store.fetchDetail);
 const refreshDetail = usePocketDetailStore((store) => store.refreshDetail);
 const clear = usePocketDetailStore((store) => store.clear);

 // The deletion confirmation opens on this card, not on a route: a route would
 // unmount the card to ask one yes-or-no question about it.
 const [isConfirmingDeletion, setIsConfirmingDeletion] =
  useState<boolean>(false);

 // Overflow menu flag, separate from the one above: the menu closes as the
 // confirmation opens, so for one frame both are true.
 const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

 const navigate = useNavigate();

 // Which money decision is open, or none. One state, not two booleans, which
 // would admit both panels open at once.
 const [allocationDirection, setAllocationDirection] =
  useState<PocketAllocationDirection | null>(null);

 // The open history entry, held whole: the list is already in memory, so an id
 // lookup would be a second source for it.
 const [openEntry, setOpenEntry] = useState<PocketAllocationEntry | null>(
  null,
 );

 useEffect(() => {
  if (!hasValidId) return;

  void fetchDetail(parsedPocketId);

  // Emptied on the way out, so the next pocket opened cannot flash this one's
  // figures under its own title while its request is in flight.
  return () => {
   clear();
  };
 }, [parsedPocketId, hasValidId, fetchDetail, clear]);

 const currency = pocket?.currency ?? DEFAULT_CURRENCY;
 const amount = (value: number) => numberFormatCurrency(value, 2, currency);

 // Every instant on this screen is stated in the account's own zone, not the
 // browser's: the two differ for an owner who travels.
 const { userData } = useAuth();

 const ownerTimeZone = isIanaTimeZone(userData?.timezone)
  ? userData?.timezone
  : undefined;

 // An instant as the owner reads it. Bare toLocaleString uses the browser's
 // locale and zone unnamed, so a second machine would show a different hour.
 const readingMoment = (instant: string) =>
  new Date(instant).toLocaleString('es-ES', {
   day: '2-digit',
   month: '2-digit',
   year: 'numeric',
   hour: '2-digit',
   minute: '2-digit',
   hour12: false,
   timeZone: ownerTimeZone,
   timeZoneName: 'short',
  });

 // numberFormatCurrency(null) returns the literal 'Not a valid number, please
 // try again' (parseFloat('null') is NaN), so a withheld figure is answered
 // here, before the formatter sees it.
 const amountOrDash = (value: number | null) =>
  value === null ? DASH : amount(value);

 // Audit tooltip for a converted entry. First line is the accounting rate, derived from the row's two
 // amounts (not the stored rate field) so it never claims a direction the field lacks. The stored rate
 // prints with every decimal its column keeps, since rounding would not reproduce it.
 const originTip = (entry: PocketAllocationEntry) => {
  const typed = Math.abs(entry.originalAmount);
  const stored = Math.abs(entry.amount);
  const quote = stored > 0 ? typed / stored : 0;

  return [
   quote > 0
    ? `1 ${currency.toUpperCase()} = ${numberFormatCurrency(
       quote,
       quote < 10 ? 4 : 2,
      )} ${entry.originalCurrency.toUpperCase()}`
    : '',
   `stored rate: ${entry.exchangeRate}`,
   entry.exchangeRateSource ? `source: ${entry.exchangeRateSource}` : '',
   entry.exchangeRateTimestamp
    ? `read: ${readingMoment(entry.exchangeRateTimestamp)}`
    : '',
  ]
   .filter(Boolean)
   .join('\n');
 };

 const header = (
  <div className='page__content'>
   <div className='main__title--container'>
    {/* Labelled "Go back", not the destination: previousRoute is whatever the
        caller handed over, so naming the board would be wrong for other origins. */}
    <Link to={previousRoute} className='backArrow backArrow--dark' aria-label='Go back'>
     <LeftArrowLightSvg aria-hidden='true' />
    </Link>

    {/* An h1 so the CardTitles below have a page heading; every rule for this
        class selects the class, so the tag is free to be a heading. */}
    <h1 className='form__title'>
     {pocket ? capitalize(pocket.name).toUpperCase() : ''}
    </h1>

    {/* Rendered once the pocket is loaded: its accessible label names the pocket. Edit and delete share
        this menu; the two money actions stay as visible buttons under the hero. */}
    {pocket && (
     <AccountActionsTrigger
      accountName={pocket.name}
      isOpen={isMenuOpen}
      onClick={() => setIsMenuOpen(true)}
     />
    )}
   </div>
  </div>
 );

 // Three states, and they are not degrees of one another: a failed request is
 // not a pocket still loading, and neither is an id that is not a number.
 if (!hasValidId) {
  return (
   <section className='page__container'>
    <TopWhiteSpace variant={'dark'} />
    {header}

    <div className='pocketDetail__state'>
     <p className='pocketDetail__stateText'>
      That is not a pocket this page can open.
     </p>

     <Link to='/fintrack/pocket' className='pocketDetail__retry'>
      Back to the board
     </Link>
    </div>
   </section>
  );
 }

 if (error) {
  return (
   <section className='page__container'>
    <TopWhiteSpace variant={'dark'} />
    {header}

    <div className='pocketDetail__state'>
     <p className='pocketDetail__stateText'>
      This pocket could not be loaded.
     </p>

     <button
      type='button'
      className='pocketDetail__retry'
      onClick={() => {
       void refreshDetail();
      }}
     >
      Try again
     </button>
    </div>
   </section>
  );
 }

 if (isLoading || !isLoaded || pocket === null) {
  return (
   <section className='page__container'>
    <TopWhiteSpace variant={'dark'} />
    {header}

    <div className='pocketDetail__skeletonHero' aria-hidden='true'></div>

    <article className='form__box'>
     {Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <div
       className='pocketDetail__skeletonRow'
       key={`pocket-detail-skeleton-${index}`}
       aria-hidden='true'
      ></div>
     ))}
    </article>
   </section>
  );
 }

 // Required rate 0 means the goal is covered; null means the date passed while money is short.
 // Branch on === null, not falsiness. The achieved rate is the net committed over the calendar
 // months the plan has lived, the current one included (actualRate.js).
 const requiredMonthly = pocket.requiredMonthly;

 const pace =
  requiredMonthly === null
   ? null
   : {
      // The same served level as the hero's date reading, so a pocket at risk or
      // behind never shows its pace card as on track. Served, never derived here.
      level: pocket.level,
      // Names the figure by its label, not by a number: the number lives once,
      // in requiredRate below.
      verdict: pocket.funded
       ? 'The target is covered, so there is no rate left to keep.'
       : 'The required rate below keeps the target on its date.',
      // null once funded: the row is omitted below rather than printed as a dash.
      requiredRate: pocket.funded ? null : `${amount(requiredMonthly)} / month`,
      // null only for a plan dated after today; the row is omitted then.
      actualRate:
       pocket.actualRate === null
        ? null
        : `${amount(pocket.actualRate)} / month`,
      // null when there is no rate or nothing left to reach: the row is omitted.
      projectedCompletion:
       pocket.projectedCompletion !== null
        ? formatCalendarDate(pocket.projectedCompletion)
        : pocket.actualRate === null || pocket.funded
          ? null
          : 'Not on track at this pace',
     };

 return (
  <section className='page__container page__container--pocket'>
   <TopWhiteSpace variant={'dark'} />
   {header}

   <SummaryPocketDetailBox pocket={pocket} />

   {/* The two decisions the module exists for, directly under the hero. Release
       is disabled, not hidden, so the row keeps its shape between an empty
       pocket and a funded one and the pair is visible from the start. */}
   <div className='pocketDetail__actions'>
    {/* Only one button carries the cream fill, marking the operation in hand.
        Commit holds it at rest and hands it over while the release panel is
        open. */}
    <button
     type='button'
     className={`pocketDetail__action${
      allocationDirection === 'release' ? '' : ' pocketDetail__action--primary'
     }`}
     onClick={() => setAllocationDirection('allocate')}
    >
     Commit
    </button>

    <button
     type='button'
     className={`pocketDetail__action${
      allocationDirection === 'release' ? ' pocketDetail__action--primary' : ''
     }`}
     onClick={() => setAllocationDirection('release')}
     disabled={sources.length === 0}
    >
     Release
    </button>
   </div>

   {/* A description list, not bullets: the two figures are meant to be compared
       and a bullet between them would separate them. The verdict leads because
       neither figure answers the question alone. */}
   {pace && (
    <div className='pocketDetail__pace'>
     <p className='pocketDetail__paceVerdict'>
      <StatusSquare alert={pocketSquareClass(pace.level)} />
      <span className='pocketDetail__readingText'>{pace.verdict}</span>
     </p>

     <dl className='pocketDetail__paceFigures'>
      {pace.requiredRate !== null && (
       <div className='pocketDetail__paceFigure'>
        <dt>Required rate</dt>
        <dd>{pace.requiredRate}</dd>
       </div>
      )}

      {pace.actualRate !== null && (
       <div className='pocketDetail__paceFigure'>
        <dt>Actual rate</dt>
        <dd>{pace.actualRate}</dd>
       </div>
      )}
     </dl>

     {pace.projectedCompletion !== null && (
      <p className='pocketDetail__paceProjection'>
       <span>Projected completion</span>
       <span>{pace.projectedCompletion}</span>
      </p>
     )}
    </div>
   )}

   <article className='form__box'>
    {/* Owner's note, above Money sources: the one thing the served figures cannot say. Its empty state
        is a sentence, not a dash, since a dash means a figure the contract withheld. */}
    <div className='pocketDetail__section'>
     <div className='presentation__card__title__container'>
      <CardTitle>{'Note'}</CardTitle>
     </div>

     {pocket.note === null ? (
      <p className='pocketDetail__empty'>
       No note yet. Editing this pocket adds one.
      </p>
     ) : (
      <p className='pocketDetail__note'>{pocket.note}</p>
     )}
    </div>

    <div className='pocketDetail__section'>
     <div className='presentation__card__title__container'>
      <CardTitle>{'Money sources'}</CardTitle>
     </div>

     {sources.length === 0 ? (
      <p className='pocketDetail__empty'>
       No account has committed to this pocket yet. Committing from one adds it
       here.
      </p>
     ) : (
      <ul className='pocketDetail__list'>
       {sources.map((source) => (
        <li className='pocketDetail__row' key={`source-${source.accountId}`}>
         <div className='pocketDetail__rowLeft'>
          {/* The allocation ledger names an account the account read cannot
              resolve: it was removed, or it is internal. What it holds is
              still real and still counted, so the row is served. */}
          <span className='pocketDetail__rowTitle'>
           {source.accountName ?? 'Account no longer available'}
          </span>

          <span className='pocketDetail__rowSubtitle'>
           unassigned: {amountOrDash(source.accountUnassignedCash)}
          </span>
         </div>

         <div className='pocketDetail__rowRight'>
          <span className='pocketDetail__rowAmount'>
           {amount(source.heldByThisPocket)}
          </span>

          {/* The ACCOUNT's own state, not this pocket's share of it. */}
          {source.covered === false && (
           <span className='pocketDetail__flag'>over-allocated</span>
          )}
         </div>
        </li>
       ))}
      </ul>
     )}
    </div>

    <div className='pocketDetail__section'>
     <div className='presentation__card__title__container'>
      <CardTitle>{'Pocket allocation history'}</CardTitle>
     </div>

     {history.length === 0 ? (
      <p className='pocketDetail__empty'>
       Nothing has been committed or released yet.
      </p>
     ) : (
      <ul className='pocketDetail__list'>
       {history.map((entry) => (
        <li key={`allocation-${entry.allocationId}`}>
         {/* A button and not a list item with a handler: the row opens a panel
             rather than navigating, so it needs focus, Enter and Space, and a
             div with an onClick answers none of the three. */}
         <button
          type='button'
          className='pocketDetail__row pocketDetail__row--open'
          onClick={() => setOpenEntry(entry)}
          aria-label={`Open the entry of ${formatCalendarDate(
           entry.allocationDate,
          )}`}
         >
          <div className='pocketDetail__rowLeft'>
          {/* The word beside the sign, never the colour alone: colour
              survives neither colour blindness nor print. */}
          <span className='pocketDetail__rowTitle'>
           {entry.amount < 0 ? 'Released' : 'Committed'}
          </span>

          {/* The hour comes off the same instant as the day and in the same
              zone, resolved by the server: two decisions taken on one day are
              told apart by nothing else. */}
          <span className='pocketDetail__rowSubtitle'>
           {sourceAccountLabel(entry, DASH)}
           {' · '}
           {formatCalendarDate(entry.allocationDate)}
           {entry.allocationTime ? `, ${entry.allocationTime}` : ''}
          </span>
         </div>

         <div className='pocketDetail__rowRight'>
          <span
           className={
            entry.amount < 0
             ? 'pocketDetail__rowAmount pocketDetail__rowAmount--negative'
             : 'pocketDetail__rowAmount'
           }
          >
           {amount(entry.amount)}
          </span>

          {/* What the owner typed, when it was not this pocket's unit, so the row can be checked against
              a bank statement. Withheld when units agree: it would read as a second amount. */}
          {entry.originalCurrency !== currency && (
           <RateTooltip
            tipText={originTip(entry)}
            surface='dark'
            placement='anchor-left'
           >
            <span className='pocketDetail__rowOrigin'>
             {numberFormatCurrency(
              Math.abs(entry.originalAmount),
              2,
              entry.originalCurrency,
             )}
            </span>
           </RateTooltip>
          )}
          </div>
         </button>
        </li>
       ))}
      </ul>
     )}
    </div>

    {/* Deletion lives in the header's overflow menu, two steps from the action
        (menu, then confirmation), so the screen does not end on its most
        destructive control. */}
   </article>

   {openEntry && (
    <AllocationEntryModal
     entry={openEntry}
     currency={currency}
     onClose={() => setOpenEntry(null)}
    />
   )}

   {allocationDirection && (
    <PocketAllocationModal
     pocketId={pocket.pocketId}
     pocketName={pocket.name}
     plan={{
      target: pocket.target,
      desiredDate: pocket.desiredDate,
      allocated: pocket.allocated,
      remaining: pocket.remaining,
      // The pace card's "Required rate": what is needed from now, null once funded.
      requiredMonthly: pocket.funded ? null : pocket.requiredMonthly,
     }}
     currency={currency}
     direction={allocationDirection}
     sources={sources}
     onClose={() => setAllocationDirection(null)}
    />
   )}

   {isConfirmingDeletion && (
    <DeletePocketModal
     pocketId={pocket.pocketId}
     pocketName={pocket.name}
     currency={currency}
     onClose={() => setIsConfirmingDeletion(false)}
    />
   )}

   {/* The object actions, behind the header's overflow control. Each closes
       the menu before it acts: the editor navigates away, and the confirmation
       is a second panel that must not open under this one. */}
   <AccountActionsMenu
    isOpen={isMenuOpen}
    accountName={capitalize(pocket.name)}
    onClose={() => setIsMenuOpen(false)}
    editLabel='Edit pocket'
    deleteLabel='Delete pocket'
    onEditAccount={() => {
     setIsMenuOpen(false);
     navigate(`/fintrack/pocket/pockets/${pocket.pocketId}/edit`, {
      state: { previousRoute: location.pathname },
      viewTransition: true,
     });
    }}
    onDeleteAccount={() => {
     setIsMenuOpen(false);
     setIsConfirmingDeletion(true);
    }}
   />
  </section>
 );
}

export default PocketDetail;

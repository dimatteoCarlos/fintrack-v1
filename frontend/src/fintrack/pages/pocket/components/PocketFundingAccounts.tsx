// Accordion card listing the accounts funding the pockets and what each holds.
// Its body is absent, not hidden, while closed, so a collapsed card costs no height.

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPocketSourceAccounts } from '../../../api/pocketApi.ts';
import {
 CURRENCY_OPTIONS,
 DEFAULT_CURRENCY,
} from '../../../helpers/constants.ts';
import {
 currencyFormat,
 formatBudgetMonthLabel,
} from '../../../helpers/functions.ts';
import { PocketEligibleAccount } from '../../../types/pocketTypes.ts';
// A bank, not the wallet (already Pocket status's mark; two cards sharing a glyph
// read as views of one thing) and not coins (this card lists institutions).
import BankSvg from '../../../../assets/pocketSvg/bankSvg.svg?react';
import ArrowDownLightSvg from '../../../../assets/ArrowDownLightSvg.svg?react';

const BODY_ID = 'pocketHero-fundingAccountsBody';

// A figure the read could not answer for: the pocket figures are absent, not
// zero, on an account the allocation read could not resolve, since zero would
// state that nothing is committed to an account nobody measured.
const DASH = '—';

// The shared account screen, addressed absolutely: it is declared beside this board under the same
// /fintrack parent, so a relative path would resolve inside the board.
// An account has one canonical screen; its read serves pocket figures it does not render yet.
const accountRoute = (accountId: number) =>
 `/fintrack/overview/accounts/${accountId}`;

// Placeholder rows drawn while pending: enough to hold roughly the answered
// height so the page does not jump, few enough not to claim a count.
const SKELETON_ROWS = 3;

type PocketFundingAccountsPropType = {
 // Count of distinct accounts holding an allocation above zero, so the closed card costs no request.
 // Bounded at the close of the reported month while the rows below are not; the body note covers it.
 sourceAccountCount: number;
 // The reported month and the latest month, both YYYY-MM. They are equal only
 // when the reader has not stepped back, the one case where the heading and the
 // rows answer about the same instant.
 referenceMonth: string | null;
 currentMonth: string | null;
};

function PocketFundingAccounts({
 sourceAccountCount,
 referenceMonth,
 currentMonth,
}: PocketFundingAccountsPropType) {
 // Where the account screen's back control returns to. The router already holds
 // it, so it is read here rather than threaded down as a prop.
 const previousRoute = useLocation().pathname;

 const [isOpen, setIsOpen] = useState(false);
 const [accounts, setAccounts] = useState<PocketEligibleAccount[] | null>(null);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Asked once, and the claim is a ref because a state flag would re-render and
 // re-run the effect that reads it.
 const hasRequested = useRef(false);

 // Guards state writes after the board is left. Raised in the setup too: React's development
 // double mount would otherwise leave it lowered and the card stuck in its skeleton.
 // The request claim above survives the remount, so no second request follows.
 const isMounted = useRef(true);
 useEffect(() => {
  isMounted.current = true;

  return () => {
   isMounted.current = false;
  };
 }, []);

 // Asked for on the first expand, not with the board: its payload lacks these rows and most
 // readers never open the card.
 useEffect(() => {
  if (!isOpen || hasRequested.current) return;

  // Claimed in a ref, not state: a re-render that tears the effect down would cancel the
  // request just started and leave the card in its skeleton.
  hasRequested.current = true;
  setIsLoading(true);
  setError(null);

  getPocketSourceAccounts()
   .then((rows) => {
    if (isMounted.current) setAccounts(rows);
   })
   .catch((err: unknown) => {
    if (!isMounted.current) return;

    setError(
     err instanceof Error ? err.message : 'The accounts could not be loaded',
    );
    // Released so closing and reopening asks again. A failure that latched the
    // claim would leave the only way back a full reload of the board.
    hasRequested.current = false;
   })
   .finally(() => {
    if (isMounted.current) setIsLoading(false);
   });

  // Deliberately not cancelled on close: the component stays mounted (only its
  // body is conditional), so a late answer is still valid. Only leaving the board
  // discards it, via the unmount effect above.
 }, [isOpen]);

 // The endpoint returns every eligible account; one with nothing committed would contradict the
 // heading's count. Rows with no figure are excluded too, since absent is not zero.
 const funding = (accounts ?? []).filter(
  (account) => account.allocated !== undefined && account.allocated > 0,
 );

 // Three reasons the list can come out short, each with its own sentence: an empty body under a
 // non-zero heading count contradicts it, so the reader must be told which case happened.
 const answered = accounts !== null;
 const carriesFigures = (accounts ?? []).some(
  (account) => account.allocated !== undefined,
 );
 const emptyText =
  answered && accounts.length === 0
   ? 'No bank account was returned, so there is nothing this board could be funded from.'
   : answered && !carriesFigures
     ? 'The accounts answered, but none of them carried what it has committed to a pocket. The figure is served by the accounts read, so this is a gap in the answer and not an empty board.'
     : 'No account has committed cash to a pocket yet. Committing from one lists it here.';

 const amountFor = (account: PocketEligibleAccount, value?: number) => {
  if (value === undefined) return DASH;

  const currency_code = account.currency_code ?? DEFAULT_CURRENCY;

  // The locale is the reader's, never the amount's: taken from the amount's own
  // currency, Intl narrows the dollar and the Colombian and Mexican pesos all to
  // '$', so accounts in different currencies would read identically.
  return currencyFormat(
   currency_code,
   value,
   CURRENCY_OPTIONS[DEFAULT_CURRENCY],
  );
 };

 return (
  <div className='pocketHero__card'>
   <div className='pocketHero__cardHeadRow'>
    <span className='pocketHero__cardHead'>
     <BankSvg className='pocketHero__glyph' />

     {/* The count is only how many accounts are listed; unlike the Pocket status
         total, it does not have to add up to readings beneath it. */}
     <span className='pocketHero__label'>
      Funding accounts (<b>{sourceAccountCount}</b>)
     </span>
    </span>

    <button
     type='button'
     className={`pocketHero__toggle${isOpen ? ' is-active' : ''}`}
     onClick={() => setIsOpen((open) => !open)}
     aria-expanded={isOpen}
     aria-controls={BODY_ID}
     aria-label={
      isOpen ? 'Collapse funding accounts' : 'Expand funding accounts'
     }
    >
     <ArrowDownLightSvg className='pocketHero__toggleChevron' />
    </button>
   </div>

   {isOpen && (
    <div className='pocketHero__cardBody' id={BODY_ID}>
     {/* The count is bounded at the reported month's close; the rows answer for today (a past month's
         uncommitted cash cannot be asked for). They differ only when stepped back, hence the note. */}
     {referenceMonth !== null &&
      currentMonth !== null &&
      referenceMonth !== currentMonth && (
       <p className='pocketHero__accountNote'>
        Balances are as they stand today. Only the count above is bound to{' '}
        {formatBudgetMonthLabel(referenceMonth)}.
       </p>
      )}

     {/* Three distinct states: a failed request is not an empty list, and
         neither is one still in flight. */}
     {error !== null ? (
      <div className='pocketHero__accountsState' role='alert'>
       <p className='pocketHero__accountsStateText'>
        The funding accounts could not be loaded.
       </p>
       <p className='pocketHero__accountsStateDetail'>{error}</p>
      </div>
     ) : isLoading ? (
      <ul className='pocketHero__accounts' aria-hidden='true'>
       {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li
         className='pocketHero__account pocketHero__account--skeleton'
         key={`funding-skeleton-${index}`}
        >
         <span className='pocketHero__accountBar pocketHero__accountBar--name' />
         <span className='pocketHero__accountBar pocketHero__accountBar--amount' />
        </li>
       ))}
      </ul>
     ) : funding.length === 0 ? (
      <p className='pocketHero__accountsEmpty'>{emptyText}</p>
     ) : (
      <ul className='pocketHero__accounts'>
       {funding.map((account) => (
        <li key={`funding-${account.account_id}`}>
         {/* The whole row is the link, not just the name: the amounts are what
             the reader weighs when deciding to open an account. */}
         <Link
          to={accountRoute(account.account_id)}
          state={{ previousRoute }}
          className='pocketHero__account pocketHero__account--link'
         >
         <span className='pocketHero__accountLeft'>
          <span className='pocketHero__accountName'>
           {account.account_name}
          </span>

          {/* Three amounts shown together so none reads as "available": a pocket blocks no spending, and
              unassigned is only cash no plan claimed. It can read negative (a reported deficit) and is
              never split across pockets, since a split would need an invented policy. */}
          <span className='pocketHero__accountFacts'>
           <span
            className={`pocketHero__accountFact${
             account.isOverAllocated === true
              ? ' pocketHero__accountFact--over'
              : ''
            }`}
           >
            unassigned {amountFor(account, account.unassignedCash)}
           </span>

           <span className='pocketHero__accountFact'>
            balance {amountFor(account, account.account_balance)}
           </span>
          </span>
         </span>

         <span className='pocketHero__accountRight'>
          <span className='pocketHero__accountAmount'>
           {amountFor(account, account.allocated)}
          </span>

          {/* No currency code under the amount: currencyFormat already prints the
              unit inside the figure (a symbol for the accounting currency, the
              ISO code for any other). */}

          {/* The word carries this reading and colour only seconds it, so it
              survives monochrome print and colour blindness. Same wording as the
              pocket detail's source rows. */}
          {account.isOverAllocated === true && (
           <span className='pocketHero__accountFlag'>over-allocated</span>
          )}
         </span>

         {/* Committed over balance. aria-hidden with no progressbar role: both figures are text above and
             the role would announce a percentage this card never states. No bar without figures,
             since an empty track looks like nothing committed. */}
         {account.allocated !== undefined &&
          account.account_balance !== undefined && (
           <span className='pocketHero__accountTrack' aria-hidden='true'>
            <span
             className={`pocketHero__accountTrackFill${
              account.isOverAllocated === true
               ? ' pocketHero__accountTrackFill--over'
               : ''
             }`}
             style={{
              width: `${Math.min(
               Math.max(
                account.account_balance > 0
                 ? (account.allocated / account.account_balance) * 100
                 : 100,
                0,
               ),
               100,
              )}%`,
             }}
            />
           </span>
          )}
         </Link>
        </li>
       ))}
      </ul>
     )}
    </div>
   )}
  </div>
 );
}

export default PocketFundingAccounts;

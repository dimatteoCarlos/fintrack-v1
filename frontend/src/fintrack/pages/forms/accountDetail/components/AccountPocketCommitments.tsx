// Collapsible card listing the pockets this account funds and the amount held for each.
// No progress bar: the payload carries no pocket target to divide by.

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFetch } from '../../../../hooks/useFetch.ts';
import {
 CURRENCY_OPTIONS,
 DEFAULT_CURRENCY,
} from '../../../../helpers/constants.ts';
import { currencyFormat } from '../../../../helpers/functions.ts';
import {
 AccountByTypeResponseType,
 AccountPocketAllocationType,
} from '../../../../types/responseApiTypes.ts';
import { CurrencyType } from '../../../../types/types.ts';
import { url_get_account_by_id } from '../../../../../urlConfig.ts';
// The pocket module's wallet glyph: it names the pockets drawing on the account,
// not the account itself.
import WalletSvg from '../../../../../assets/pocketSvg/walletSvg.svg?react';
import ArrowDownLightSvg from '../../../../../assets/ArrowDownLightSvg.svg?react';

import '../styles/accountPocketCommitments.css';

const BODY_ID = 'accountPockets-body';

// Placeholder rows drawn while pending: enough to hold the card near its answered
// height, few enough not to imply a count.
const SKELETON_ROWS = 3;

const pocketRoute = (pocketId: number) =>
 `/fintrack/pocket/pockets/${pocketId}`;

type AccountPocketCommitmentsPropType = {
 accountId: string;
 // The scalars and the list, as the account read serves them. Absent, not zero,
 // on every account type but bank: the card renders nothing there, since a zero
 // would claim "nothing committed" where the question cannot be asked.
 allocated?: number;
 unassignedCash?: number;
 isOverAllocated?: boolean;
 // Absent when router state carried the account from a list that serves only the
 // scalars: a missing list, not an empty one, so the card fetches it.
 pockets?: AccountPocketAllocationType[];
 currencyCode?: CurrencyType;
};

function AccountPocketCommitments({
 accountId,
 allocated,
 unassignedCash,
 isOverAllocated,
 pockets,
 currencyCode,
}: AccountPocketCommitmentsPropType) {
 // Where the pocket screen's back control returns to.
 const previousRoute = useLocation().pathname;

 const [isOpen, setIsOpen] = useState(false);

 // Fetched on first expand, and only when the list did not arrive with the
 // account (the dashboard and Overview hand it over in router state with the
 // scalars but no breakdown). A null url makes useFetch skip the request.
 const needsPockets = pockets === undefined;
 const { apiData, isLoading, error, refetch } =
  useFetch<AccountByTypeResponseType>(
   isOpen && needsPockets ? `${url_get_account_by_id}/${accountId}` : null,
  );

 const fetchedPockets = apiData?.data?.accountList[0]?.pockets;
 const rows = pockets ?? fetchedPockets;

 const currency_code = currencyCode ?? DEFAULT_CURRENCY;
 // Locale is the reader's, not the amount's: taken from the amount's currency,
 // Intl leaves every currency unmarked and USD, COP and MXN all narrow to '$'.
 const amount = (value: number) =>
  currencyFormat(currency_code, value, CURRENCY_OPTIONS[DEFAULT_CURRENCY]);

 // The four keys travel together, so one decides for all. Nothing is drawn for
 // investment or debtor accounts, where the question does not apply.
 if (allocated === undefined) return null;

 return (
  <section className='accountPockets'>
   <div className='accountPockets__headRow'>
    <span className='accountPockets__head'>
     <WalletSvg className='accountPockets__glyph' />

     <span className='accountPockets__label'>Allocated to pockets</span>
    </span>

    <button
     type='button'
     className={`accountPockets__toggle${isOpen ? ' is-active' : ''}`}
     onClick={() => setIsOpen((open) => !open)}
     aria-expanded={isOpen}
     aria-controls={BODY_ID}
     aria-label={
      isOpen
       ? 'Collapse the pockets funded by this account'
       : 'Expand the pockets funded by this account'
     }
    >
     <ArrowDownLightSvg className='accountPockets__toggleChevron' />
    </button>
   </div>

   {/* Both figures, never one: either alone misleads, and a pocket blocks no spending. Unassigned
       can go negative; that is reported, not corrected (no policy for which pocket refunds). */}
   <p className='accountPockets__figures'>
    <span className='accountPockets__figure'>
     <span className='accountPockets__figureLabel'>allocated</span>
     <b className='accountPockets__figureValue'>{amount(allocated)}</b>
    </span>

    {unassignedCash !== undefined && (
     <span className='accountPockets__figure'>
      <span className='accountPockets__figureLabel'>unassigned</span>
      <b
       className={`accountPockets__figureValue${
        isOverAllocated === true ? ' accountPockets__figureValue--over' : ''
       }`}
      >
       {amount(unassignedCash)}
      </b>
     </span>
    )}
   </p>

   {/* The words carry this reading and the colour only reinforces it, so an
       over-allocated account survives monochrome and colour blindness. */}
   {isOverAllocated === true && (
    <p className='accountPockets__flag'>
     Overcommitted: allocated past this account&apos;s balance.
    </p>
   )}

   {isOpen && (
    <div className='accountPockets__body' id={BODY_ID}>
     {/* Three distinct states: a failed or in-flight request is not an empty
         list. */}
     {error !== null ? (
      <div className='accountPockets__state' role='alert'>
       <p className='accountPockets__stateText'>
        The pockets funded by this account could not be loaded.
       </p>
       <p className='accountPockets__stateDetail'>{error}</p>
       <button
        type='button'
        className='accountPockets__retry'
        onClick={refetch}
       >
        Try again
       </button>
      </div>
     ) : rows === undefined || isLoading ? (
      <ul className='accountPockets__list' aria-hidden='true'>
       {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li
         className='accountPockets__row accountPockets__row--skeleton'
         key={`pocket-skeleton-${index}`}
        >
         <span className='accountPockets__bar accountPockets__bar--name' />
         <span className='accountPockets__bar accountPockets__bar--amount' />
        </li>
       ))}
      </ul>
     ) : rows.length === 0 ? (
      /* This account funds no pocket. A pocket fully released is absent rather
         than a zero row, hence "today" in the sentence. */
      <p className='accountPockets__empty'>
       No pocket is drawing on this account today.
      </p>
     ) : (
      <ul className='accountPockets__list'>
       {rows.map((pocket) => (
        <li key={`pocket-${pocket.pocketId}`}>
         {/* The whole row is the link, not just the name: the amount is half of
             what decides whether to open a pocket. */}
         <Link
          to={pocketRoute(pocket.pocketId)}
          state={{ previousRoute }}
          className='accountPockets__row accountPockets__row--link'
         >
          <span className='accountPockets__name'>{pocket.name}</span>

          {/* What this account holds for the pocket, never the pocket's own
              progress: the payload carries no target, so no bar or percentage. */}
          <span className='accountPockets__amount'>
           {amount(pocket.heldFromThisAccount)}
          </span>
         </Link>
        </li>
       ))}
      </ul>
     )}
    </div>
   )}
  </section>
 );
}

export default AccountPocketCommitments;

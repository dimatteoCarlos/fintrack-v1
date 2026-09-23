// Transaction rows of an Overview list; local to the page because LastMovements is its only consumer.

import { Link } from 'react-router-dom';

import {
 CURRENCY_OPTIONS,
 DATE_TIME_FORMAT_DEFAULT,
 DEFAULT_CURRENCY,
} from '../../../helpers/constants';

import { capitalize, currencyFormat, isDateValid } from '../../../helpers/functions';

import { LastMovementType } from './LastMovements';

import './listContent-style.css';

import { useTransactionDetail } from '../../../hooks/useTransactionDetail';
import { TransactionDetailModal } from './transactionDetailModal/TransactionDetailModal';

const defaultCurrency = DEFAULT_CURRENCY;
const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];

// A row the owner never annotated renders as this, never as blank space.
const DASH = '—';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// A 'YYYY-MM-DD' label is already the owner's calendar day; new Date would read
// it as UTC midnight, the previous day west of Greenwich.
const formatDate = (dateInput: Date | string | number): string => {
 const dateOnly = typeof dateInput === 'string' ? DATE_ONLY.exec(dateInput) : null;
 const date = dateOnly
  ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  : new Date(dateInput);

 return new Intl.DateTimeFormat(DATE_TIME_FORMAT_DEFAULT).format(date);
};

function ListContent({ listOfItems }: { listOfItems: LastMovementType[] }) {
 const { selectedTransaction, isLoading, openTransaction, closeTransaction } =
  useTransactionDetail();

 // Empty is a declared state, distinct from loading (owned by the page) and from an error.
 if (listOfItems.length === 0) {
  return <p className='listContent__empty'>No movements to show</p>;
 }

 return (
  <div className='listContent__container'>
   {listOfItems.map((item) => {
    const { accountName, closedLabel, record, note, movementType, date, currency } = item;

    const cells = (
     <>
      <span className='listContent__item-header'>
       <span className='listContent__account'>
        {accountName}
        {closedLabel && (
         <span className='listContent__accountClosed'> {closedLabel}</span>
        )}
       </span>
       <span className='listContent__amount'>
        {currencyFormat(currency, record, formatNumberCountry)}
       </span>
      </span>

      {/* The movement's own kind, named before what the owner said about it, on
          its own line: sharing the row below with the note crowded it into the
          same strip as the date and read as one more clause instead of a label. */}
      {movementType && (
       <span className='listContent__movementType'>{capitalize(movementType)}</span>
      )}

      <span className='listContent__details-row'>
       {/* Served, not split here: a client-side cut left an empty paragraph
           without a note, showed the server's reversal prefix as owner text, and
           swallowed notes opening with the word Transaction. */}
       <span className='listContent__description'>{note ?? DASH}</span>

       {date && isDateValid(date) && (
        <time className='listContent__date'>{formatDate(date)}</time>
       )}
      </span>
     </>
    );

    // A non-transaction row has no detail to open; it links to its own screen.
    if (item.link !== undefined) {
     return (
      <Link
       key={item.rowKey}
       className='listContent__item'
       to={item.link.to}
       state={item.link.state}
       viewTransition
      >
       {cells}
      </Link>
     );
    }

    return (
     // A button, not a div with onClick: it takes keyboard focus and announces
     // itself as activatable. Keyed on the transaction, not the map index, so a
     // shifted row never reuses another row's node and opens the wrong transaction.
     <button
      type='button'
      key={item.transactionId}
      className='listContent__item'
      onClick={() => openTransaction(item.transactionId)}
     >
      {cells}
     </button>
    );
   })}

   <TransactionDetailModal
    transaction={selectedTransaction}
    onClose={closeTransaction}
   />

   {/* Shown while the detail request is open. A bar, not the word "Loading",
       with the state on the region: the modal is about to cover the list, so a
       sentence under it would be announced to nobody. */}
   {isLoading && (
    <div className='listContent__pending' role='status' aria-busy='true'>
     <span className='listContent__pendingBar' aria-hidden='true' />
    </div>
   )}
  </div>
 );
}

export default ListContent;

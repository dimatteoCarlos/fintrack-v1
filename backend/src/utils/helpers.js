// Canonical stored form of an account name and of the parts it is built from: trimmed,
// lowercase, so the same name is always the same string. Display capitalisation is the frontend's job.
export function normalizeAccountName(text) {
 if (!text) return '';
 return String(text).trim().toLowerCase();
}
// Canonical form of a person's name: whitespace cleaned, case kept, because
// capitalization such as McCartney or O'Connor is user data.
export function normalizePersonName(text) {
 if (!text) return '';
 return String(text).trim().replace(/\s+/g, ' ');
}
// Transaction type and its counter type from the amount's sign and the account type;
// only for account-creation transactions. category_budget accounts may take any type.
export const determineTransactionType = (
  transaction_amount,
  account_type_name
) => {
  let transactionType = 'account-opening';
  let counterTransactionType = 'account-opening';

  if (transaction_amount === 0) {
    return { transactionType, counterTransactionType };
  }

  if (account_type_name !== 'debtor') {
    if (transaction_amount > 0) {
      transactionType = 'deposit';
      counterTransactionType = 'withdraw';
    } else {
      // negative amount on a non-debtor account; no known use case yet
      transactionType = 'withdraw';
      counterTransactionType = 'deposit';
    }
  } else {
    if (account_type_name === 'debtor' && transaction_amount > 0) {
      transactionType = 'borrow';
      counterTransactionType = 'lend';
    } else if (transaction_amount < 0) {
      transactionType = 'lend';
      counterTransactionType = 'borrow';
    }
  }
  return { transactionType, counterTransactionType };
};


// Formats an ISO 8601 date as dd-mm-yyyy, read in UTC.
export const formatDateToDDMMYYYY = (isoDate) => {
  const date = new Date(isoDate);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is zero-based
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
};
// Formats a date as DD/MM/YYYY HH:MM (en-GB).
export const formatDate = (date) => 
    new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

// Formats a date as { dateStr, timeStr } in Venezuelan style (es-VE).
export function formatDateToVenezuelanStyle(date) {
  if (!date) return '';
  const options = { 
   date:{day: 'numeric', month: 'long', year: 'numeric'} ,
   time:{ hour: 'numeric', minute: '2-digit', hour12: true,} };

  const dateStr = new Date(date).toLocaleDateString('es-VE', options.date);

  const timeStr = new Date(date).toLocaleTimeString('es-VE', options.time).toLowerCase();

  return {dateStr , timeStr};
 }


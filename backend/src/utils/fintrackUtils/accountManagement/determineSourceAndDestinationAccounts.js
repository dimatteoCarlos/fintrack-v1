// Derives the source and destination account ids from the transaction type name (transaction_types).

export function determineSourceAndDestinationAccounts(
  newAccountInfo,
  counterAccountInfo
) {
  // NULL, not a self-reference: no money moved, so there is no counterpart leg to
  // name. Both columns are nullable, and every downstream reader already treats a
  // self-referencing pair the same as a null pair.
  let destination_account_id = null;
  let source_account_id = null;

  const isAccountOpening =
    newAccountInfo.transaction_type_name === 'account-opening'; // transaction amount = 0

  if (!isAccountOpening) {
  destination_account_id =
(newAccountInfo.transaction_type_name === 'deposit' ||
  newAccountInfo.transaction_type_name === 'borrow')
    ? newAccountInfo.account_id
    : counterAccountInfo.account.account_id;

  source_account_id =
   newAccountInfo.transaction_type_name === 'withdraw' ||
   newAccountInfo.transaction_type_name === 'lend'
     ? newAccountInfo.account_id
     : counterAccountInfo.account.account_id;
  }
  return {
   destination_account_id,
   source_account_id,
   isAccountOpening,
  };
}
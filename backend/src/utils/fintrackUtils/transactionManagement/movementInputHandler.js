// Maps each movement type's request body to its source and destination account
// descriptors. Each side carries an id and a name separately; getAccountInfo
// prefers the id when present, and the two need not arrive together.
export const getExpenseConfig = (body) => ({
  sourceAccountId: body.account_id ?? null,
  sourceAccountName: body.account ?? null,
  sourceAccountTypeName: 'bank',
  sourceAccountTransactionType: 'withdraw',

  destinationAccountId: body.category_account_id ?? null,
  destinationAccountName: body.category ?? null,
  destinationAccountTypeName: 'category_budget',
  destinationAccountTransactionType: 'deposit',
});
export const getIncomeConfig = (body) => ({
  sourceAccountId: body.source_account_id ?? null,
  sourceAccountName: body.source ?? null,
  sourceAccountTransactionType: 'withdraw',
  sourceAccountTypeName: 'income_source',

  destinationAccountId: body.account_id ?? null,
  destinationAccountName: body.account ?? null,
  destinationAccountTypeName: 'bank',
  destinationAccountTransactionType: 'deposit',
});
export const getDebtConfig = (body) => {
  const { type, debtor, debtor_id, account, account_id, accountType } = body;

  const isLend = type === 'lend';
  // Lending moves money from the user's account to the debtor's; borrowing is the
  // reverse. Each side carries its own id, so an unresolved debtor falls back to
  // its name without forcing the other side onto the name path.
  return {
    sourceAccountId: isLend ? (account_id ?? null) : (debtor_id ?? null),
    sourceAccountName: isLend ? (account ?? null) : (debtor ?? null),
    sourceAccountTypeName: isLend ? accountType  : 'debtor',
    sourceAccountTransactionType: 'lend',

    destinationAccountId: isLend ? (debtor_id ?? null) : (account_id ?? null),
    destinationAccountName: isLend ? (debtor ?? null) : (account ?? null),
    destinationAccountTypeName: isLend ? 'debtor' : accountType ,
    destinationAccountTransactionType: 'borrow',
  };
};

export const getTransferConfig = (body) => {
// The frontend's 'pocket' type is 'pocket_saving' in the account_types catalog.
  const originAccountType =
  body.originAccountType === 'pocket'
  ? 'pocket_saving'
  : body.originAccountType;
  
  const destinationAccountType =
  body.destinationAccountType === 'pocket'
  ? 'pocket_saving'
  : body.destinationAccountType;
  return {
    destinationAccountId: body.destination_account_id ?? null,
    destinationAccountName: body.destination ?? null,

    destinationAccountTypeName: destinationAccountType,

    destinationAccountTransactionType: 'deposit',
    sourceAccountId: body.origin_account_id ?? null,
    sourceAccountName: body.origin ?? null,
    sourceAccountTypeName: originAccountType,
    sourceAccountTransactionType: 'withdraw',
  };
};
export const getPnLConfig = (body) => {
const isProfit = body.type === 'deposit';
const accountType=body.accountType

return {
  // Both sides use the name path: the compensation account has no id to send. Its type is
  // 'boundary', not 'bank' (retyped in 031): getAccountInfo matches name AND type, so
  // 'bank' would resolve nothing and the movement would fail with a 404.
  sourceAccountId: null,
  sourceAccountName: isProfit ? 'slack' : body.account,
  sourceAccountTransactionType: 'withdraw',
  sourceAccountTypeName: isProfit ? 'boundary' : accountType,

  destinationAccountId: null,
  destinationAccountName: isProfit ? body.account : 'slack',
  destinationAccountTransactionType: 'deposit',
  destinationAccountTypeName: isProfit ? accountType : 'boundary',

}
};

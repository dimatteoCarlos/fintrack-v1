// Maps repository rows to the { columns, rows, meta } dataset the writers take; renames fields, computes nothing.

// Column order: identity, direction, money, FX traceability, note.
export const TRANSACTIONS_DATASET_COLUMNS = [
 { key: 'date', label: 'Date', type: 'date' },
 { key: 'transactionId', label: 'Transaction ID', type: 'number' },
 { key: 'movementType', label: 'Movement type', type: 'text' },
 { key: 'direction', label: 'Direction', type: 'text' },
 { key: 'account', label: 'Account', type: 'text' },
 { key: 'sourceAccount', label: 'Source account', type: 'text' },
 { key: 'destinationAccount', label: 'Destination account', type: 'text' },
 { key: 'amount', label: 'Amount', type: 'number' },
 { key: 'currency', label: 'Currency', type: 'text' },
 { key: 'originalAmount', label: 'Original amount', type: 'number' },
 { key: 'originalCurrency', label: 'Original currency', type: 'text' },
 { key: 'exchangeRate', label: 'Exchange rate', type: 'number' },
 { key: 'rateSource', label: 'Rate source', type: 'text' },
 { key: 'rateDate', label: 'Rate date', type: 'date' },
 { key: 'note', label: 'Note', type: 'text' },
 { key: 'accountClosed', label: 'Account closed', type: 'boolean' },
];

/**
 * @param {Record<string, string|number>} [meta] - generatedAt, period, filters,
 *  row count; never userId
 */
export function toTransactionDataset(rows, meta = {}) {
 return {
  columns: TRANSACTIONS_DATASET_COLUMNS,
  rows: rows.map((row) => ({
   date: row.transaction_local_date,
   transactionId: row.transaction_id,
   movementType: row.movement_type_name,
   direction: row.transaction_type_name,
   account: row.account_name,
   sourceAccount: row.source_account_name,
   destinationAccount: row.destination_account_name,
   amount: row.amount,
   currency: row.currency_code,
   originalAmount: row.original_amount,
   originalCurrency: row.original_currency_code,
   exchangeRate: row.exchange_rate,
   rateSource: row.exchange_rate_source,
   rateDate: row.exchange_rate_timestamp,
   note: row.note,
   accountClosed: row.account_is_closed,
  })),
  meta,
 };
}

// The months an account has a balance to report, written once for every month-scoped stock read.

// Whether a month lies in [account_start_date, closed_at], compared by month so end months report whole.
// Month-relative, not `closed_at IS NULL`, which would erase past balances; CLOSE keeps the row.
// Types outside CLOSE_ZERO_BALANCE_TYPES (pocket_saving, category_budget, income_source) may close non-zero.
export function accountReportingWindowSql(
 accountAlias = 'ua',
 monthSql = '$2::date',
 timeZonePlaceholder = '$3',
) {
 // All three are interpolated into SQL, so each is restricted to a shape that
 // cannot carry a value (same guard as derivedAccountBalanceSql and
 // accountIdentitySelect in this folder).
 if (!/^[a-z_][a-z0-9_]*$/i.test(accountAlias)) {
  throw new Error(
   `accountReportingWindowSql expects a table alias, received: ${accountAlias}`,
  );
 }

 // A bind placeholder with an optional date cast, or a qualified column: a single
 // reference month arrives bound, a series of months from generate_series.
 if (!/^(\$\d+(::date)?|[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)$/i.test(monthSql)) {
  throw new Error(
   `accountReportingWindowSql expects a bind placeholder or a qualified column for the month, received: ${monthSql}`,
  );
 }

 if (!/^\$\d+$/.test(timeZonePlaceholder)) {
  throw new Error(
   `accountReportingWindowSql expects a bind placeholder such as '$3' for the time zone, received: ${timeZonePlaceholder}`,
  );
 }

 return `(
        -- A month before the account's start month has no balance to report, not a $0
        -- one: without this floor the subtraction that prices a past close would
        -- manufacture a $0 row for an account that did not exist yet.
        ${monthSql} >= date_trunc('month', ${accountAlias}.account_start_date AT TIME ZONE ${timeZonePlaceholder})
        -- The mirror: a month after the closing month has no balance to report either.
        AND (
          ${accountAlias}.closed_at IS NULL
          OR ${monthSql} <= date_trunc('month', ${accountAlias}.closed_at AT TIME ZONE ${timeZonePlaceholder})
        )
        -- A soft delete (deleted_at without closed_at) is out of every month. A closed
        -- row carries both stamps, so this cannot be a bare deleted_at IS NULL.
        AND (
          ${accountAlias}.deleted_at IS NULL
          OR ${accountAlias}.closed_at IS NOT NULL
        )
      )`;
}

export default accountReportingWindowSql;

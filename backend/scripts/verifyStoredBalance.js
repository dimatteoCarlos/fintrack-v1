// Checks user_accounts.account_balance against the ledger for every account (--all lists agreeing ones too).
// Run from backend/ (dotenv reads .env from the cwd); refuses a database whose NAME reads as production.
// Compared as NUMERIC in SQL, not FLOAT; the type join is LEFT because account_type_id can be NULL.

import { pool } from '../src/db/config/configDB.js';
import { derivedAccountBalanceSql } from '../src/utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';

const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

const showAll = process.argv.includes('--all');

// A name that names production, however it is spelled in a given environment.
const PRODUCTION_NAME_PATTERN = /prod/i;

const COMPARISON_QUERY = `
  SELECT
    ua.account_id,
    ua.account_name,
    act.account_type_name,
    ua.account_balance::text AS stored,
    (${DERIVED_BALANCE})::text AS derived,
    (ua.account_balance = ${DERIVED_BALANCE}) AS agrees,
    ua.deleted_at IS NOT NULL AS is_deleted
  FROM user_accounts ua
  LEFT JOIN account_types act ON act.account_type_id = ua.account_type_id
  ORDER BY ua.account_id
`;

const main = async () => {
 const { rows: dbRows } = await pool.query('SELECT current_database() AS name');
 const databaseName = dbRows[0].name;

 if (PRODUCTION_NAME_PATTERN.test(databaseName)) {
  console.error(
   `Refusing to run: the connected database is named "${databaseName}", which reads as production.`,
  );
  console.error(
   'This check is read-only, but the instruction covers reads too. Point DATABASE_URI at a development database.',
  );
  process.exitCode = 2;
  return;
 }

 const { rows } = await pool.query(COMPARISON_QUERY);
 const drifted = rows.filter((row) => row.agrees === false);

 console.log(`database: ${databaseName}`);
 console.log(`accounts checked: ${rows.length}`);
 console.log(`accounts that disagree: ${drifted.length}`);

 const listed = showAll ? rows : drifted;

 for (const row of listed) {
  const mark = row.agrees === false ? 'KO' : 'OK';
  const state = row.is_deleted ? ' [deleted]' : '';
  // A dash, not "null": the outer join admits an account whose type row was deleted, and the
  // absence should not read as a value.
  const typeName = row.account_type_name ?? '-';
  console.log(
   `${mark}  #${row.account_id}  ${row.account_name}  (${typeName})${state}`,
  );
  if (row.agrees === false) {
   console.log(`      stored  ${row.stored}`);
   console.log(`      ledger  ${row.derived}`);
  }
 }

 // A drift is a finding, not a crash; the non-zero exit code lets a pipeline react without
 // parsing the text.
 if (drifted.length > 0) {
  console.log('');
  console.log(
   'Each account above holds a stored balance its own rows do not produce.',
  );
  console.log(
   'setAccountBalanceFromLedger.js rewrites one account from its ledger; the write path that left it behind is what needs finding.',
  );
  process.exitCode = 1;
 }
};

main()
 .catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
 })
 .finally(async () => {
  await pool.end();
 });

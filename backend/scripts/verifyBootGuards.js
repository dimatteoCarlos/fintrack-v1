// Exercises the two refusals in ensureBalanceReversal() (createTables.js, boot counterpart of migration 037)
// that fire only on a PREEXISTING partial schema: movement_types absent returns early; account_registry
// absent skips the column and pairing constraint. Each probe drops a table in a savepoint and rolls back.

import pc from 'picocolors';
import { pool } from '../src/db/config/configDB.js';
import { ensureBalanceReversal } from '../src/db/run_time_db_init/createTables.js';

const readOption = (flag, fallback) => {
 const index = process.argv.indexOf(flag);
 return index === -1 || index === process.argv.length - 1
  ? fallback
  : process.argv[index + 1];
};

const EXPECTED_DATABASE = readOption('--expect', 'fintrack_dev');
const LOOPBACK = new Set(['127.0.0.1', '::1', '0.0.0.0']);

const results = [];

const check = (label, passed, detail = '') => {
 results.push(passed);
 console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

// Duplicated from verifyClose.js on purpose: this script DROPS TABLES, so its local-database guard must
// not be one import away from being relaxed for another caller. Refuses encrypted connections; no override.
const assertLocalDatabase = async (target) => {
 const { rows } = await target.query(
  `SELECT current_database() AS db_name,
          COALESCE(host(inet_server_addr()), 'unix-socket') AS server_address,
          COALESCE(
            (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
            false
          ) AS encrypted`,
 );
 const { db_name, server_address, encrypted } = rows[0];

 const refusals = [];
 if (db_name !== EXPECTED_DATABASE) {
  refusals.push(`connected to "${db_name}", expected "${EXPECTED_DATABASE}"`);
 }
 if (server_address !== 'unix-socket' && !LOOPBACK.has(server_address)) {
  refusals.push(`the server is at ${server_address}, which is not local`);
 }
 if (encrypted) {
  refusals.push('the connection is encrypted, which a local server does not require');
 }

 if (refusals.length > 0) {
  throw new Error(
   `refusing to run: ${refusals.join('; ')}. Nothing was written.`,
  );
 }

 console.log(
  `Database: ${db_name} at ${server_address}, unencrypted. Proceeding.`,
 );
};

const columnCount = async (client) => {
 const { rows } = await client.query(
  `SELECT count(*)::int AS n
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'reversal_of_account_id'`,
 );
 return rows[0].n;
};

const constraintCount = async (client, conname) => {
 const { rows } = await client.query(
  `SELECT count(*)::int AS n
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND con.conname = $1`,
  [conname],
 );
 return rows[0].n;
};

// Reads the key's actual parent from the catalog: a key on a different parent
// would still be a valid key.
const foreignKeyParent = async (client) => {
 const { rows } = await client.query(
  `SELECT parent.relname AS parent_table
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_class parent ON parent.oid = con.confrelid
     JOIN pg_attribute att
       ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = 'transactions'
      AND con.contype = 'f'
      AND att.attname = 'reversal_of_account_id'`,
 );
 return rows.length === 1 ? rows[0].parent_table : null;
};

const catalogRowCount = async (client, table, column, value) => {
 const { rows } = await client.query(
  `SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`,
  [value],
 );
 return rows[0].n;
};

const client = await pool.connect();
let rolledBack = false;

try {
 await assertLocalDatabase(client);
 await client.query('BEGIN');

 // Every probe below measures an absence after removing something, which proves
 // nothing unless the thing was there first.
 check(
  'the column exists before anything is removed',
  (await columnCount(client)) === 1,
 );
 check(
  'the pairing constraint exists before anything is removed',
  (await constraintCount(client, 'transactions_reversal_pairing_check')) === 1,
 );
 check(
  'the key points at account_registry to begin with',
  (await foreignKeyParent(client)) === 'account_registry',
  (await foreignKeyParent(client)) ?? 'no foreign key',
 );
 check(
  'movement type 11 is seeded',
  (await catalogRowCount(client, 'movement_types', 'movement_type_id', 11)) === 1,
 );
 check(
  'transaction type 7 is seeded',
  (await catalogRowCount(client, 'transaction_types', 'transaction_type_id', 7)) === 1,
 );

 // The function runs at every boot, so a database that already has everything is
 // its most common case; it must change nothing.
 console.log('');
 console.log(pc.cyan('-- on the intact database'));
 await ensureBalanceReversal(client);
 check(
  'a second run leaves the column alone',
  (await columnCount(client)) === 1,
 );
 check(
  'a second run leaves the pairing constraint alone',
  (await constraintCount(client, 'transactions_reversal_pairing_check')) === 1,
 );
 check(
  'a second run does not duplicate the catalog rows',
  (await catalogRowCount(client, 'movement_types', 'movement_type_id', 11)) === 1 &&
   (await catalogRowCount(client, 'transaction_types', 'transaction_type_id', 7)) === 1,
 );

 // The column must go with the table: ADD COLUMN IF NOT EXISTS over an existing
 // column is a no-op, so leaving it would let the guard pass without being reached.
 console.log('');
 console.log(pc.cyan('-- with account_registry absent'));
 await client.query('SAVEPOINT no_registry');
 try {
  await client.query('ALTER TABLE transactions DROP COLUMN reversal_of_account_id');
  await client.query('DROP TABLE account_registry CASCADE');

  await ensureBalanceReversal(client);

  check(
   'the column is not created without its parent',
   (await columnCount(client)) === 0,
   `${await columnCount(client)} column(s)`,
  );
  check(
   'the pairing constraint is not created either',
   (await constraintCount(client, 'transactions_reversal_pairing_check')) === 0,
  );
  // Failure prevented: a key pointing somewhere else. user_accounts has the same
  // column name and would accept the reference, and its rows are the ones that
  // get deleted.
  check(
   'the key is not repointed at another table',
   (await foreignKeyParent(client)) === null,
   (await foreignKeyParent(client)) ?? 'no foreign key, as required',
  );
  check(
   'the catalog rows still survive the skipped column',
   (await catalogRowCount(client, 'movement_types', 'movement_type_id', 11)) === 1,
  );
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT no_registry');
 }

 // The early return is measured by its effect: transaction type 7 is deleted
 // first, so finding it still missing proves the function stopped before either
 // catalog insert.
 console.log('');
 console.log(pc.cyan('-- with movement_types absent'));
 await client.query('SAVEPOINT no_catalog');
 try {
  await client.query('DELETE FROM transaction_types WHERE transaction_type_id = 7');
  await client.query('DROP TABLE movement_types CASCADE');

  await ensureBalanceReversal(client);

  // No "did not throw" assertion: a throw already aborts the script and reports
  // a failure.
  check(
   'it returns before seeding the transaction type',
   (await catalogRowCount(client, 'transaction_types', 'transaction_type_id', 7)) === 0,
   'transaction type 7 was not re-inserted',
  );
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT no_catalog');
 }

 await client.query('ROLLBACK');
 rolledBack = true;

 check(
  'the column survived the whole probe',
  (await columnCount(client)) === 1,
 );
 check(
  'transaction type 7 survived the whole probe',
  (await catalogRowCount(client, 'transaction_types', 'transaction_type_id', 7)) === 1,
 );

 const allPassed = results.every(Boolean);
 console.log('');
 console.log(
  allPassed
   ? 'the boot counterpart refuses to build half of 037 when its parent is missing'
   : 'AT LEAST ONE ASSERTION FAILED',
 );
 process.exitCode = allPassed ? 0 : 1;
} catch (error) {
 console.error(`verification failed: ${error.message}`);
 console.error(error.stack);
 process.exitCode = 1;
} finally {
 if (!rolledBack) {
  try {
   await client.query('ROLLBACK');
   console.log('rolled back on the way out');
  } catch {
   console.error('ROLLBACK FAILED - check transactions and account_registry');
  }
 }
 client.release();
 await pool.end();
}

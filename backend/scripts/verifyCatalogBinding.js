// Checks both build paths throw when a catalog id seeded by migrations 032 and 037 holds another name
// (the ON CONFLICT seed would swallow it). The SQL half runs the assertion block extracted from the
// migration file; the rest of each migration is not re-run because its ALTER TABLE is not idempotent.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { pool } from '../src/db/config/configDB.js';
import {
 ensureAccountClosureCatalog,
 ensureBalanceReversal,
} from '../src/db/run_time_db_init/createTables.js';

const readOption = (flag, fallback) => {
 const index = process.argv.indexOf(flag);
 return index === -1 || index === process.argv.length - 1
  ? fallback
  : process.argv[index + 1];
};

const EXPECTED_DATABASE = readOption('--expect', 'fintrack_dev');
const LOOPBACK = new Set(['127.0.0.1', '::1', '0.0.0.0']);
const MIGRATIONS = path.join(
 path.dirname(fileURLToPath(import.meta.url)),
 '../src/db/migrations/sql_migrations',
);

const results = [];

const check = (label, passed, detail = '') => {
 results.push(passed);
 console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

// Duplicated on purpose (see verifyBootGuards.js): this script REWRITES CATALOG
// ROWS, so the guard keeping it on a local test database must be readable here.
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
  throw new Error(`refusing to run: ${refusals.join('; ')}. Nothing was written.`);
 }

 console.log(`Database: ${db_name} at ${server_address}, unencrypted. Proceeding.`);
};

// The assertion block as the migration ships it: the LAST anonymous block in the
// file, so editing the migration edits what is exercised.
const assertionBlockOf = async (fileName) => {
 const source = await fs.readFile(path.join(MIGRATIONS, fileName), 'utf8');
 const blocks = source.match(/DO \$\$[\s\S]*?END \$\$;/g) ?? [];
 if (blocks.length === 0) throw new Error(`no anonymous block in ${fileName}`);
 return blocks[blocks.length - 1];
};

const catalogName = async (client, table, column, idColumn, id) => {
 const { rows } = await client.query(
  `SELECT ${column} AS name FROM ${table} WHERE ${idColumn} = $1`,
  [id],
 );
 return rows.length === 1 ? rows[0].name : null;
};

// A throw is the pass here, so it is captured. Several fragments are accepted
// where two mechanisms can refuse the same state; the message shows which fired.
const throwsWith = async (run, ...fragments) => {
 try {
  await run();
  return { threw: false, message: 'nothing was raised' };
 } catch (error) {
  return {
   threw: fragments.some((fragment) => error.message.includes(fragment)),
   message: error.message.split('\n')[0],
  };
 }
};

const client = await pool.connect();
let rolledBack = false;

try {
 await assertLocalDatabase(client);
 await client.query('BEGIN');

 // Every probe below rewrites a name and requires a refusal; where the seeds never
 // ran, the refusal would arrive for the wrong reason.
 check(
  'movement type 10 is account-closure before anything is rewritten',
  (await catalogName(client, 'movement_types', 'movement_type_name', 'movement_type_id', 10)) ===
   'account-closure',
 );
 check(
  'transaction type 6 is account-closure before anything is rewritten',
  (await catalogName(client, 'transaction_types', 'transaction_type_name', 'transaction_type_id', 6)) ===
   'account-closure',
 );
 check(
  'movement type 11 is balance-reversal before anything is rewritten',
  (await catalogName(client, 'movement_types', 'movement_type_name', 'movement_type_id', 11)) ===
   'balance-reversal',
 );
 check(
  'transaction type 7 is balance-reversal before anything is rewritten',
  (await catalogName(client, 'transaction_types', 'transaction_type_name', 'transaction_type_id', 7)) ===
   'balance-reversal',
 );

 const closureBlock = await assertionBlockOf('032_add_account_closure_movement_type.sql');
 const reversalBlock = await assertionBlockOf('037_add_balance_reversal.sql');
 check(
  'the assertion block of 032 names the ids it guards',
  closureBlock.includes('movement_type_id = 10') && closureBlock.includes('transaction_type_id = 6'),
 );
 check(
  'the assertion block of 037 names the ids it guards',
  reversalBlock.includes('movement_type_id = 11') && reversalBlock.includes('transaction_type_id = 7'),
 );

 // The common case: both halves must be silent on a database that already holds
 // what they expect.
 console.log('');
 console.log(pc.cyan('-- on the binding the writers expect'));
 await client.query(closureBlock);
 await client.query(reversalBlock);
 await ensureAccountClosureCatalog(client);
 await ensureBalanceReversal(client);
 check('neither build path objects to a correct binding', true, 'no exception raised');

 // movement_types has a name check, transaction_types has none, so a movement id can only drift onto a name
 // the check admits: the check is dropped first (also the state before the realignment migration).
 const nameChecks = await client.query(
  `SELECT con.conname
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'c'
      AND rel.relname = 'transaction_types'`,
 );
 check(
  'transaction_types has no name check to catch the drift first',
  nameChecks.rows.length === 0,
  `${nameChecks.rows.length} check constraint(s)`,
 );

 console.log('');
 console.log(pc.cyan('-- with movement type 11 renamed, check constraint absent'));
 await client.query('SAVEPOINT wrong_movement');
 try {
  await client.query(
   'ALTER TABLE movement_types DROP CONSTRAINT movement_types_movement_type_name_check',
  );
  await client.query(
   `UPDATE movement_types SET movement_type_name = 'reversal' WHERE movement_type_id = 11`,
  );

  const sql = await throwsWith(() => client.query(reversalBlock), 'movement_type_id 11 holds');
  check('the migration refuses a movement id bound to another name', sql.threw, sql.message);
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT wrong_movement');
 }

 // The boot path needs its own savepoint: the failed statement above aborts the block it ran in. Either of
 // two refusals passes (the rebuilt name check rejects the 'reversal' row, or the assertion fires); the
 // message shows which.
 await client.query('SAVEPOINT wrong_movement_boot');
 try {
  await client.query(
   'ALTER TABLE movement_types DROP CONSTRAINT movement_types_movement_type_name_check',
  );
  await client.query(
   `UPDATE movement_types SET movement_type_name = 'reversal' WHERE movement_type_id = 11`,
  );

  const boot = await throwsWith(
   () => ensureBalanceReversal(client),
   'not "balance-reversal"',
   'movement_types_movement_type_name_check',
  );
  check('the boot path refuses the same binding', boot.threw, boot.message);
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT wrong_movement_boot');
 }

 // transaction_types has no check constraint, so nothing above the assertion can
 // catch the drift first.
 console.log('');
 console.log(pc.cyan('-- with transaction type 6 renamed to an uncatalogued name'));
 await client.query('SAVEPOINT wrong_transaction');
 try {
  await client.query(
   `UPDATE transaction_types SET transaction_type_name = 'settlement' WHERE transaction_type_id = 6`,
  );

  const sql = await throwsWith(() => client.query(closureBlock), 'transaction_type_id 6 holds');
  check('the migration refuses a transaction id bound to another name', sql.threw, sql.message);
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT wrong_transaction');
 }

 await client.query('SAVEPOINT wrong_transaction_boot');
 try {
  await client.query(
   `UPDATE transaction_types SET transaction_type_name = 'settlement' WHERE transaction_type_id = 6`,
  );

  const boot = await throwsWith(() => ensureAccountClosureCatalog(client), 'not "account-closure"');
  check('the boot path refuses the same binding', boot.threw, boot.message);
 } finally {
  await client.query('ROLLBACK TO SAVEPOINT wrong_transaction_boot');
 }

 await client.query('ROLLBACK');
 rolledBack = true;

 check(
  'movement type 11 survived the whole probe',
  (await catalogName(client, 'movement_types', 'movement_type_name', 'movement_type_id', 11)) ===
   'balance-reversal',
 );
 check(
  'transaction type 6 survived the whole probe',
  (await catalogName(client, 'transaction_types', 'transaction_type_name', 'transaction_type_id', 6)) ===
   'account-closure',
 );

 const allPassed = results.every(Boolean);
 console.log('');
 console.log(
  allPassed
   ? 'both build paths refuse a catalog id that holds another name'
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
   console.error('ROLLBACK FAILED - check movement_types and transaction_types');
  }
 }
 client.release();
 await pool.end();
}

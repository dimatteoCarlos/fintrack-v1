// Covers the ensureTransactionOpeningFor() and ensureAccountRegistry() branches that only fire on a
// PREEXISTING database (db:parity builds from zero). Runs on a clone of fintrack_prod_data, not a
// savepoint, because both functions commit. Usage: npm run db:bootguards (--keep keeps the clone)

import pc from 'picocolors';
import pg from 'pg';
import { getDbConfig } from '../src/db/migrations/dbMigrationConfig.js';
import {
 ensureTransactionOpeningFor,
 ensureAccountRegistry,
} from '../src/db/run_time_db_init/createTables.js';

const TEMPLATE = 'fintrack_prod_data';
const CLONE = `fintrack_bootguard_${Date.now()}`;
const KEEP = process.argv.includes('--keep');
const LOOPBACK = new Set(['127.0.0.1', '::1', '0.0.0.0']);

const results = [];

const check = (label, passed, detail = '') => {
 results.push(passed);
 console.log(
  `${passed ? pc.green('PASS') : pc.red('FAIL')}  ${label}${detail ? `  (${detail})` : ''}`,
 );
};

// Kept beside the CREATE/DROP DATABASE it protects, not one import away. Refuses an encrypted
// connection with no override: the only server this may reach is a local one.
const assertLocalServer = async (client) => {
 const { rows } = await client.query(
  `SELECT COALESCE(host(inet_server_addr()), 'unix-socket') AS server_address,
          COALESCE(
            (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
            false
          ) AS encrypted`,
 );
 const { server_address, encrypted } = rows[0];
 const refusals = [];

 if (server_address !== 'unix-socket' && !LOOPBACK.has(server_address)) {
  refusals.push(`the server is at ${server_address}, which is not local`);
 }
 if (encrypted) {
  refusals.push('the connection is encrypted, which a local server does not require');
 }

 if (refusals.length > 0) {
  throw new Error(`refusing to run: ${refusals.join('; ')}. Nothing was created.`);
 }

 console.log(pc.gray(`Server: ${server_address}, unencrypted. Proceeding.`));
};

const connect = async (database) => {
 const client = new pg.Client({ ...getDbConfig(), database });
 await client.connect();
 return client;
};

// The parent a foreign key actually points at, read from pg_constraint: user_accounts and
// account_registry both carry account_id, so a key on the wrong one is still valid and nothing
// else would notice.
const keyParent = async (client, table, column) => {
 const { rows } = await client.query(
  `SELECT con.confrelid::regclass::text AS parent
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_attribute att
       ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = $1
      AND con.contype = 'f'
      AND att.attname = $2`,
  [table, column],
 );
 return rows.length === 1 ? rows[0].parent : null;
};

const columnExists = async (client, table, column) => {
 const { rows } = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
   ) AS present`,
  [table, column],
 );
 return rows[0].present;
};

const scalar = async (client, sql) => (await client.query(sql)).rows[0].value;

const admin = await connect('postgres');
let clone = null;

try {
 await assertLocalServer(admin);

 const { rows: template } = await admin.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [TEMPLATE],
 );
 if (template.length === 0) {
  throw new Error(
   `${TEMPLATE} does not exist on this server. It is the untouched production ` +
    'dump and the only honest subject for these branches; restore it first.',
  );
 }

 console.log(pc.cyan(`\nCloning ${TEMPLATE} -> ${CLONE}\n`));
 await admin.query(`CREATE DATABASE ${CLONE} TEMPLATE ${TEMPLATE}`);
 clone = await connect(CLONE);

 // Asserted, not assumed: every probe below measures the effect of a branch that only runs
 // when something is missing, and a database that already had it would pass them all while
 // measuring nothing.
 console.log(pc.cyan('-- preconditions on the clone'));
 check(
  'account_registry is absent to begin with',
  (await scalar(clone, "SELECT to_regclass('public.account_registry') IS NULL AS value")),
 );
 check(
  'transactions.opening_for_account_id is absent to begin with',
  !(await columnExists(clone, 'transactions', 'opening_for_account_id')),
 );
 check(
  'pocket_allocations is absent to begin with',
  (await scalar(clone, "SELECT to_regclass('public.pocket_allocations') IS NULL AS value")),
  'the absent-TABLE branch has a subject',
 );
 check(
  'there are accounts to repoint and backfill',
  (await scalar(clone, 'SELECT count(*)::int > 0 AS value FROM user_accounts')),
 );

 // Branch: `const parent = state.registry ? 'account_registry' : 'user_accounts'`. With no
 // registry, user_accounts is the only parent that exists and the key must land there
 // rather than the function failing.
 console.log(pc.cyan('\n-- ensureTransactionOpeningFor, registry absent'));
 await ensureTransactionOpeningFor(clone);
 check(
  'the column was added',
  await columnExists(clone, 'transactions', 'opening_for_account_id'),
 );
 check(
  'its key landed on user_accounts, the only parent that existed',
  (await keyParent(clone, 'transactions', 'opening_for_account_id')) === 'user_accounts',
  (await keyParent(clone, 'transactions', 'opening_for_account_id')) ?? 'no key',
 );
 check(
  'the partial unique index exists',
  await scalar(
   clone,
   `SELECT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'transactions'
         AND indexname = 'uq_transaction_opening_for_account'
    ) AS value`,
  ),
 );

 // Two skips are exercised at once: neither pocket_allocations nor
 // budget_monthly_allocations exists as a table on this dump. Neither may raise.
 console.log(pc.cyan('\n-- ensureAccountRegistry, registry absent'));
 await ensureAccountRegistry(clone);
 check(
  'account_registry was created',
  await scalar(clone, "SELECT to_regclass('public.account_registry') IS NOT NULL AS value"),
 );
 check(
  'it holds one row per live account',
  await scalar(
   clone,
   `SELECT (SELECT count(*) FROM account_registry)
         = (SELECT count(*) FROM user_accounts) AS value`,
  ),
 );
 check(
  "036's cap is present",
  await scalar(
   clone,
   `SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'account_registry'::regclass
         AND conname = 'chk_close_reason_length'
    ) AS value`,
  ),
 );

 // The assertion the sequence exists for: the key was correctly on user_accounts after the
 // first call and must not be after both.
 check(
  'the opening key moved to account_registry',
  (await keyParent(clone, 'transactions', 'opening_for_account_id')) === 'account_registry',
  (await keyParent(clone, 'transactions', 'opening_for_account_id')) ?? 'no key',
 );

 for (const [table, column] of [
  ['transactions', 'account_id'],
  ['transactions', 'source_account_id'],
  ['transactions', 'destination_account_id'],
  ['debtor_accounts', 'selected_account_id'],
 ]) {
  check(
   `${table}.${column} references account_registry`,
   (await keyParent(clone, table, column)) === 'account_registry',
   (await keyParent(clone, table, column)) ?? 'no key',
  );
 }

 check(
  'the absent tables were skipped rather than raised on',
  (await scalar(clone, "SELECT to_regclass('public.pocket_allocations') IS NULL AS value")) &&
   (await scalar(
    clone,
    "SELECT to_regclass('public.budget_monthly_allocations') IS NULL AS value",
   )),
  'the function completed with two of the seven keys unwritten',
 );

 // Every boot calls both, so a finished database must stay unchanged: a drop and re-add of a key would
 // take an ACCESS EXCLUSIVE lock on transactions and revalidate every row.
 console.log(pc.cyan('\n-- both functions again, on the finished database'));
 const registryBefore = await scalar(
  clone,
  'SELECT count(*)::int AS value FROM account_registry',
 );
 await ensureTransactionOpeningFor(clone);
 await ensureAccountRegistry(clone);
 check(
  'the registry gained no rows',
  (await scalar(clone, 'SELECT count(*)::int AS value FROM account_registry')) ===
   registryBefore,
  `${registryBefore} before and after`,
 );
 check(
  'the opening key is still on account_registry',
  (await keyParent(clone, 'transactions', 'opening_for_account_id')) === 'account_registry',
 );
 check(
  'no duplicate key was left on the column',
  (await scalar(
   clone,
   `SELECT count(*)::int AS value
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att
        ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
     WHERE rel.relname = 'transactions'
       AND con.contype = 'f'
       AND att.attname = 'opening_for_account_id'`,
  )) === 1,
 );

 const failed = results.filter((passed) => !passed).length;
 console.log(
  failed === 0
   ? pc.green(`\n${results.length} assertions, none failing.\n`)
   : pc.red(`\n${failed} of ${results.length} assertions FAILED.\n`),
 );
 process.exitCode = failed === 0 ? 0 : 1;
} catch (error) {
 console.error(pc.red(`\n${error.message}\n`));
 process.exitCode = 1;
} finally {
 if (clone) await clone.end();
 if (clone && !KEEP) {
  await admin.query(`DROP DATABASE IF EXISTS ${CLONE}`);
  console.log(pc.gray(`Dropped ${CLONE}.`));
 } else if (clone) {
  console.log(pc.yellow(`Kept ${CLONE} for inspection. Drop it when done.`));
 }
 await admin.end();
}

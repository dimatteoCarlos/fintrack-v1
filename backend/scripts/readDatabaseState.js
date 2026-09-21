/**
 * Read-only report of a database's state, behind the same destination interlock as db:migrate.
 * Usage: DB_EXPECTED=fintrack_dev npm run db:state
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import pg from 'pg';
import { pool as defaultPool } from '../src/db/config/configDB.js';
import {
 assertExpectedDatabase,
 getDbConfig,
} from '../src/db/migrations/dbMigrationConfig.js';

// pg_constraint.confdeltype one-letter codes, spelled out.
const ON_DELETE = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/db/migrations/sql_migrations');

// The alignment script sits beside the chain, is applied by hand, and is recorded
// in the ledger as 'supabase/001_production_alignment.sql'; the reader must know
// the file exists or it reports that row as an orphan.
const ALIGNMENT_DIR = path.join(process.cwd(), 'src/db/migrations/supabase');

function filesOnDisk() {
 const chain = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

 const alignment = fs.existsSync(ALIGNMENT_DIR)
  ? fs
     .readdirSync(ALIGNMENT_DIR)
     .filter((f) => f.endsWith('.sql'))
     .map((f) => `supabase/${f}`)
  : [];

 return { chain, all: [...chain, ...alignment] };
}

// Same DB_NAME override runMigrations honours: a rehearsal copy lives on the same
// server under another name, and reading it must not require editing DATABASE_URI.
function resolvePool() {
 return process.env.DB_NAME ? new pg.Pool(getDbConfig()) : defaultPool;
}

// Compares the ledger with the files on disk. Surfaces a migration renamed after it
// ran: the ledger keys on file name with no checksum, so the successor runs again
// and the old name stays behind with no file.
async function reportLedger(client) {
 console.log(pc.cyan('\nLedger'));

 let recorded;
 try {
  const { rows } = await client.query(
   'SELECT id, filename, executed_at FROM migrations ORDER BY id',
  );
  recorded = rows;
 } catch (error) {
  console.log(pc.yellow(`  no readable ledger: ${error.message}`));
  console.log(pc.gray('  a database built by the boot path has no migrations table'));
  return;
 }

 const { chain, all } = filesOnDisk();

 const names = new Set(recorded.map((r) => r.filename));
 // Only the chain can be pending; the alignment script is applied by hand.
 const pending = chain.filter((f) => !names.has(f));
 const orphaned = recorded.filter((r) => !all.includes(r.filename));
 const last = recorded[recorded.length - 1];

 console.log(`  ${recorded.length} rows, ${all.length} files on disk`);
 if (last) {
  console.log(`  last executed: ${last.filename} on ${last.executed_at.toISOString()}`);
 }

 console.log(pending.length ? pc.yellow(`  pending: ${pending.join(', ')}`) : pc.green('  pending: none'));

 if (orphaned.length) {
  console.log(pc.yellow('  recorded with no file on disk:'));
  for (const row of orphaned) {
   console.log(pc.yellow(`    ${row.filename}  ${row.executed_at.toISOString()}`));
  }
 }
}

// Probes objects created by the closure migrations (extend past 035). Reads the schema, not
// the ledger: it records file names, so a file edited after running leaves the schema ahead.
async function reportObjects(client) {
 console.log(pc.cyan('\nObjects created by 031-035'));

 const {
  rows: [state],
 } = await client.query(
  "SELECT" +
   " (SELECT count(*) FROM account_types WHERE account_type_name = 'boundary') AS m031_boundary," +
   " (SELECT count(*) FROM movement_types WHERE movement_type_name = 'account-closure') AS m032_movement," +
   " (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'" +
   "   AND table_name = 'user_accounts' AND column_name = 'account_type_id') AS m033_nullable," +
   " (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'" +
   "   AND table_name = 'user_accounts' AND column_name = 'closed_at') AS m034_closed_at," +
   " to_regclass('public.account_registry') AS m035_registry," +
   " to_regclass('public.budget_monthly_allocations') AS m035_precondition",
 );

 for (const [key, value] of Object.entries(state)) {
  console.log(`  ${key.padEnd(20)} ${value === null ? pc.yellow('absent') : value}`);
 }

 console.log(
  pc.gray(
   '\n  m035_precondition is not a migration. It decides the seventh key of 035:' +
    '\n  absent means budget_monthly_allocations was never created and that ALTER is skipped.',
  ),
 );
}

// Measures 035: backfill coverage, registry rows outliving their account, and where the keys
// point. Keys come from pg_constraint, not the migration's names, so later changes stay true.
async function reportRegistry(client) {
 console.log(pc.cyan('\nAccount registry (035)'));

 const {
  rows: [present],
 } = await client.query("SELECT to_regclass('public.account_registry') AS t");

 if (present.t) {
  await reportBackfill(client);
 } else {
  console.log(pc.yellow('  absent: 035 has not been applied here'));
 }

 const { rows: keys } = await client.query(
  'SELECT c.conname, c.conrelid::regclass::text AS child,' +
   ' c.confrelid::regclass::text AS parent, c.confdeltype AS on_delete' +
   " FROM pg_constraint c WHERE c.contype = 'f'" +
   '  AND c.confrelid::regclass::text IN' +
   "   ('user_accounts', 'account_registry', 'category_budget_accounts')" +
   ' ORDER BY parent, child, conname',
 );

 console.log(pc.cyan('\n  Foreign keys into the account identity'));
 for (const k of keys) {
  const action = ON_DELETE[k.on_delete] || k.on_delete;
  console.log(`    ${k.parent.padEnd(24)} <- ${k.child}.${k.conname}  [${action}]`);
 }

 if (present.t) await reportRepointed(client);
}

// The seven keys migration 035 repoints to the registry, identified by column
// because Postgres generates the constraint names.
const REPOINTED_KEYS = [
 ['transactions', 'account_id'],
 ['transactions', 'source_account_id'],
 ['transactions', 'destination_account_id'],
 ['transactions', 'opening_for_account_id'],
 ['pocket_allocations', 'source_account_id'],
 ['debtor_accounts', 'selected_account_id'],
 ['budget_monthly_allocations', 'account_id'],
];

// Tallies how many of the seven keys point at account_registry: Overview reads take the table's
// presence as proof, yet a boot-built database can have it with four keys. Absent table/column
// is reported apart from a key pointing elsewhere (another migration's debt vs a repoint that failed).
async function reportRepointed(client) {
 const pointed = [];
 const elsewhere = [];
 const missing = [];

 for (const [table, column] of REPOINTED_KEYS) {
  const {
   rows: [{ present: hasColumn }],
  } = await client.query(
   'SELECT EXISTS (SELECT 1 FROM information_schema.columns' +
    ' WHERE table_name = $1 AND column_name = $2) AS present',
   [table, column],
  );

  if (!hasColumn) {
   missing.push(`${table}.${column}`);
   continue;
  }

  const { rows } = await client.query(
   'SELECT c.confrelid::regclass::text AS parent FROM pg_constraint c' +
    ' JOIN pg_class rel ON rel.oid = c.conrelid' +
    ' JOIN pg_attribute att ON att.attrelid = rel.oid' +
    '  AND att.attnum = ANY (c.conkey)' +
    " WHERE rel.relname = $1 AND c.contype = 'f' AND att.attname = $2",
   [table, column],
  );

  if (rows[0]?.parent === 'account_registry') pointed.push(`${table}.${column}`);
  else elsewhere.push(`${table}.${column} -> ${rows[0]?.parent ?? 'no key'}`);
 }

 const all = pointed.length === REPOINTED_KEYS.length;
 console.log(
  (all ? pc.green : pc.yellow)(
   `\n  ${pointed.length} of ${REPOINTED_KEYS.length} repointed keys reach account_registry`,
  ),
 );

 for (const k of elsewhere) console.log(pc.red(`    not repointed: ${k}`));
 for (const k of missing) {
  console.log(pc.yellow(`    absent, owed by another migration: ${k}`));
 }
}

// Split out because it can only run once the table exists, whereas the key report
// must also run before then.
async function reportBackfill(client) {
 const {
  rows: [counts],
 } = await client.query(
  'SELECT (SELECT count(*) FROM user_accounts) AS accounts,' +
   ' (SELECT count(*) FROM account_registry) AS registry,' +
   ' (SELECT count(*) FROM account_registry r WHERE NOT EXISTS' +
   '   (SELECT 1 FROM user_accounts ua WHERE ua.account_id = r.account_id)) AS closed',
 );

 // count(*) is bigint, which node-postgres returns as a string, so a strict
 // comparison against a number is always false.
 const parity = Number(counts.accounts) === Number(counts.registry) - Number(counts.closed);

 console.log(`  user_accounts        ${counts.accounts}`);
 console.log(`  account_registry     ${counts.registry}`);
 console.log(`  stamped, no account  ${counts.closed}`);
 console.log(
  parity
   ? pc.green('  every live account has a registry row')
   : pc.red('  MISMATCH: a live account has no registry row'),
 );
}

async function main() {
 const pool = resolvePool();
 const client = await pool.connect();
 try {
  await assertExpectedDatabase(client, 'db:state');
  await reportLedger(client);
  await reportObjects(client);
  await reportRegistry(client);
 } finally {
  client.release();
  await pool.end();
 }
}

main().catch((error) => {
 console.error(pc.red(`\n${error.message}\n`));
 process.exit(1);
});

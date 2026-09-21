/**
 * Runs supabase/001_production_alignment.sql once on a production-shaped copy; refuses
 * NODE_ENV=production and needs DB_EXPECTED. No wrapper transaction or ledger write: the file
 * has its own BEGIN/COMMIT and step 9. Usage: DB_NAME=x DB_EXPECTED=x npm run db:align
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import pg from 'pg';
import { pool as defaultPool } from '../config/configDB.js';
import {
 assertExpectedDatabase,
 getDbConfig,
 isProduction,
} from './dbMigrationConfig.js';

const ALIGNMENT_FILE = path.join(
 process.cwd(),
 'src/db/migrations/supabase/001_production_alignment.sql',
);

const LEDGER_NAME = 'supabase/001_production_alignment.sql';

/**
 * DB_NAME override, as in runMigrations: a rehearsal copy lives on the same
 * server under another name and reaching it must not mean editing DATABASE_URI.
 */
function resolveTarget() {
 const override = process.env.DB_NAME;

 if (!override) {
  return { pool: defaultPool, target: 'the database DATABASE_URI names' };
 }

 return { pool: new pg.Pool(getDbConfig()), target: override };
}

async function runAlignment() {
 // Two independent refusals, as in runMigrations: this one stops a deployed
 // process from migrating itself (it keys on NODE_ENV); assertExpectedDatabase
 // below confirms the database, which the mode cannot.
 if (isProduction()) {
  console.error(
   pc.red('\n❌ The alignment is not allowed under NODE_ENV=production.\n') +
    pc.gray('   This guard stops a deployed process from migrating itself.\n') +
    pc.gray('   An operator runs it from a shell where NODE_ENV is not production.\n'),
  );
  process.exit(1);
 }

 if (!fs.existsSync(ALIGNMENT_FILE)) {
  console.error(pc.red(`\n❌ Not found: ${ALIGNMENT_FILE}\n`));
  process.exit(1);
 }

 const { pool, target } = resolveTarget();
 console.log(pc.cyan(`Alignment target: ${target}`));

 const client = await pool.connect();
 let exitCode = 0;

 try {
  await assertExpectedDatabase(client, 'db:align');

  // Read through to_regclass first: a production-shaped copy has the ledger table
  // with no rows, while a boot-path database has no table at all, and that must
  // not read as a failure before the file has done anything.
  const {
   rows: [{ already }],
  } = await client.query(
   "SELECT CASE WHEN to_regclass('public.migrations') IS NULL THEN NULL" +
    '  ELSE (SELECT max(executed_at) FROM migrations WHERE filename = $1)' +
    ' END AS already',
   [LEDGER_NAME],
  );

  // Refuse, not warn: step 8 re-adds the three transactions foreign keys to user_accounts
  // as ON DELETE RESTRICT, silently undoing part of migration 035 so CLOSE can no longer
  // delete the row. The file is idempotent only until the chain runs on top of it.
  if (already) {
   console.error(
    pc.red('\n❌ Refusing: the alignment is already recorded here.\n') +
     pc.gray(`   Applied ${already.toISOString()}.\n`) +
     pc.gray('   Re-running is not safe once the chain has run on top: step 8 points\n') +
     pc.gray('   three transactions foreign keys back at user_accounts, undoing part\n') +
     pc.gray('   of 035 with no error.\n') +
     pc.gray('   To rehearse again, build a new database from the production dump.\n'),
   );
   client.release();
   await pool.end();
   process.exit(1);
  }

  console.log(pc.yellow(`\n▶ Running ${LEDGER_NAME}\n`));

  const sql = fs.readFileSync(ALIGNMENT_FILE, 'utf-8');
  await client.query(sql);

  const { rows: ledger } = await client.query(
   'SELECT count(*)::int AS rows FROM migrations',
  );

  console.log(
   pc.green('\n✅ Alignment applied.\n') +
    pc.gray(`   The ledger now holds ${ledger[0].rows} rows.\n`) +
    pc.gray('   013 is not among them, deliberately, so db:migrate runs it next.\n'),
  );
 } catch (error) {
  console.error(pc.red('\n❌ Alignment failed:'), error.message);
  console.error(
   pc.gray('   The file opens and closes its own transaction, so nothing partial survives.\n'),
  );
  exitCode = 1;
 } finally {
  client.release();
 }

 await pool.end();
 process.exit(exitCode);
}

runAlignment();

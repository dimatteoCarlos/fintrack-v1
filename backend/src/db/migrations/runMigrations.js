// Migration runner: executes pending SQL migrations, one transaction per file.

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
const MIGRATIONS_DIR = path.join(process.cwd(), 'src/db/migrations/sql_migrations');

/**
 * Decides which database this run migrates: the DATABASE_URI pool by default, or DB_NAME
 * (a rehearsal copy on the same server, as bootstrapping.js resolves it). The override is
 * refused under NODE_ENV=production: a stray DB_NAME would migrate the wrong database.
 *
 * @returns {{pool: object, target: string}} the pool to migrate and its name
 */
function resolveTarget() {
 const override = process.env.DB_NAME;

 if (!override) {
  return { pool: defaultPool, target: 'the database DATABASE_URI names' };
 }

 if (isProduction()) {
  console.error(
   pc.red('\n❌ DB_NAME override is not allowed when NODE_ENV=production.\n'),
  );
  process.exit(1);
 }

 return { pool: new pg.Pool(getDbConfig()), target: override };
}

async function runMigrations() {
 // Two independent refusals: this one stops a deployed process from migrating
 // itself (it keys on NODE_ENV, not on the destination); assertExpectedDatabase
 // below confirms the database, which the mode cannot. Neither replaces the other.
 if (isProduction()) {
  console.error(pc.red('\n❌ Migrations are not allowed under NODE_ENV=production.\n'));
  process.exit(1);
 }

 const { pool, target } = resolveTarget();
 console.log(pc.cyan(`Migration target: ${target}`));

 const client = await pool.connect();

 // Runs before anything is written; the target line above cannot name the
 // database when DB_NAME is unset.
 await assertExpectedDatabase(client, 'db:migrate');

 let exitCode = 0;

 try {
  console.log(pc.cyan('\n\ud83d\ude80 Starting database migrations...\n'));

  // The ledger belongs to no migration, so it is created outside every
  // migration's transaction.
  await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

  const { rows } = await client.query('SELECT filename FROM migrations');
  const executedMigrations = rows.map((r) => r.filename);

  const migrationFiles = fs
   .readdirSync(MIGRATIONS_DIR)
   .filter((f) => f.endsWith('.sql'))
   .sort(); // critical: order matters

  for (const file of migrationFiles) {
   if (executedMigrations.includes(file)) {
    console.log(pc.gray(`\u23ed Skipping ${file}`));
    continue;
   }

   console.log(pc.yellow(`\u25b6 Running ${file}`));

   const filePath = path.join(MIGRATIONS_DIR, file);
   const sql = fs.readFileSync(filePath, 'utf-8');

   // One transaction per file: the schema change and its ledger row commit
   // together. Files must not carry BEGIN/COMMIT, or they would close this one.
   await client.query('BEGIN');

   try {
    await client.query(sql);
    await client.query('INSERT INTO migrations (filename) VALUES ($1)', [
     file,
    ]);
    await client.query('COMMIT');
   } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`${file}: ${error.message}`);
   }

   console.log(pc.green(`\u2714 Completed ${file}\n`));
  }

  console.log(pc.green('\n\u2705 All migrations executed successfully.\n'));
 } catch (error) {
  console.error(pc.red('\n\u274c Migration failed:'), error.message);
  exitCode = 1;
 } finally {
  client.release();
 }

 // The exit code is decided here, after the client is released: process.exit
 // inside the catch would skip the finally block.
 await pool.end();
 process.exit(exitCode);
}

runMigrations();

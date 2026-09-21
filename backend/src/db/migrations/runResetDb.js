/**
 * Database reset (DEV ONLY): drops and recreates the whole database, removing all
 * data, schema and migration state. Never runs in production; runs no migrations
 * or seeds. Manual: npm run db:reset
 */

import pg from 'pg';
import pc from 'picocolors';
import dotenv from 'dotenv';
import { assertExpectedDatabase } from './dbMigrationConfig.js';

dotenv.config();

const {Client} = pg;

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  NODE_ENV,
  DATABASE_URI,
} = process.env;

if(NODE_ENV === 'production'){
 console.error(pc.red('❌ db:reset is forbidden in production'));
 process.exit(1);
}

// Precedence: individual DB_* variables, then DATABASE_URI, then defaults.
function parseConnectionString(uri) {
  const parsed = new URL(uri);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
  };
}
let parsed ={};
if (DATABASE_URI) {
   parsed = parseConnectionString(DATABASE_URI);
}

const config = {
  host: DB_HOST || parsed?.host || 'localhost',
  port: parseInt(DB_PORT || parsed?.port || '5432', 10),
  user: DB_USER || parsed?.user || 'postgres',
  password: DB_PASSWORD || parsed?.password || '',
  database: DB_NAME || parsed?.database || '',
};

if (!config.database) {
  console.error(pc.red('❌ Database name could not be determined (DB_NAME or DATABASE_URI required)'));
  process.exit(1);
}
const targetDbName = config.database;

// Admin connection to 'postgres': a database cannot be dropped from inside itself.
const adminClient = new Client({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: 'postgres',
});

/**
 * Confirms from inside the target that it is the database about to be destroyed: NODE_ENV
 * does not select it, so an unset NODE_ENV with a production DATABASE_URI would drop production.
 * Uses a target connection, not adminClient (attached to 'postgres'); DB_EXPECTED is required.
 */
async function confirmTarget() {
 if (!process.env.DB_EXPECTED) {
  console.error(
   pc.red('\n❌ db:reset refuses to run without DB_EXPECTED.\n') +
    pc.gray(`   It would drop and recreate "${targetDbName}".\n`) +
    pc.gray('   Set DB_EXPECTED to that name to confirm it is the one you mean.\n'),
  );
  process.exit(1);
 }

 const { rows } = await adminClient.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [targetDbName],
 );

 if (!rows.length) {
  console.log(
   pc.yellow(`⚠ ${targetDbName} does not exist; nothing to drop.`),
  );

  if (process.env.DB_EXPECTED !== targetDbName) {
   console.error(
    pc.red('\n❌ db:reset refuses to run: destination mismatch.\n') +
     pc.gray(`   DB_EXPECTED names "${process.env.DB_EXPECTED}" and this run would create "${targetDbName}".\n`),
   );
   process.exit(1);
  }
  return;
 }

 const targetClient = new Client({ ...config, database: targetDbName });
 await targetClient.connect();

 try {
  await assertExpectedDatabase(targetClient, 'db:reset');
 } finally {
  // Closed before the terminate below, or this connection is one of the ones
  // it kills and the drop fails on a database still in use.
  await targetClient.end();
 }
}

async function resetDatabase(){
 try{
  console.log(pc.yellow('\n⚠️  Resetting database (DEV ONLY)...\n'));

  await adminClient.connect();

  // Before anything is terminated or dropped.
  await confirmTarget();

  await adminClient.query(`
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = $1
    AND pid <> pg_backend_pid();
   `, [targetDbName]);

    console.log(pc.red(`🗑 Dropping database: ${targetDbName}`));
    await adminClient.query(`DROP DATABASE IF EXISTS "${targetDbName}"`);

    console.log(pc.green(`🆕 Creating database: ${targetDbName}`));
    await adminClient.query(`CREATE DATABASE "${targetDbName}"`);

    console.log(pc.green('\n✅ Database reset completed successfully\n'));
  } catch (error) {
    console.error(pc.red('\n❌ Database reset failed'));
    console.error(pc.red(error.message));
    process.exit(1);
  } finally {
    await adminClient.end();
    process.exit(0);
  }
}
if (NODE_ENV === 'production') {
  console.error(pc.red('❌ db:reset is forbidden in production'));
  process.exit(1);
}

resetDatabase();

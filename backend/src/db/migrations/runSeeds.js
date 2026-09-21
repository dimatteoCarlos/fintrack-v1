/**
 * Seed runner: executes the sql_seeds files whose name starts with the requested
 * type (base | admin) in one transaction. Seeds are never part of runtime.
 * Manual: npm run db:seed:base | npm run db:seed:admin
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

import { pathToFileURL } from 'url';
import { pool } from '../config/configDB.js';
import { assertExpectedDatabase, isProduction } from './dbMigrationConfig.js';

const SEEDS_DIR = path.join(process.cwd(), 'src/db/migrations/sql_seeds');
const seedType = process.argv[2]; // 'base' | 'admin'

if (!['base', 'admin'].includes(seedType)) {
  console.error(
    pc.red('\n❌ You must specify which seeds to run: base | admin\n')
  );
  console.log(pc.gray('Examples:'));
  console.log(pc.gray('  npm run db:seed:base'));
  console.log(pc.gray('  npm run db:seed:admin\n'));
  process.exit(1);
}

async function runSeeds() {
 // The same two refusals as db:migrate (the mode, then the destination): seeds
 // write catalog rows into an existing database, so a wrong one costs as much.
 if (isProduction()) {
  console.error(pc.red('\n❌ Seeds are not allowed under NODE_ENV=production.\n'));
  process.exit(1);
 }

  const client = await pool.connect();
  await assertExpectedDatabase(client, `db:seed:${seedType}`);
  let executedCount = 0;
  try {
   console.log(pc.cyan(`\n🌱 Running "${seedType}" seeds...\n`));

await client.query('BEGIN');
const seedFiles = fs
 .readdirSync(SEEDS_DIR)
 .filter(f => f.endsWith('.js'))
 .filter(f => f.startsWith(`${seedType}_`))
 .sort(); // execution order matters

console.log(pc.cyan(`🌱 Running ${seedFiles.length} seed(s)...`));

if (seedFiles.length === 0) {
 console.log(
  pc.yellow(`⚠️ No ${seedType} seeds found`)
 );
 await client.query('ROLLBACK');
 return;
  }

for (const file of seedFiles) {
const filePath = path.join(SEEDS_DIR, file);
 console.log(pc.yellow(`▶ Running ${file}`));

// A file URL keeps the dynamic import valid for Windows paths.
const fileUrl = pathToFileURL(filePath).href;
const seedModule = await import(fileUrl)
// Each seed must export a default async function.
if (typeof seedModule.default === 'function') {
  await seedModule.default(client);
  executedCount++;
  console.log(pc.green(`✔ Completed ${file}\n`));
 }else {
console.error(pc.red(`❌ ${file} is missing a default export function.`));}
}
await client.query('COMMIT');

console.log(pc.green(`✅ Seeds completed. Executed: ${executedCount}\n`
  )
 );
} catch (error) {
await client.query('ROLLBACK');

console.error(
pc.red('\n❌ Seed execution failed. Transaction rolled back.')
);
console.error(pc.red(error.message));
process.exit(1);

} finally {
client.release();
process.exit(0);
 }
}

runSeeds();
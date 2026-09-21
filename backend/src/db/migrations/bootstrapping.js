/**
 * Bootstraps a fresh non-production database: refuses production, creates the database if missing (via pg),
 * runs pending migrations. No seeds, no admin users, never on app start. Manual: npm run db:bootstrap
 */

import pg from 'pg';
import pc from 'picocolors';
import { getAdminDbConfig, getDbConfig, isProduction } from './dbMigrationConfig.js';
import { execSync } from 'child_process';

const { Client } = pg;

if (isProduction()) {
  console.error(pc.red('\n❌ Bootstrap is not allowed in production.\n'));
  process.exit(1);
}

async function bootstrap() {
  console.log(pc.green('\n🚀 Starting database bootstrap...\n'));

  // Shared by the create-database step and the migration step.
  const targetDbName = getDbConfig().database;

  try {
    const adminConfig = getAdminDbConfig();
    const adminClient = new Client(adminConfig);
    await adminClient.connect();

    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );

    if (result.rows.length === 0) {
      console.log(pc.yellow(`📦 Database "${targetDbName}" does not exist. Creating...`));
      await adminClient.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(pc.green(`✅ Database "${targetDbName}" created.`));
    } else {
      console.log(pc.green(`✅ Database "${targetDbName}" already exists.`));
    }

    await adminClient.end();
  } catch (error) {
    console.error(pc.red(`\n❌ Failed to ensure database exists: ${error.message}\n`));
    process.exit(1);
  }

  try {
    console.log(pc.cyan('\n▶ Running migrations'));
    execSync('node src/db/migrations/runMigrations.js', {
      stdio: 'inherit',
      cwd: process.cwd(),
      // The runner refuses an unnamed destination; this script knows which
      // database it just created.
      env: { ...process.env, DB_EXPECTED: targetDbName },
    });
    console.log(pc.green('✅ Migrations completed'));
  } catch (error) {
    console.error(pc.red('\n❌ Failed to run migrations\n'));
    process.exit(1);
  }
}

bootstrap();
// Run-time DB initialization (build or manual); the migration scripts in db/migrations are preferred.

import { pool } from '../config/configDB.js';
import { initializeDatabase } from './initDatabase.js';

import pc from 'picocolors';

async function run() {
  console.log(pc.cyan('🚀 Running database initialization...'));
  try {
    await initializeDatabase();
    console.log(pc.green('✅ Database initialized successfully.'));
  } catch (error) {
    console.error(pc.red('❌ Database initialization failed:'), error);
    process.exit(1);
  } finally {
    // Close pool to allow Node.js to exit
    await pool.end();
    console.log(pc.gray('Database pool closed.'));
  }
}

run();

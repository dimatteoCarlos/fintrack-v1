import pc from 'picocolors';

import { pool, checkConnection } from './db/config/configDB.js';
import { cleanRevokedTokens } from './utils/authUtils/authFn.js';

import app from './app.js';

import { initializeDatabase } from './db/run_time_db_init/initDatabase.js';
import { warmRecentRates } from './fintrack_api/services/fx_services/core/warmRecentRates.js';

const PORT = parseInt(process.env.PORT ?? '5000');

// Boot: verify the database, run runtime init, clear revoked tokens, then listen.
console.log(pc.yellowBright('Hola Mundo'));

async function startServer() {
  try {
    console.log(
      pc.yellowBright(
        'HELLO WORLD FROM INDEX.JS.startServer',
        'ESTO NO DEBERIA EJECUTARSE EN SERVERLESS',
      ),
    );
    await checkConnection();
    await initializeDatabase();
    await cleanRevokedTokens();

    // Deliberately not awaited: the store fills while the server already
    // answers, and a slow provider must not hold up a boot. It resolves on its
    // own and never rejects.
    warmRecentRates();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(pc.yellowBright(`Server running on port ${PORT}`));
    });
  } catch (error) {
    console.error(pc.red('Critical error during startup:', error));
    process.exit(1);
  }
}
// Vercel sets VERCEL=1 in its runtime, where the app is served serverless and must not listen.
if (!process.env.VERCEL) {
  startServer();
}

pool.on('error', (err) => {
  console.error(pc.redBright('Unexpected error on idle client', err));
});

// Graceful shutdown on Ctrl+C: close the pool before exiting.
process.on('SIGINT', () => {
  console.log(pc.cyan('Shutting down gracefully...'));
  pool.end(() => {
    console.log(pc.greenBright('Database pool closed.'));
    process.exit(0);
  });
});

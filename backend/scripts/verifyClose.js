// Exercises CLOSE (refusal, reversal, registry stamps, pocket release) in one rolled-back transaction.
// Run from backend/ (dotenv reads .env from cwd): node scripts/verifyClose.js [--account id] [--expect db]
// Refuses unless the server is loopback, unencrypted and named by --expect; needs migration 035 applied.

import { pool } from '../src/db/config/configDB.js';
import { processCloseAccount } from '../src/fintrack_api/services/delete_account/deleteAccountService.js';
import { derivedAccountBalanceSql } from '../src/utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { loadCurrencyCatalog } from '../src/fintrack_api/services/fx_services/currency_catalog/loadCurrencyCatalog.js';

const readOption = (flag, fallback) => {
 const index = process.argv.indexOf(flag);
 return index === -1 || index === process.argv.length - 1
  ? fallback
  : process.argv[index + 1];
};

const REQUESTED_ACCOUNT = readOption('--account', null);
const EXPECTED_DATABASE = readOption('--expect', 'fintrack_dev');
const REASON = 'verifyClose.js probe, rolled back';

const LOOPBACK = new Set(['127.0.0.1', '::1', '0.0.0.0']);

// The service's own lists, restated so a divergence fails an assertion instead of
// being a silent skip.
const ZERO_BALANCE_TYPES = ['bank', 'cash', 'investment', 'debtor'];
const EXTENSION_TABLES = {
 income_source: 'income_source_accounts',
 category_budget: 'category_budget_accounts',
 debtor: 'debtor_accounts',
 pocket_saving: 'pocket_saving_accounts',
};

const DERIVED = derivedAccountBalanceSql('ua', 'FLOAT');

const results = [];
const check = (label, passed, detail = '') => {
 results.push(passed);
 console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

// The row shape the engine expects, as deleteAccountService builds it: the account
// with its type name joined in.
const readAccount = (client, accountId) =>
 client.query(
  `SELECT ua.*, act.account_type_name
     FROM user_accounts ua
     JOIN account_types act ON act.account_type_id = ua.account_type_id
    WHERE ua.account_id = $1`,
  [accountId],
 );

// A refusal is a thrown error, possibly after the engine has issued statements, so
// each probe runs inside its own savepoint to keep the outer transaction from
// aborting and taking the real close down with it.
const expectRefusal = async (client, label, run) => {
 await client.query('SAVEPOINT probe');
 try {
  await run();
  await client.query('ROLLBACK TO SAVEPOINT probe');
  check(label, false, 'no refusal was raised');
  return null;
 } catch (error) {
  await client.query('ROLLBACK TO SAVEPOINT probe');
  check(label, true, error.message.slice(0, 90));
  return error;
 }
};

// Asks the server, before any transaction opens; host() because inet text carries a netmask ('::1/128').
// Deliberately not shared with assertExpectedDatabase (it allows DB_REMOTE_OK and accepts encrypted
// connections); this probe must never reach a remote database. Do not unify them.
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
  throw new Error(
   `refusing to run: ${refusals.join('; ')}. Nothing was written.`,
  );
 }

 console.log(
  `Database: ${db_name} at ${server_address}, unencrypted. Proceeding.`,
 );
};

const client = await pool.connect();
let rolledBack = false;

try {
 await assertLocalDatabase(client);

 await client.query('BEGIN');

 // The server loads the currency catalog at boot; a script must load it itself.
 // recordBalanceReversal resolves the accounting currency through
 // getCurrencyIdSync, which throws when the catalog was never loaded.
 await loadCurrencyCatalog(client);

 // A closable account is one of the six closing types, open on both columns and,
 // for the four that hold a balance, already at zero. Chosen by query so the
 // probe runs on any database; --account overrides it.
 const candidate = REQUESTED_ACCOUNT
  ? await readAccount(client, Number(REQUESTED_ACCOUNT))
  : await client.query(
     `SELECT ua.*, act.account_type_name
        FROM user_accounts ua
        JOIN account_types act ON act.account_type_id = ua.account_type_id
       WHERE ua.deleted_at IS NULL
         AND ua.closed_at IS NULL
         AND act.account_type_name = ANY($1)
         AND ${DERIVED} = 0
       ORDER BY ua.account_id
       LIMIT 1`,
     [ZERO_BALANCE_TYPES],
    );

 // Fabricated only when the data has none; owner, type and currency come from
 // existing rows, so every foreign key is satisfied by something real.
 let fabricated = false;
 let subject = candidate;

 if (candidate.rows.length === 0 && !REQUESTED_ACCOUNT) {
  const seed = await client.query(
   `SELECT ua.user_id, ua.currency_id
      FROM user_accounts ua
     WHERE ua.deleted_at IS NULL
     ORDER BY ua.account_id
     LIMIT 1`,
  );
  const bankType = await client.query(
   `SELECT account_type_id FROM account_types WHERE account_type_name = 'bank'`,
  );

  if (seed.rows.length === 0 || bankType.rows.length === 0) {
   console.log(
    'This database has no account to take an owner and a currency from, or no',
   );
   console.log('bank account type, so nothing can be fabricated either.');
   await client.query('ROLLBACK');
   rolledBack = true;
   process.exitCode = 0;
  } else {
   const created = await client.query(
    `INSERT INTO user_accounts(
       user_id,
       account_name,
       account_type_id,
       currency_id,
       account_starting_amount,
       account_balance,
       account_start_date,
       updated_at
     ) VALUES ($1, $2, $3, $4, 0, 0, CURRENT_DATE, NOW())
     RETURNING account_id`,
    [
     seed.rows[0].user_id,
     'verifyClose.js probe account',
     bankType.rows[0].account_type_id,
     seed.rows[0].currency_id,
    ],
   );
   subject = await readAccount(client, created.rows[0].account_id);
   fabricated = true;
   console.log(
    'No account of a closing type sits at zero here, so one was fabricated',
   );
   console.log(
    'inside the transaction. It has no transactions and no pocket allocations,',
   );
   console.log('so those two assertions prove less than they would on real data.');
  }
 }

 if (subject.rows.length === 0) {
  console.log('No account to close. Nothing was written.');
  await client.query('ROLLBACK');
  rolledBack = true;
  process.exitCode = 0;
 } else {
  const target = subject.rows[0];
  const accountId = target.account_id;
  const userId = target.user_id;
  const typeName = String(target.account_type_name ?? '');

  console.log(
   `\nTarget: account ${accountId}, type ${typeName}, owner ${userId}\n`,
  );

  // Both refusals are raised before anything is written and are the operation's
  // documented behaviour.
  await expectRefusal(client, 'an empty reason is refused', () =>
   processCloseAccount(client, userId, accountId, subject, new Date(), ''),
  );

  await expectRefusal(
   client,
   'a whitespace-only reason is refused',
   () =>
    processCloseAccount(client, userId, accountId, subject, new Date(), '   '),
  );

  // The zero-balance refusal is probed on another account of the same four types
  // that is NOT at zero; skipped, not failed, where none exists, since that is a
  // fact about the data.
  const nonZero = await client.query(
   `SELECT ua.*, act.account_type_name
      FROM user_accounts ua
      JOIN account_types act ON act.account_type_id = ua.account_type_id
     WHERE ua.deleted_at IS NULL
       AND ua.closed_at IS NULL
       AND act.account_type_name = ANY($1)
       AND ${DERIVED} <> 0
     ORDER BY ua.account_id
     LIMIT 1`,
   [ZERO_BALANCE_TYPES],
  );

  if (nonZero.rows.length === 0) {
   console.log('SKIP  no nonzero account of a closing type to refuse');
  } else {
   await expectRefusal(client, 'a nonzero balance is refused', () =>
    processCloseAccount(
     client,
     nonZero.rows[0].user_id,
     nonZero.rows[0].account_id,
     nonZero,
     new Date(),
     REASON,
    ),
   );
  }

  // Runs on its own funded account because the refusal probe above skips when none exists, and a skip
  // reads as a pass. Own savepoint: it really closes an account and the main close still has to run.
  await client.query('SAVEPOINT reversal');
  try {
   const funded = await client.query(
    `INSERT INTO user_accounts(
       user_id, account_name, account_type_id, currency_id,
       account_starting_amount, account_balance, account_start_date, updated_at
     )
     SELECT $1, 'verifyClose.js reversal probe',
            (SELECT account_type_id FROM account_types
              WHERE account_type_name = 'bank'),
            $2, 0, 0, CURRENT_DATE, NOW()
     RETURNING account_id`,
    [userId, target.currency_id],
   );
   const fundedId = funded.rows[0].account_id;

   // One movement, so the account derives a real balance. 137.50 rather than a
   // round number: a figure that needs two decimals catches an amount rounded in
   // transit.
   await client.query(
    `INSERT INTO transactions(
       user_id, description, amount, movement_type_id, transaction_type_id,
       currency_id, account_id, status
     )
     SELECT $1, 'verifyClose.js reversal probe funding', 137.50,
            (SELECT movement_type_id FROM movement_types
              WHERE movement_type_name = 'income'),
            (SELECT MIN(transaction_type_id) FROM transaction_types),
            $2, $3, 'complete'`,
    [userId, target.currency_id, fundedId],
   );

   const fundedSubject = await readAccount(client, fundedId);
   const { rows: derivedRows } = await client.query(
    `SELECT ${DERIVED} AS balance
       FROM user_accounts ua WHERE ua.account_id = $1`,
    [fundedId],
   );
   const fundedBalance = Number(derivedRows[0].balance);

   check(
    'the probe account really holds a balance',
    fundedBalance === 137.5,
    `derived ${fundedBalance}`,
   );

   // A route passes the id as a string; a string key once missed the balance map, became NaN and passed
   // every `!== 0` test ("balance is already zero"). Rolled back so the account survives the probes below.
   await client.query('SAVEPOINT string_id');
   try {
    await processCloseAccount(
     client,
     userId,
     String(fundedId),
     fundedSubject,
     new Date(),
     REASON,
     true,
    );

    const { rows: stringLegs } = await client.query(
     `SELECT 1 FROM transactions WHERE reversal_of_account_id = $1`,
     [fundedId],
    );
    check(
     'the close accepts the id as the string a route hands over',
     stringLegs.length === 2,
     `${stringLegs.length} reversal leg(s)`,
    );
   } finally {
    await client.query('ROLLBACK TO SAVEPOINT string_id');
   }

   // The same account must refuse without the flag, so the flag is the only
   // difference between the refusal and the reversal.
   await expectRefusal(
    client,
    'the same account is refused without the reversal',
    () =>
     processCloseAccount(
      client,
      userId,
      fundedId,
      fundedSubject,
      new Date(),
      REASON,
     ),
   );

   await processCloseAccount(
    client,
    userId,
    fundedId,
    fundedSubject,
    new Date(),
    REASON,
    true,
   );

   const { rows: legs } = await client.query(
    `SELECT account_id, amount::float AS amount, movement_type_id
       FROM transactions
      WHERE reversal_of_account_id = $1
      ORDER BY account_id = $1 DESC`,
    [fundedId],
   );

   check(
    'the reversal writes exactly two legs',
    legs.length === 2,
    `${legs.length} row(s)`,
   );

   check(
    'both legs carry the reversal movement type',
    legs.length === 2 && legs.every((leg) => leg.movement_type_id === 11),
    legs.map((leg) => leg.movement_type_id).join(', '),
   );

   check(
    "the target's leg negates its balance",
    legs.length === 2 && legs[0].account_id === fundedId &&
     legs[0].amount === -fundedBalance,
    legs.length === 2 ? `${legs[0].amount} against ${fundedBalance}` : '',
   );

   check(
    'the two legs sum to zero',
    legs.length === 2 && legs[0].amount + legs[1].amount === 0,
    legs.map((leg) => leg.amount).join(' + '),
   );

   // The counterpart is the compensation account, identified by its type rather
   // than by its name: a user account named 'slack' would match a name test.
   if (legs.length === 2) {
    const { rows: counterpart } = await client.query(
     `SELECT act.account_type_name
        FROM user_accounts ua
        JOIN account_types act ON act.account_type_id = ua.account_type_id
       WHERE ua.account_id = $1`,
     [legs[1].account_id],
    );
    check(
     'the counterpart leg sits on a boundary account',
     counterpart.length === 1 &&
      String(counterpart[0].account_type_name).toLowerCase() === 'boundary',
     counterpart.length === 1 ? counterpart[0].account_type_name : 'no row',
    );
   }

   // The stamp on the surviving row proves the reversal and the closure ran in one
   // transaction. Both columns are tested: a test on one alone would pass against
   // a soft-deleted account that was never closed.
   const marked = await client.query(
    'SELECT closed_at, deleted_at FROM user_accounts WHERE account_id = $1',
    [fundedId],
   );
   check(
    'the reversed account is closed in the same transaction',
    marked.rows.length === 1 &&
     marked.rows[0].closed_at !== null &&
     marked.rows[0].deleted_at !== null,
    marked.rows.length === 1
     ? `closed_at ${marked.rows[0].closed_at}, deleted_at ${marked.rows[0].deleted_at}`
     : `${marked.rows.length} row(s)`,
   );

   // The pairing is a CHECK, not a convention: a reversal-type row without the
   // column must be rejected by the database, not by the writer of the insert.
   await expectRefusal(
    client,
    'a reversal row without its account is refused by the database',
    () =>
     client.query(
      `INSERT INTO transactions(
         user_id, description, amount, movement_type_id, transaction_type_id,
         currency_id, account_id, status
       )
       SELECT $1, 'verifyClose.js constraint probe', 1.00, 11,
              (SELECT MIN(transaction_type_id) FROM transaction_types),
              $2, $3, 'complete'`,
      [userId, target.currency_id, accountId],
     ),
   );
  } finally {
   await client.query('ROLLBACK TO SAVEPOINT reversal');
  }

  const extensionTable = EXTENSION_TABLES[typeName] ?? null;

  const countIn = async (table, column) => {
   const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = $1`,
    [accountId],
   );
   return rows[0].n;
  };

  const transactionsBefore = await countIn('transactions', 'account_id');
  const extensionBefore = extensionTable
   ? await countIn(extensionTable, 'account_id')
   : 0;

  const { rows: pocketsBefore } = await client.query(
   `SELECT COALESCE(SUM(amount), 0)::text AS held
      FROM pocket_allocations
     WHERE user_id = $1 AND source_account_id = $2`,
   [userId, accountId],
  );

  const result = await processCloseAccount(
   client,
   userId,
   accountId,
   subject,
   new Date(),
   REASON,
  );

  // The row survives, stamped: closed_at, not existence, says an account is
  // closed. deleted_at is asserted beside it because the close still writes both;
  // if that stops, this line fails.
  const accountAfter = await client.query(
   'SELECT closed_at, deleted_at FROM user_accounts WHERE account_id = $1',
   [accountId],
  );
  check(
   'the user_accounts row survives, stamped on both columns',
   accountAfter.rows.length === 1 &&
    accountAfter.rows[0].closed_at !== null &&
    accountAfter.rows[0].deleted_at !== null,
   accountAfter.rows.length === 1
    ? `closed_at ${accountAfter.rows[0].closed_at}, deleted_at ${accountAfter.rows[0].deleted_at}`
    : `${accountAfter.rows.length} row(s)`,
  );

  if (extensionTable) {
   // The extension row is kept: for three of the four types its columns exist
   // nowhere else (the debtor's name and amount owed, the pocket's target and
   // desired date).
   const extensionAfter = await countIn(extensionTable, 'account_id');
   check(
    `the ${extensionTable} row survives the close`,
    extensionAfter === extensionBefore,
    `${extensionBefore} -> ${extensionAfter}`,
   );
  }

  // Always zero: the field is still published because the frontend type declares
  // it required, and goes when that type does.
  check(
   'the response reports no extension row deleted',
   result.extensionRowsDeleted === 0,
   `reported ${result.extensionRowsDeleted}`,
  );

  const registry = await client.query(
   `SELECT account_id, user_id, account_name, closed_at, closed_by, close_reason
      FROM account_registry
     WHERE account_id = $1`,
   [accountId],
  );
  check(
   'the registry keeps exactly one row for the account',
   registry.rows.length === 1,
   `${registry.rows.length} row(s)`,
  );
  if (registry.rows.length === 1) {
   const stamp = registry.rows[0];
   check('the registry row carries a closure timestamp', stamp.closed_at !== null);
   check(
    'the registry row records who closed it',
    stamp.closed_by === userId,
    `${stamp.closed_by}`,
   );
   check(
    'the registry row records the reason, trimmed',
    stamp.close_reason === REASON,
    `${stamp.close_reason}`,
   );
   check(
    'the registry row carries the name the account had',
    stamp.account_name === target.account_name,
    `${stamp.account_name} vs ${target.account_name}`,
   );
  }

  const { rows: pocketsAfter } = await client.query(
   `SELECT COALESCE(SUM(amount), 0)::text AS held
      FROM pocket_allocations
     WHERE user_id = $1 AND source_account_id = $2`,
   [userId, accountId],
  );
  check(
   'nothing is left committed to pockets from this account',
   Number(pocketsAfter[0].held) === 0,
   `${pocketsBefore[0].held} -> ${pocketsAfter[0].held}`,
  );
  check(
   'the response names every pocket it released',
   Array.isArray(result.releasedPockets),
   `${JSON.stringify(result.releasedPockets)}`,
  );

  const transactionsAfter = await countIn('transactions', 'account_id');
  check(
   'the transactions naming the account survive it',
   transactionsAfter === transactionsBefore,
   `${transactionsBefore} -> ${transactionsAfter}`,
  );

  check(
   'the response echoes the reason it stored',
   result.closeReason === REASON,
   `${result.closeReason}`,
  );

  await client.query('ROLLBACK');
  rolledBack = true;

  // A real account must come back open on both columns; a fabricated one was
  // created in the same transaction and must be gone, along with the registry row
  // its trigger wrote.
  const restored = await client.query(
   'SELECT deleted_at, closed_at FROM user_accounts WHERE account_id = $1',
   [accountId],
  );
  const registryAfterRollback = await client.query(
   'SELECT 1 FROM account_registry WHERE account_id = $1',
   [accountId],
  );

  if (fabricated) {
   check(
    'the fabricated account left nothing behind in user_accounts',
    restored.rows.length === 0,
    `${restored.rows.length} row(s)`,
   );
   check(
    'the fabricated account left nothing behind in account_registry',
    registryAfterRollback.rows.length === 0,
    `${registryAfterRollback.rows.length} row(s)`,
   );
  } else {
   check(
    'the account this probe closed is back, open on both columns',
    restored.rows.length === 1 &&
     restored.rows[0].deleted_at === null &&
     restored.rows[0].closed_at === null,
    `${restored.rows.length} row(s)`,
   );
  }

  const allPassed = results.every(Boolean);
  console.log('');
  console.log(
   allPassed
    ? 'CLOSE refuses what it must, releases, stamps, marks the row, and leaves nothing behind'
    : 'AT LEAST ONE ASSERTION FAILED',
  );
  process.exitCode = allPassed ? 0 : 1;
 }
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
   console.error('ROLLBACK FAILED - check user_accounts and account_registry');
  }
 }
 client.release();
 await pool.end();
}

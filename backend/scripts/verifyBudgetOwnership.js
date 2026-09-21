// Guards the Budget ownership map from getAccountsByType: a closed category must stay in it (else 403
// on month status, series and CSV export) and the default set must follow the span asked. Read-only.
// Usage: node scripts/verifyBudgetOwnership.js [--expect fintrack_dev]; refuses a non-local database.

import { pool } from '../src/db/config/configDB.js';
import { getAccountsByType } from '../src/utils/fintrackUtils/accountDataRetrieval/accountUtils.js';

const readOption = (flag, fallback) => {
 const index = process.argv.indexOf(flag);
 return index === -1 || index === process.argv.length - 1
  ? fallback
  : process.argv[index + 1];
};

const EXPECTED_DATABASE = readOption('--expect', 'fintrack_dev');
const TIME_ZONE = readOption('--zone', 'America/Bogota');

const LOOPBACK = new Set(['127.0.0.1', '::1', '0.0.0.0']);

const results = [];
const check = (label, passed, detail = '') => {
 results.push(passed);
 console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const note = (label, detail = '') => {
 console.log(`----  ${label}${detail ? `  (${detail})` : ''}`);
};

const assertLocalDatabase = async () => {
 const { rows } = await pool.query(
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
  console.error('REFUSED. This probe only runs against a local test database.');
  refusals.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
 }

 console.log(`Connected to ${db_name} at ${server_address}, unencrypted.`);
};

// Restates the controller's narrowing so a divergence fails an assertion instead
// of agreeing silently.
const idsOverlapping = (accounts, from, to) =>
 accounts
  .filter(
   (account) =>
    account.startMonth <= to &&
    (account.closedMonth === null || account.closedMonth >= from),
  )
  .map((account) => account.accountId);

// Adds a month to a 'YYYY-MM-01' string without a Date: the published strings are
// already cut on the owner's calendar and a Date would apply this machine's zone.
const nextMonth = (month) => {
 const [year, monthNumber] = month.split('-').map(Number);
 return monthNumber === 12
  ? `${year + 1}-01-01`
  : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
};

const run = async () => {
 await assertLocalDatabase();

 const { rows: owners } = await pool.query(
  `SELECT DISTINCT ua.user_id FROM user_accounts ua ORDER BY ua.user_id`,
 );

 for (const { user_id: userId } of owners) {
  const accounts = await getAccountsByType(userId, 'category_budget', TIME_ZONE);
  const closed = accounts.filter((account) => account.closedMonth !== null);

  console.log(
   `\nowner ${userId}: ${accounts.length} categor(ies) ever owned, ${closed.length} closed`,
  );

  if (accounts.length === 0) {
   note('no categories at all, nothing to assert');
   continue;
  }

  check(
   'every account publishes the month it opened',
   accounts.every((account) => /^\d{4}-\d{2}-01$/.test(account.startMonth)),
   accounts
    .slice(0, 3)
    .map((a) => `${a.accountName}: ${a.startMonth}`)
    .join('; '),
  );

  // Fabricates a closed subject when the owner has none (a skipped probe looks like a pass); closed_at
  // is stamped directly since the reader is under test, then rolled back.
  let fabricated = null;
  if (closed.length === 0 && accounts.length > 0) {
   const client = await pool.connect();
   try {
    await client.query('BEGIN');
    const subject = accounts[0];
    await client.query(
     `UPDATE user_accounts
         SET closed_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP
       WHERE account_id = $1`,
     [subject.accountId],
    );
    const afterStamp = await getAccountsByType(
     userId,
     'category_budget',
     TIME_ZONE,
     client,
    );
    fabricated = afterStamp.find((a) => a.accountId === subject.accountId) ?? null;

    check(
     `${subject.accountName} (#${subject.accountId}), closed inside a rolled-back transaction: still in the ownership map`,
     fabricated !== null,
     `${afterStamp.length} of ${accounts.length} categories still returned`,
    );

    check(
     'no other category was lost by the stamp',
     afterStamp.length === accounts.length,
     `${afterStamp.length} vs ${accounts.length}`,
    );

    if (fabricated !== null) {
     const after = nextMonth(fabricated.closedMonth);
     check(
      'the stamped category is in the default set for its closing month',
      idsOverlapping(afterStamp, fabricated.closedMonth, fabricated.closedMonth).includes(
       fabricated.accountId,
      ),
      fabricated.closedMonth,
     );
     check(
      'the stamped category is NOT in the default set for the month after',
      !idsOverlapping(afterStamp, after, after).includes(fabricated.accountId),
      after,
     );
    }
   } finally {
    await client.query('ROLLBACK');
    client.release();
   }

   const afterRollback = await getAccountsByType(userId, 'category_budget', TIME_ZONE);
   check(
    'the rollback left no closed category behind',
    afterRollback.every((account) => account.closedMonth === null),
    `${afterRollback.length} categories, all open`,
   );
  }

  for (const account of closed) {
   const label = `${account.accountName} (#${account.accountId})`;
   const after = nextMonth(account.closedMonth);

   check(
    `${label}: is in the ownership map though it is closed`,
    accounts.some((candidate) => candidate.accountId === account.accountId),
    `open ${account.startMonth}, closed ${account.closedMonth}`,
   );

   check(
    `${label}: is in the default set for its closing month`,
    idsOverlapping(accounts, account.closedMonth, account.closedMonth).includes(
     account.accountId,
    ),
    account.closedMonth,
   );

   check(
    `${label}: is NOT in the default set for the month after`,
    !idsOverlapping(accounts, after, after).includes(account.accountId),
    after,
   );

   check(
    `${label}: a range merely touching its window admits it`,
    idsOverlapping(accounts, account.closedMonth, `${Number(after.slice(0, 4)) + 5}-12-01`)
     .includes(account.accountId),
    `from its closing month forward`,
   );
  }

  // The floor, which needs no closed account: an account is out of the set for
  // every month before the one it opened in.
  const youngest = accounts.reduce(
   (latest, account) => (account.startMonth > latest.startMonth ? account : latest),
   accounts[0],
  );
  const beforeItExisted = `${Number(youngest.startMonth.slice(0, 4)) - 5}-01-01`;

  check(
   `${youngest.accountName} (#${youngest.accountId}): out of the set for a month before it opened`,
   !idsOverlapping(accounts, beforeItExisted, beforeItExisted).includes(
    youngest.accountId,
   ),
   `opened ${youngest.startMonth}, asked ${beforeItExisted}`,
  );
 }

 const failures = results.filter((passed) => !passed).length;
 console.log(`\n${results.length - failures} passed, ${failures} failed.`);
 return failures;
};

run()
 .then(async (failures) => {
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
 })
 .catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
 });

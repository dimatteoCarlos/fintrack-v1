// Checks on a real database that the Investment card's closure term claims a DISCARD settlement.
// Run from backend/ so dotenv finds .env: node scripts/verifyClosureSettlement.js [--residual N] [--zone Z]
// Writes then rolls back; the term must move by the negation of the residual (zero = boundary leak).

import { pool } from '../src/db/config/configDB.js';
import { getInvestmentFigures } from '../src/fintrack_api/services/overview_services/db/overviewInvestmentRepository.js';
import { recordClosureSettlement } from '../src/utils/fintrackUtils/accountDeletionUtils/recordClosureSettlement.js';
import { checkAndInsertAccount } from '../src/utils/fintrackUtils/accountManagement/checkAndInsertAccount.js';
import { getCurrencyCode } from '../src/utils/currencyLookup.js';
import {
 loadCurrencyCatalog,
 getCurrencyIdSync,
} from '../src/fintrack_api/services/fx_services/currency_catalog/loadCurrencyCatalog.js';
import { ACCOUNTING_CURRENCY_CODE } from '../src/fintrack_api/config/fintrackConfig.js';
import {
 ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID,
 ACCOUNT_CLOSURE_TRANSACTION_TYPE_ID,
} from '../src/utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';

const readOption = (flag, fallback) => {
 const index = process.argv.indexOf(flag);
 return index === -1 || index === process.argv.length - 1
  ? fallback
  : process.argv[index + 1];
};

const RESIDUAL = Number(readOption('--residual', 1234.56));
const TIME_ZONE = readOption('--zone', 'America/Caracas');

// getInvestmentFigures needs a reference month: omitted, it reaches the query as NULL and the
// card comes back all zeros instead of raising, which this probe would report as "zero on this
// database" about a card that was never read. Derived in the zone the query converts with.
const referenceMonthIn = (timeZone) => {
 const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
 }).formatToParts(new Date());
 const year = parts.find((part) => part.type === 'year').value;
 const month = parts.find((part) => part.type === 'month').value;
 return `${year}-${month}-01`;
};

const REFERENCE_MONTH = referenceMonthIn(TIME_ZONE);

if (!Number.isFinite(RESIDUAL) || RESIDUAL === 0) {
 console.error('--residual must be a nonzero number');
 process.exit(1);
}

// The target leg is the exact negation of the residual: a positive balance is
// discarded, a negative one is forgiven.
const EXPECTED_TARGET_LEG = -RESIDUAL;

const near = (a, b) => Math.abs(a - b) < 0.005;
const money = (n) => Number(n.toFixed(2));

const client = await pool.connect();
let rolledBack = false;

try {
 // The writer's FX target lookup (getCurrencyIdSync) THROWS until the catalog is loaded; the
 // server loads it at boot, a script must do it itself.
 await loadCurrencyCatalog(client);
 const accountingCurrencyId = getCurrencyIdSync(ACCOUNTING_CURRENCY_CODE);
 console.log(
  `accounting currency: ${ACCOUNTING_CURRENCY_CODE} = id ${accountingCurrencyId}`,
 );

 const accounts = await client.query(`
   SELECT ua.account_id, ua.user_id, ua.currency_id, ua.account_name
   FROM user_accounts ua
   JOIN account_types at2 ON at2.account_type_id = ua.account_type_id
   WHERE at2.account_type_name = 'investment'
   ORDER BY ua.account_id
 `);
 if (accounts.rows.length === 0) {
  throw new Error('no investment accounts on this database');
 }
 const accountIds = accounts.rows.map((r) => r.account_id);
 const target = accounts.rows[0];
 console.log(`investment accounts: ${accountIds.join(', ')}`);
 console.log(
  `settlement will close account ${target.account_id} ("${target.account_name}") with a residual of ${RESIDUAL}`,
 );

 const types = await client.query(`
   SELECT
     (SELECT movement_type_id FROM movement_types
       WHERE movement_type_name = 'account-closure') AS movement_id,
     (SELECT transaction_type_id FROM transaction_types
       WHERE transaction_type_name = 'account-closure') AS transaction_id
 `);
 const { movement_id, transaction_id } = types.rows[0];
 if (movement_id === null || transaction_id === null) {
  throw new Error(
   'the account-closure catalog rows are absent from this database - migration 032 has not been applied',
  );
 }
 console.log(
  `the account-closure movement type is id ${movement_id}, its transaction type id ${transaction_id}`,
 );

 // Refused before the write: a settlement stamped with an id the catalog assigned to
 // something else is MISFILED, not wrong-valued, so every figure still adds up with nothing
 // to flag it.
 if (
  movement_id !== ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID ||
  transaction_id !== ACCOUNT_CLOSURE_TRANSACTION_TYPE_ID
 ) {
  throw new Error(
   `the catalog and the writer disagree: catalog says ${movement_id}/${transaction_id}, ` +
    `the constants say ${ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID}/${ACCOUNT_CLOSURE_TRANSACTION_TYPE_ID}`,
  );
 }

 await client.query('BEGIN');

 const before = await client.query(
  `SELECT COUNT(*) AS n FROM transactions WHERE movement_type_id = $1`,
  [movement_id],
 );
 console.log(`closure rows before the write: ${before.rows[0].n}`);

 const baseline = await getInvestmentFigures(
  client,
  accountIds,
  TIME_ZONE,
  REFERENCE_MONTH,
 );
 console.log(
  `baseline closure term: ${baseline.closureAdjustment}` +
   (near(baseline.closureAdjustment, 0)
    ? ' (zero on this database)'
    : ' - not zero; deletion history the term is defined to hold, not noise'),
 );

 // The boundary account, resolved as the deletion service resolves it; created here if the
 // user has none (rolled back either way).
 const boundaryInfo = await checkAndInsertAccount(client, target.user_id);
 const boundaryAccountId = boundaryInfo.account.account_id;
 console.log(
  `boundary account ${boundaryAccountId} (${boundaryInfo.exists ? 'existing' : 'created in this transaction'}), ` +
   `${accountIds.includes(boundaryAccountId) ? 'INSIDE' : 'outside'} the investment set`,
 );

 const currencyCode = await getCurrencyCode(client, target.currency_id);

 const written = await recordClosureSettlement(client, {
  userId: target.user_id,
  targetAccountId: target.account_id,
  targetAccountName: target.account_name,
  // The counterpart, whichever policy chose it; under the DISCARD exercised here, the boundary account.
  counterpartAccountId: boundaryAccountId,
  residual: RESIDUAL,
  currencyId: target.currency_id,
  currencyCode,
  transactionDate: new Date(),
 });

 const after = await getInvestmentFigures(
  client,
  accountIds,
  TIME_ZONE,
  REFERENCE_MONTH,
 );

 // Exhaustiveness control: the rows the card partitions, summed without a predicate; the two
 // terms must account for all of it.
 const control = await client.query(
  `SELECT COALESCE(SUM(t.amount), 0)::float AS admitted
     FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND t.movement_type_id IN ($2, 9)`,
  [accountIds, movement_id],
 );
 const admitted = money(control.rows[0].admitted);

 // The predicate from before the closure term: two sums over profit-and-loss rows alone, split
 // by the annulment prefix. Kept so a revert of either half fails here instead of passing quietly.
 const old = await client.query(
  `SELECT
     COALESCE(SUM(t.amount) FILTER (
       WHERE t.description IS NULL OR t.description NOT LIKE 'ANNULMENT%'), 0)::float AS realised_old,
     COALESCE(SUM(t.amount) FILTER (
       WHERE t.description LIKE 'ANNULMENT%'), 0)::float AS closure_old
     FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND t.movement_type_id = 9`,
  [accountIds],
 );

 // Both legs as they were actually persisted, FX columns included.
 const legs = await client.query(
  `SELECT transaction_id, account_id, amount::float, movement_type_id,
          transaction_type_id, currency_id, original_amount::float,
          original_currency_id, exchange_rate::float, exchange_rate_source,
          exchange_rate_target_currency_id, description
     FROM transactions
    WHERE transaction_id = ANY($1::int[])
    ORDER BY account_id`,
  [written.map((r) => r.transaction_id)],
 );

 const results = [];
 const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
 };

 console.log('');
 console.log('with one real settlement pair present, uncommitted:');

 check(
  'the realised term does not move',
  near(after.realizedPnl, baseline.realizedPnl),
  `${baseline.realizedPnl} -> ${after.realizedPnl}`,
 );
 check(
  'the closure term moves by the negation of the residual',
  near(after.closureAdjustment, baseline.closureAdjustment + EXPECTED_TARGET_LEG),
  `${baseline.closureAdjustment} -> ${after.closureAdjustment}, expected move ${EXPECTED_TARGET_LEG}`,
 );
 check(
  'the counterpart leg is not counted: a move of zero would mean it leaked in',
  !near(after.closureAdjustment, baseline.closureAdjustment),
  `moved by ${money(after.closureAdjustment - baseline.closureAdjustment)}`,
 );
 check(
  'the balance moves by the same amount, so the money is real',
  near(after.ledgerBalance, baseline.ledgerBalance + EXPECTED_TARGET_LEG),
  `${baseline.ledgerBalance} -> ${after.ledgerBalance}`,
 );
 check(
  'the identity closes',
  near(
   after.capitalContributed + after.realizedPnl + after.closureAdjustment,
   after.ledgerBalance,
  ),
  `${money(after.capitalContributed + after.realizedPnl + after.closureAdjustment)} vs ${after.ledgerBalance}`,
 );
 check(
  'the partition is exhaustive with the settlement in it',
  near(after.realizedPnl + after.closureAdjustment, admitted),
  `${money(after.realizedPnl + after.closureAdjustment)} vs unfiltered ${admitted}`,
 );

 const oldIdentity =
  after.capitalContributed + old.rows[0].realised_old + old.rows[0].closure_old;
 check(
  'under the pre-change predicate the identity would break by the settlement',
  near(oldIdentity - after.ledgerBalance, -EXPECTED_TARGET_LEG),
  `off by ${money(oldIdentity - after.ledgerBalance)}, target leg was ${EXPECTED_TARGET_LEG}`,
 );

 console.log('');
 console.log('the pair the writer actually persisted:');

 check(
  'the writer emitted exactly two legs',
  legs.rows.length === 2,
  `${legs.rows.length} rows`,
 );
 check(
  'the pair is double entry: the two amounts sum to zero',
  near(
   legs.rows.reduce((sum, r) => sum + r.amount, 0),
   0,
  ),
  legs.rows.map((r) => `acct ${r.account_id}: ${r.amount}`).join(', '),
 );
 check(
  'both legs carry the closure movement type',
  legs.rows.every((r) => r.movement_type_id === movement_id),
  legs.rows.map((r) => r.movement_type_id).join(', '),
 );
 check(
  'both legs carry the closure transaction type, not deposit or withdraw',
  legs.rows.every((r) => r.transaction_type_id === transaction_id),
  legs.rows.map((r) => r.transaction_type_id).join(', '),
 );
 check(
  'exactly one leg is inside the investment set',
  legs.rows.filter((r) => accountIds.includes(r.account_id)).length === 1,
  legs.rows
   .map((r) => `${r.account_id}${accountIds.includes(r.account_id) ? ' in' : ' out'}`)
   .join(', '),
 );
 check(
  'neither leg carries the annulment prefix',
  legs.rows.every(
   (r) => !String(r.description).startsWith('RTA Annulment Target('),
  ),
  'a closure is a retirement, not a correction',
 );

 // FX provenance: four of the six columns default to a value that happens to be correct for
 // an internal movement, so a row left to the defaults looks well formed. All six are asserted,
 // including those four.
 check(
  'no leg fell into the original-amount default of 0',
  legs.rows.every((r) => near(r.original_amount, r.amount)),
  legs.rows.map((r) => `${r.original_amount} vs ${r.amount}`).join(', '),
 );
 check(
  'no leg fell into the original-currency default of 1 by accident',
  legs.rows.every((r) => r.original_currency_id === r.currency_id),
  legs.rows.map((r) => `${r.original_currency_id} vs ${r.currency_id}`).join(', '),
 );
 check(
  'the rate and source are stated, not inherited',
  legs.rows.every(
   (r) => near(r.exchange_rate, 1.0) && r.exchange_rate_source === 'identity',
  ),
  legs.rows.map((r) => `${r.exchange_rate} ${r.exchange_rate_source}`).join(', '),
 );
 check(
  'the FX target is the configured accounting currency, not the column default',
  legs.rows.every(
   (r) => r.exchange_rate_target_currency_id === accountingCurrencyId,
  ),
  `${legs.rows.map((r) => r.exchange_rate_target_currency_id).join(', ')} vs ${accountingCurrencyId}`,
 );
 // Both legs take currency_id from the CLOSING account and neither reads the compensation
 // account's own. Identical when both sit in the accounting currency; asserted so a database
 // where they differ shows the disagreement.
 check(
  'both legs carry the closing account currency, by design',
  legs.rows.every((r) => r.currency_id === target.currency_id),
  `${legs.rows.map((r) => r.currency_id).join(', ')} vs closing account ${target.currency_id}`,
 );

 await client.query('ROLLBACK');
 rolledBack = true;

 const post = await client.query(
  `SELECT COUNT(*) AS n FROM transactions WHERE movement_type_id = $1`,
  [movement_id],
 );
 console.log('');
 console.log(`closure rows after the rollback: ${post.rows[0].n}`);

 const clean = post.rows[0].n === before.rows[0].n;
 console.log(
  clean
   ? 'nothing persisted: the row set is exactly what it was'
   : 'A ROW PERSISTED - investigate before doing anything else',
 );

 const allPassed = results.every(Boolean) && clean;
 console.log('');
 console.log(
  allPassed
   ? 'the writer emits a pair the closure term claims correctly, one leg only'
   : 'AT LEAST ONE ASSERTION FAILED',
 );
 process.exitCode = allPassed ? 0 : 1;
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
   console.error('ROLLBACK FAILED - check the table for a stray closure row');
  }
 }
 client.release();
 await pool.end();
}

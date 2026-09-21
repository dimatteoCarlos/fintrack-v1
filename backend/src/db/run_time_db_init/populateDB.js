// backend/src/db/run_time_migrations/populateDB.js
//This is a run time db seed
import {
  createError,
  handlePostgresError,
} from '../../utils/errorHandling.js';
import { pool } from '../config/configDB.js';
import pc from 'picocolors';

//========================================
//check table name validation
function isValidTableName(tableName) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName); // only allowed table names from create table array | Solo permite nombres de tablas válidos
}
//check if table exists
export async function tableExists(client = pool, tableName) {
  if (!isValidTableName(tableName)) {
    throw new Error('Invalid table name');
  }
  const queryText = `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = $1
    );
  `;
  const result = await client.query(queryText, [tableName]);
  console.log(pc.magentaBright(tableName), ' exists? ', result.rows[0].exists);
  return result.rows[0].exists; // Returns true or false
}

//check if table is populated
async function isTablePopulated(client = pool, tableName, minCount = 1) {
  if (!isValidTableName(tableName)) {
    throw new Error('Invalid table name');
  }
  const queryText = `SELECT COUNT(*) FROM ${tableName}`;
  const result = await client.query(queryText);
  // return result.rows[0].count >= minCount;
  return parseInt(result.rows[0].count, 10) >= minCount;
}
// Catalogs seeded with explicit IDs, which do not advance a SERIAL sequence: the first insert without an
// ID fails on a duplicate key. Not every column is a SERIAL; the realign skips a plain INT (NULL sequence),
// so this stays a list of catalogs, not of DDL details.
const SEEDED_CATALOGS = [
  ['account_types', 'account_type_id'],
  ['currencies', 'currency_id'],
  ['category_nature_types', 'category_nature_type_id'],
  ['user_roles', 'user_role_id'],
  ['transaction_types', 'transaction_type_id'],
  ['movement_types', 'movement_type_id'],
  ['budget_frequency_types', 'budget_frequency_type_id'],
];

/**
 * Realign one catalog's identity sequence with the rows the table holds.
 * Identifiers cannot be parameterized, hence the validation; the lookup is separate because
 * MAX(col) FROM tbl fails to parse when the table is absent.
 */
const resyncSequence = async (client, tableName, columnName) => {
  if (!isValidTableName(tableName) || !isValidTableName(columnName)) {
    throw new Error('Invalid identifier');
  }

  const { rows } = await client.query(
    `SELECT pg_get_serial_sequence($1, $2) AS seq WHERE to_regclass($1) IS NOT NULL`,
    [tableName, columnName],
  );

  if (rows.length === 0 || !rows[0].seq) {
    return false;
  }

  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(${columnName}) FROM ${tableName}), 1))`,
    [rows[0].seq],
  );

  return true;
};

/**
 * Realign every seeded catalog sequence; runs on every boot because the seeders are skipped once
 * app_initialization says the tables exist, which is exactly the database whose sequences are stale.
 *
 * @param {object} client - Database client (pool or transaction)
 */
export async function resyncCatalogSequences(client = pool) {
  let realigned = 0;

  for (const [tableName, columnName] of SEEDED_CATALOGS) {
    if (await resyncSequence(client, tableName, columnName)) {
      realigned += 1;
    }
  }

  console.log(
    pc.green(`Catalog sequences realigned (${realigned}/${SEEDED_CATALOGS.length}).`),
  );
}

//--
//currencies
export async function tblCurrencies(client = pool) {
  // The English name each code stands for, as 028_align_currency_names.sql
  // writes it on the migration chain. The strings are what Intl.DisplayNames
  // returns in the frontend, so the stored name and the rendered label agree.
  const currenciesValues = [
    {
      currency_id: 1,
      currency_code: 'usd',
      currency_name: 'US Dollar',
    },

    { currency_id: 2, currency_code: 'eur', currency_name: 'Euro' },

    { currency_id: 3, currency_code: 'cop', currency_name: 'Colombian Peso' },

    { currency_id: 4, currency_code: 'ves', currency_name: 'Venezuelan Bolívar' },

    { currency_id: 5, currency_code: 'mxn', currency_name: 'Mexican Peso' },

    { currency_id: 6, currency_code: 'jpy', currency_name: 'Japanese Yen' },
  ];

  try {
    //verify if table exists
    const exists = await tableExists(client, 'currencies');
    if (!exists) {
      // console.log('"currencies" table does not exist. Creating it...');
      const createQuery = `CREATE TABLE currencies (
      currency_id INT PRIMARY KEY NOT NULL,
      currency_code VARCHAR(3) NOT NULL UNIQUE,
      currency_name VARCHAR(50) NOT NULL
)`;
      await client.query(createQuery);
    }

    //is it already populated
    // The table is seeded only when it holds every row this seeder writes. The
    // threshold was 2, so a catalog three currencies short read as complete.
    const isPopulated = await isTablePopulated(
      client,
      'currencies',
      currenciesValues.length,
    );
    if (isPopulated) {
      console.log('currencies table is already populated.');
      return;
    }

    console.log(currenciesValues);
    // The caller owns the transaction (initializeDatabase wraps every catalog in one BEGIN/COMMIT), so no
    // COMMIT or ROLLBACK here. This one also runs outside any transaction on every boot, where the row-count
    // check repairs a partial insert.
    for (const currency of currenciesValues) {
      const queryText = `INSERT INTO currencies(currency_id,currency_code, currency_name) VALUES ($1,$2,$3)
      ON CONFLICT (currency_id) DO NOTHING`;
      const values = [
        currency.currency_id,
        currency.currency_code,
        currency.currency_name,
      ];
      await client.query(queryText, values);
      // console.log('inerted: currency', currency.currency_code);
    }

    // console.log('All tuples inserted successfully.');
  } catch (error) {
    console.error(pc.orange('Error inserting tuples:', error));
    throw error;
  }
}

// tblCurrencies();
//--
//user roles
export async function tblUserRoles(client = pool) {
  // Four roles, as 005_base_catalogs.sql seeds them. The boot path stopped at
  // three and its CHECK rejected the fourth, so a database built from empty
  // could not hold a value the migration chain both allows and seeds.
  const rolesValues = [
    { user_role_id: 1, user_role_name: 'user' },
    { user_role_id: 2, user_role_name: 'admin' },
    { user_role_id: 3, user_role_name: 'super_admin' },
    { user_role_id: 4, user_role_name: 'system_admin' },
  ];
  const tblName = 'user_roles';
  const minCount = rolesValues.length;

  try {
    //verify if table exists
    if (!isValidTableName(tblName)) {
      throw new Error('Invalid table name');
    }

    const exists = await tableExists(client, tblName);
    if (!exists) {
      console.log(
        pc.cyan(`/" ${tblName}/" table does not exist. Creating it...`),
      );
      const createQuery = `CREATE TABLE user_roles(user_role_id SERIAL PRIMARY KEY  NOT NULL, user_role_name VARCHAR(15) NOT NULL CHECK (user_role_name IN ('user', 'admin', 'super_admin', 'system_admin') ) )`;
      await client.query(createQuery);
    }

    //is it already populated?
    const isPopulated = await isTablePopulated(client, tblName, minCount);
    if (isPopulated) {
      console.log(pc.cyan(`${tblName} table is already populated.`));
      return;
    }

    // The caller owns the transaction: initializeDatabase() wraps every catalog
    // function in one BEGIN/COMMIT, so a COMMIT here would close it early and a
    // ROLLBACK would discard the tables created after it.
    for (const role of rolesValues) {
      const queryText = `INSERT INTO user_roles(user_role_id, user_role_name) VALUES ($1,$2)
      ON CONFLICT (user_role_id) DO NOTHING`;
      const values = [role.user_role_id, role.user_role_name];
      await client.query(queryText, values);
      console.log(
        pc.green('inserted: user_role'),
        pc.green(role.user_role_name),
      );
    }

    console.log(pc.yellow('All tuples inserted successfully.'));
  } catch (error) {
    console.error(pc.red('Error inserting tuples:', tblName, error));
    throw error;
  }
}

// tblUserRoles()
//--
//accountTypes
export async function tblAccountTypes(client = pool) {
  const accountTypeValues = [
    { account_type_id: 1, account_type_name: 'bank' },
    { account_type_id: 2, account_type_name: 'investment' },
    { account_type_id: 3, account_type_name: 'debtor' },
    { account_type_id: 4, account_type_name: 'pocket_saving' },
    { account_type_id: 5, account_type_name: 'category_budget' }, //expense category
    { account_type_id: 6, account_type_name: 'income_source' },
    { account_type_id: 7, account_type_name: 'cash' },
    { account_type_id: 8, account_type_name: 'boundary' }, //system counterpart
  ];
  const tblName = 'account_types';
  // The count the table must reach to be considered seeded is the number of
  // rows this seeder writes. It used to be one less, so a table missing its
  // last row read as populated and the row was never written.
  const minCount = accountTypeValues.length;

  try {
    //verify if table exists
    if (!isValidTableName(tblName)) {
      throw new Error('Invalid table name');
    }
    const exists = await tableExists(client, tblName);

    if (!exists) {
      console.log(pc.yellow`${tblName} table does not exist. Creating it...'`);
      const createQuery = `CREATE TABLE account_types (
        account_type_id INT PRIMARY KEY NOT NULL,
        account_type_name VARCHAR(50) NOT NULL UNIQUE
)`;
      await client.query(createQuery);
    }

    //is it already populated
    const isPopulated = await isTablePopulated(client, tblName, minCount);
    if (isPopulated) {
      console.log(pc.yellowBright(`${tblName} table is already populated.`));
      return;
    }

    // The caller owns the transaction: initializeDatabase() wraps every catalog
    // function in one BEGIN/COMMIT, so a COMMIT here would close it early and a
    // ROLLBACK would discard the tables created after it.
    for (const type of accountTypeValues) {
      const queryText = `INSERT INTO account_types(account_type_id,
      account_type_name) VALUES ($1,$2)
      ON CONFLICT (account_type_id) DO NOTHING`;
      const values = [type.account_type_id, type.account_type_name];
      await client.query(queryText, values);
      console.log(pc.green(`inserted: ${tblName}, ${type.account_type_name}`));
    }

    console.log(pc.yellow('All tuples inserted successfully.'));
  } catch (error) {
    console.error('Error inserting tuples:', error);
    throw error;
  }
}
//tblAccountTypes();
//--
//categoryNatureTypes
export async function tblCategoryNatureTypes(client = pool) {
  const categoryNatureTypeValues = [
    { category_nature_type_id: 1, category_nature_type_name: 'must' },
    { category_nature_type_id: 2, category_nature_type_name: 'need' },
    { category_nature_type_id: 3, category_nature_type_name: 'other' },
    { category_nature_type_id: 4, category_nature_type_name: 'want' },
  ];
  const tblName = 'category_nature_types';
  const minCount = categoryNatureTypeValues.length - 0;

  try {
    //verify if table exists
    if (!isValidTableName(tblName)) {
      throw new Error('Invalid table name');
    }
    const exists = await tableExists(client, tblName);

    if (!exists) {
      console.log(pc.yellow`${tblName} table does not exist. Creating it...'`);
      // Fixed ids, no sequence: the seed writes them and the queries read
      // them as literals. Migration 001 declares this table the same way.
      const createQuery = `CREATE TABLE category_nature_types (
        category_nature_type_id INT PRIMARY KEY NOT NULL,
        category_nature_type_name VARCHAR(15) NOT NULL UNIQUE
)`;
      await client.query(createQuery);
    }

    //is it already populated
    const isPopulated = await isTablePopulated(client, tblName, minCount);
    if (isPopulated) {
      console.log(pc.yellowBright(`${tblName} table is already populated.`));
      return;
    }

    // The caller owns the transaction: initializeDatabase() wraps every catalog
    // function in one BEGIN/COMMIT, so a COMMIT here would close it early and a
    // ROLLBACK would discard the tables created after it.
    for (const type of categoryNatureTypeValues) {
      const queryText = `INSERT INTO category_nature_types(category_nature_type_id,
      category_nature_type_name) VALUES ($1,$2)`;
      const values = [
        type.category_nature_type_id,
        type.category_nature_type_name,
      ];
      await client.query(queryText, values);
      console.log(
        pc.green(`inserted: ${tblName}, ${type.category_nature_type_name}`),
      );
    }

    console.log(pc.yellow('All tuples inserted successfully.'));
  } catch (error) {
    const { code, message } = handlePostgresError(error);

    // Log both message and error: this catch is reached only where the table is missing or short, the one
    // boot where the migration chain and this DDL can disagree, and the message carries no stack.
    console.error('Error inserting tuples:', message, error);
    throw createError(code, message);
  }
}
//tblCategoryNatureTypes();
//---
//movement_types
export async function tblMovementTypes(client = pool) {
  const movementTypeValues = [
    { movement_type_id: 1, movement_type_name: 'expense' },
    { movement_type_id: 2, movement_type_name: 'income' },
    { movement_type_id: 3, movement_type_name: 'investment' },
    { movement_type_id: 4, movement_type_name: 'debt' },
    { movement_type_id: 5, movement_type_name: 'pocket' },
    { movement_type_id: 6, movement_type_name: 'transfer' },
    { movement_type_id: 7, movement_type_name: 'receive' },
    { movement_type_id: 8, movement_type_name: 'account-opening' },
    { movement_type_id: 9, movement_type_name: 'pnl' },
    { movement_type_id: 10, movement_type_name: 'account-closure' }, //mirrors account-opening
    // Migration 037: neutralises an account's balance so it can close at zero, as two legs against the
    // compensation account. Named for the balance reversed; the account itself closes normally.
    { movement_type_id: 11, movement_type_name: 'balance-reversal' },
  ];
  const tblName = 'movement_types';
  const minCount = movementTypeValues.length;

  try {
    //verify if table exists
    if (!isValidTableName(tblName)) {
      throw new Error('Invalid table name');
    }
    const exists = await tableExists(client, tblName);

    if (!exists) {
      console.log(pc.yellow`${tblName} table does not exist. Creating it...'`);
      const createQuery = `CREATE TABLE movement_types (
        movement_type_id INT PRIMARY KEY NOT NULL,
        movement_type_name VARCHAR(50) NOT NULL UNIQUE CHECK(movement_type_name IN ('expense','income','investment','debt','pocket','transfer','receive','account-opening','pnl','account-closure','balance-reversal'))
)`;
      await client.query(createQuery);
    }

    //is it already populated
    const isPopulated = await isTablePopulated(client, tblName, minCount);
    if (isPopulated) {
      console.log(pc.yellowBright(`${tblName} table is already populated.`));
      return;
    }

    // The caller owns the transaction: initializeDatabase() wraps every catalog
    // function in one BEGIN/COMMIT, so a COMMIT here would close it early and a
    // ROLLBACK would discard the tables created after it.
    for (const type of movementTypeValues) {
      //the seeder decides it is unpopulated by row count, so adding a value
      //makes an already-seeded database re-run the whole loop
      const queryText = `INSERT INTO movement_types(movement_type_id,
      movement_type_name) VALUES ($1,$2) ON CONFLICT (movement_type_id) DO NOTHING`;
      const values = [type.movement_type_id, type.movement_type_name];
      await client.query(queryText, values);
      console.log(pc.green(`inserted: ${tblName}, ${type.movement_type_name}`));
    }

    console.log(pc.yellow('All tuples inserted successfully.'));
  } catch (error) {
    console.error('Error inserting tuples:', error);
    throw error;
  }
}
//tblMovementTypes();

//--
//transactionTypes
export async function tbltransactionTypes(client = pool) {
  const transactionTypeValues = [
    { transaction_type_id: 1, transaction_type_name: 'withdraw' },
    { transaction_type_id: 2, transaction_type_name: 'deposit' },
    { transaction_type_id: 3, transaction_type_name: 'lend' },
    { transaction_type_id: 4, transaction_type_name: 'borrow' },
    { transaction_type_id: 5, transaction_type_name: 'account-opening' },
    { transaction_type_id: 6, transaction_type_name: 'account-closure' },
    // Migration 037, paired with movement type 11. Lists render and search transaction_type_name, so a
    // reversal reusing 'withdraw' would be shown and found as a withdrawal.
    { transaction_type_id: 7, transaction_type_name: 'balance-reversal' },
  ];

  const tblName = 'transaction_types';
  const minCount = transactionTypeValues.length;

  try {
    //verify if table exists
    if (!isValidTableName(tblName)) {
      throw new Error('Invalid table name');
    }
    const exists = await tableExists(client, tblName);

    if (!exists) {
      console.log(pc.yellow`${tblName} table does not exist. Creating it...'`);
      // Fixed ids, no sequence, as migration 001 declares it.
      const createQuery = `CREATE TABLE transaction_types(transaction_type_id INT PRIMARY KEY NOT NULL,
        transaction_type_name VARCHAR(50) NOT NULL UNIQUE)`;
      await client.query(createQuery);
    }

    //is it already populated
    const isPopulated = await isTablePopulated(client, tblName, minCount);
    if (isPopulated) {
      console.log(pc.yellowBright(`${tblName} table is already populated.`));
      return;
    }

    // The caller owns the transaction: initializeDatabase() wraps every catalog
    // function in one BEGIN/COMMIT, so a COMMIT here would close it early and a
    // ROLLBACK would discard the tables created after it.
    for (const type of transactionTypeValues) {
      //same reason as movement_types: the row count is the populated test
      const queryText = `INSERT INTO transaction_types(transaction_type_id,
      transaction_type_name) VALUES ($1,$2) ON CONFLICT (transaction_type_id) DO NOTHING`;
      const values = [type.transaction_type_id, type.transaction_type_name];
      await client.query(queryText, values);
      console.log(`inserted: ${tblName}, ${type.transaction_type_name}`);
    }

    console.log(pc.yellow('All tuples inserted successfully.'));
  } catch (error) {
    console.error('Error inserting tuples:', error);
    throw error;
  }
}

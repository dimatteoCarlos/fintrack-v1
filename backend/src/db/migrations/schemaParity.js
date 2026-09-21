/**
 * Compares a throwaway database built by the migration chain with one built by the boot DDL, so drift
 * fails here, not at run time. Read-only, refuses a production connection string. Run: npm run db:parity
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import pg from 'pg';
import pc from 'picocolors';
import 'dotenv/config';

const CHAIN_DB = 'fintrack_parity_chain';
const BOOT_DB = 'fintrack_parity_boot';

// Each path keeps its own bookkeeping table. Their absence on the other side is
// expected, not drift.
const ACCEPTED_TABLES = {
 migrations: 'the chain ledger; the boot path has no ledger',
 app_initialization: 'the boot path flag; the chain does not set one',
 account_name_case_backup_013:
  'the name backup migration 013 keeps on purpose; its DROP is commented out',
};

// The catalogs both paths seed, and the columns whose value has to match. The
// column comparison cannot see a missing row or a differently spelled name.
// Names are literals of this file, never input, so they are interpolated into queries.
const SEEDED_CATALOGS = {
 currencies: ['currency_id', 'currency_code', 'currency_name'],
 user_roles: ['user_role_id', 'user_role_name'],
 account_types: ['account_type_id', 'account_type_name'],
 category_nature_types: ['category_nature_type_id', 'category_nature_type_name'],
 movement_types: ['movement_type_id', 'movement_type_name'],
 transaction_types: ['transaction_type_id', 'transaction_type_name'],
};

const SELF = fileURLToPath(import.meta.url);

function databaseUri(base, name) {
 return base.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

async function withAdmin(base, fn) {
 const admin = new pg.Client({ connectionString: base });
 await admin.connect();
 try {
  return await fn(admin);
 } finally {
  await admin.end();
 }
}

async function recreate(admin, name) {
 await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
  [name],
 );
 await admin.query(`DROP DATABASE IF EXISTS ${name}`);
 await admin.query(`CREATE DATABASE ${name}`);
}

async function drop(admin, name) {
 await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
  [name],
 );
 await admin.query(`DROP DATABASE IF EXISTS ${name}`);
}

// Reads the shape of a database as a map of "table.column" to its declaration.
async function readShape(uri) {
 const client = new pg.Client({ connectionString: uri });
 await client.connect();
 const { rows } = await client.query(`
   SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
          c.numeric_precision, c.numeric_scale, c.character_maximum_length,
          c.column_default
   FROM information_schema.columns c
   JOIN information_schema.tables t
     ON t.table_name = c.table_name AND t.table_schema = c.table_schema
   WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
   ORDER BY c.table_name, c.column_name
 `);
 await client.end();

 const shape = new Map();
 const tables = new Set();
 for (const r of rows) {
  tables.add(r.table_name);
  const size =
   r.character_maximum_length !== null
    ? `(${r.character_maximum_length})`
    : r.numeric_precision !== null
      ? `(${r.numeric_precision},${r.numeric_scale})`
      : '';
  // The default is normalised: a sequence name carries the database name in
  // some server versions, and nextval on a serial is not drift.
  const def = (r.column_default || '')
   .replace(/nextval\('[^']+'::regclass\)/, 'nextval()')
   .trim();
  shape.set(
   `${r.table_name}.${r.column_name}`,
   `${r.data_type}${size} null=${r.is_nullable} default=${def}`,
  );
 }
 return { shape, tables };
}

// Constraints as a map of rule to delete/update action. Generated names differ between paths, so
// columns and referenced table are the key; CHECK keeps its deparsed definition so differing
// value lists are reported.
async function readConstraints(uri) {
 const client = new pg.Client({ connectionString: uri });
 await client.connect();
 const { rows } = await client.query(`
   SELECT con.contype::text AS kind,
          rel.relname::text AS tbl,
          (SELECT string_agg(att.attname, ',' ORDER BY att.attname)
             FROM unnest(con.conkey) k
             JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k) AS cols,
          COALESCE(fre.relname::text, '') AS ref_tbl,
          COALESCE((SELECT string_agg(att.attname, ',' ORDER BY att.attname)
             FROM unnest(con.confkey) k
             JOIN pg_attribute att ON att.attrelid = fre.oid AND att.attnum = k), '') AS ref_cols,
          COALESCE(con.confdeltype::text, '') AS on_delete,
          COALESCE(con.confupdtype::text, '') AS on_update,
          pg_get_constraintdef(con.oid) AS def
   FROM pg_constraint con
   JOIN pg_class rel ON rel.oid = con.conrelid
   JOIN pg_namespace ns ON ns.oid = rel.relnamespace
   LEFT JOIN pg_class fre ON fre.oid = con.confrelid
   WHERE ns.nspname = 'public' AND con.contype IN ('f','u','p','c')
   ORDER BY 1, 2, 3
 `);
 await client.end();

 const rules = new Map();
 for (const r of rows) {
  const kind = { f: 'FK', u: 'UNIQUE', p: 'PK', c: 'CHECK' }[r.kind];
  const key =
   kind === 'FK'
    ? `FK ${r.tbl}(${r.cols}) -> ${r.ref_tbl}(${r.ref_cols})`
    : `${kind} ${r.tbl}(${r.cols})`;
  const value =
   kind === 'FK' ? `del=${r.on_delete} upd=${r.on_update}` : kind === 'CHECK' ? r.def : '';
  rules.set(key, value);
 }
 return rules;
}

// Standalone indexes as a map of definition (name removed) to name; CREATE UNIQUE INDEX writes no
// pg_constraint row. Constraint-backed indexes are excluded (con.conindid). The name is the value
// because IF NOT EXISTS matches by name, so a rename would create a second copy.
async function readIndexes(uri) {
 const client = new pg.Client({ connectionString: uri });
 await client.connect();
 const { rows } = await client.query(`
   SELECT cls.relname::text AS tbl,
          idx.relname::text AS name,
          pg_get_indexdef(idx.oid) AS def
   FROM pg_index i
   JOIN pg_class idx ON idx.oid = i.indexrelid
   JOIN pg_class cls ON cls.oid = i.indrelid
   JOIN pg_namespace ns ON ns.oid = cls.relnamespace
   WHERE ns.nspname = 'public'
     AND NOT EXISTS (
      SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid
     )
   ORDER BY 1, 2
 `);
 await client.end();

 const indexes = new Map();
 for (const r of rows) {
  // "CREATE UNIQUE INDEX name ON public.tbl USING ..." -> "CREATE UNIQUE INDEX
  // ON public.tbl USING ...", so the name is compared separately from the shape.
  const shape = r.def.replace(/^(CREATE (?:UNIQUE )?INDEX) \S+ ON /, '$1 ON ');
  indexes.set(shape, { name: r.name, table: r.tbl });
 }
 return indexes;
}

// Reads the seeded catalog rows as a map of table to the list of its rows, each
// row rendered as one string. A table the path never created is left out, which
// the table comparison already reports.
async function readCatalogRows(uri) {
 const client = new pg.Client({ connectionString: uri });
 await client.connect();

 const catalogs = new Map();
 for (const [table, columns] of Object.entries(SEEDED_CATALOGS)) {
  const { rows: exists } = await client.query(
   `SELECT to_regclass($1) IS NOT NULL AS present`,
   [`public.${table}`],
  );
  if (!exists[0].present) continue;

  const { rows } = await client.query(
   `SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${columns[0]}`,
  );
  catalogs.set(
   table,
   rows.map((row) => columns.map((column) => String(row[column])).join(' | ')),
  );
 }

 await client.end();
 return catalogs;
}

// The table a constraint key belongs to, for the accepted-tables filter.
function constraintTable(key) {
 return key.replace(/^\S+ /, '').replace(/\(.*$/, '');
}

// Builds the boot-path database in a child process, so the global pool this
// module already holds is not the one that connects to it.
function buildBootPath(uri) {
 return spawnSync(process.execPath, [SELF, '--build-boot'], {
  env: { ...process.env, DATABASE_URI: uri },
  encoding: 'utf-8',
 });
}

function buildChain(uri) {
 return spawnSync(process.execPath, ['src/db/migrations/runMigrations.js'], {
  cwd: process.cwd(),
  // DB_EXPECTED because the runner refuses an unnamed destination; uri points
  // only at the throwaway chain database.
  env: { ...process.env, DATABASE_URI: uri, DB_EXPECTED: CHAIN_DB },
  encoding: 'utf-8',
 });
}

async function main() {
 const base = process.env.DATABASE_URI;
 if (!base) {
  console.error(pc.red('No DATABASE_URI in the environment.'));
  process.exit(1);
 }
 if (/prod|supabase/i.test(base)) {
  console.error(
   pc.red('Refusing to run: the connection string does not name a local database.'),
  );
  process.exit(1);
 }

 const chainUri = databaseUri(base, CHAIN_DB);
 const bootUri = databaseUri(base, BOOT_DB);
 let differences = 0;

 await withAdmin(base, async (admin) => {
  try {
   console.log(pc.cyan('\nBuilding one database by each path...\n'));

   await recreate(admin, CHAIN_DB);
   const chain = buildChain(chainUri);
   if (chain.status !== 0) {
    console.error(pc.red('The migration chain failed:'));
    console.error((chain.stderr || chain.stdout || '').split('\n').slice(-6).join('\n'));
    process.exit(1);
   }
   console.log(pc.green(`✔ chain    -> ${CHAIN_DB}`));

   await recreate(admin, BOOT_DB);
   const boot = buildBootPath(bootUri);
   if (boot.status !== 0) {
    console.error(pc.red('The boot path failed:'));
    console.error((boot.stderr || boot.stdout || '').split('\n').slice(-6).join('\n'));
    process.exit(1);
   }
   console.log(pc.green(`✔ boot DDL -> ${BOOT_DB}\n`));

   const a = await readShape(chainUri);
   const b = await readShape(bootUri);

   // Tables present on one side only.
   for (const [tables, side, other] of [
    [a.tables, 'chain', b.tables],
    [b.tables, 'boot', a.tables],
   ]) {
    for (const t of [...tables].sort()) {
     if (other.has(t)) continue;
     if (ACCEPTED_TABLES[t]) {
      console.log(pc.gray(`  accepted: ${t} only in ${side} — ${ACCEPTED_TABLES[t]}`));
      continue;
     }
     console.log(pc.red(`  TABLE only in ${side}: ${t}`));
     differences += 1;
    }
   }

   // Columns present on one side only, or declared differently.
   const keys = new Set([...a.shape.keys(), ...b.shape.keys()]);
   for (const key of [...keys].sort()) {
    const table = key.split('.')[0];
    if (ACCEPTED_TABLES[table]) continue;
    const inChain = a.shape.get(key);
    const inBoot = b.shape.get(key);
    if (inChain === inBoot) continue;
    if (inChain === undefined) {
     console.log(pc.red(`  COLUMN only in boot:  ${key}`));
    } else if (inBoot === undefined) {
     console.log(pc.red(`  COLUMN only in chain: ${key}`));
    } else {
     console.log(pc.yellow(`  DECLARED DIFFERENTLY: ${key}`));
     console.log(pc.gray(`      chain: ${inChain}`));
     console.log(pc.gray(`      boot:  ${inBoot}`));
    }
    differences += 1;
   }

   // Constraints present on one side only, or carrying a different action.
   const chainRules = await readConstraints(chainUri);
   const bootRules = await readConstraints(bootUri);

   for (const [rules, side, other] of [
    [chainRules, 'chain', bootRules],
    [bootRules, 'boot ', chainRules],
   ]) {
    for (const [key, action] of rules) {
     if (ACCEPTED_TABLES[constraintTable(key)]) continue;
     if (other.has(key)) continue;
     console.log(pc.red(`  CONSTRAINT only in ${side}: ${key} ${action}`));
     differences += 1;
    }
   }

   for (const [key, action] of chainRules) {
    if (ACCEPTED_TABLES[constraintTable(key)]) continue;
    if (!bootRules.has(key) || bootRules.get(key) === action) continue;
    console.log(pc.yellow(`  DIFFERS: ${key}`));
    console.log(pc.gray(`      chain: ${action}`));
    console.log(pc.gray(`      boot:  ${bootRules.get(key)}`));
    differences += 1;
   }

   // Indexes present on one side only, or built under a different name.
   const chainIndexes = await readIndexes(chainUri);
   const bootIndexes = await readIndexes(bootUri);

   for (const [indexes, side, other] of [
    [chainIndexes, 'chain', bootIndexes],
    [bootIndexes, 'boot ', chainIndexes],
   ]) {
    for (const [shape, { name, table }] of indexes) {
     if (ACCEPTED_TABLES[table]) continue;
     if (other.has(shape)) continue;
     console.log(pc.red(`  INDEX only in ${side}: ${name} on ${table}`));
     console.log(pc.gray(`      ${shape}`));
     differences += 1;
    }
   }

   for (const [shape, { name, table }] of chainIndexes) {
    if (ACCEPTED_TABLES[table]) continue;
    const inBoot = bootIndexes.get(shape);
    if (!inBoot || inBoot.name === name) continue;
    // Same index, two names. It matters because CREATE INDEX IF NOT EXISTS
    // matches by name, so each path would create the other's index again.
    console.log(pc.yellow(`  INDEX NAMED DIFFERENTLY on ${table}`));
    console.log(pc.gray(`      chain: ${name}`));
    console.log(pc.gray(`      boot:  ${inBoot.name}`));
    differences += 1;
   }

   // Seeded catalog rows present on one side only.
   const chainRows = await readCatalogRows(chainUri);
   const bootRows = await readCatalogRows(bootUri);

   for (const table of Object.keys(SEEDED_CATALOGS)) {
    const inChain = chainRows.get(table);
    const inBoot = bootRows.get(table);
    if (!inChain || !inBoot) continue;

    for (const [rows, side, other] of [
     [inChain, 'chain', new Set(inBoot)],
     [inBoot, 'boot ', new Set(inChain)],
    ]) {
     for (const row of rows) {
      if (other.has(row)) continue;
      console.log(pc.red(`  ROW only in ${side}: ${table} -> ${row}`));
      differences += 1;
     }
    }
   }

   console.log(
    differences === 0
     ? pc.green(
        '\n✅ Same columns, constraints, indexes and seeded rows on both paths.\n',
       )
     : pc.red(`\n❌ ${differences} difference(s) between the two paths.\n`),
   );
  } finally {
   await drop(admin, CHAIN_DB);
   await drop(admin, BOOT_DB);
  }
 });

 process.exit(differences === 0 ? 0 : 1);
}

// The child branch: build the boot path against the handed-down connection.
if (process.argv.includes('--build-boot')) {
 const { initializeDatabase } = await import('../run_time_db_init/initDatabase.js');
 const { pool } = await import('../config/configDB.js');
 await initializeDatabase();
 await pool.end();
 process.exit(0);
} else {
 await main();
}

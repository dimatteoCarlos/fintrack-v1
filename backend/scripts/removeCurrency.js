// Removes a currency from every declaration site and writes, without applying, one migration.
// Rows may point at it: RESTRICT keys fail the DELETE, SET NULL keys (users, income_source_accounts)
// silently blank the owner's currency, so a read-only census and an in-migration guard check first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const ROOT = path.resolve(BACKEND, '..');

const MIGRATIONS_DIR = path.join(BACKEND, 'src/db/migrations/sql_migrations');

// Same map as addCurrency.js, so the two cannot drift on which files declare a
// currency.
const FILES = {
 populateDB: path.join(BACKEND, 'src/db/run_time_db_init/populateDB.js'),
 fxConfig: path.join(
  BACKEND,
  'src/fintrack_api/services/fx_services/core/fxConfig.js',
 ),
 fallbackRate: path.join(
  BACKEND,
  'src/fintrack_api/services/fx_services/fxProviders/getFallbackRate.js',
 ),
 bancaDItalia: path.join(
  BACKEND,
  'src/fintrack_api/services/fx_services/fxProviders/bancaDItaliaProvider.js',
 ),
 userSchemas: path.join(BACKEND, 'src/validation/zod/userSchemas.js'),
 types: path.join(ROOT, 'frontend/src/fintrack/types/types.ts'),
 currencyConstants: path.join(
  ROOT,
  'frontend/src/fintrack/helpers/currencyConstants.ts',
 ),
 constants: path.join(ROOT, 'frontend/src/fintrack/helpers/constants.ts'),
 functions: path.join(ROOT, 'frontend/src/fintrack/helpers/functions.ts'),
};

const SWEEP_ROOTS = [path.join(BACKEND, 'src'), path.join(ROOT, 'frontend/src')];
const SWEEP_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

// Applied migrations are historical records, not live references; the sweep
// skips them.
const SWEEP_SKIP_DIRS = new Set([
 'node_modules',
 'sql_migrations',
 'dist',
 'build',
]);

// Tables that cache published rates rather than record anybody's money: their
// rows for a removed currency are deletable, while the money tables are protected
// by their RESTRICT keys.
const RATE_TABLES = new Set([
 'daily_exchange_rates',
 'exchange_rates',
 'exchange_rate_query_coverage',
]);

const USAGE = `
  node scripts/removeCurrency.js <code> [options]

  Removes a currency from the files that declare one and writes the migration
  that deletes its catalog row.

    --dry-run          print the migration and the file list, write nothing
    --offline          skip the usage census; open no database connection
    --ignore-strays    write even though the code is named outside the files
`;

function fail(message) {
 console.error(`\n  ${message}\n`);
 process.exit(1);
}

// Sources are CRLF: splicing lines out with patterns anchored on \n would leave a
// stray \r, so the line ending is stripped on read and restored on write.

function loadSource(key) {
 const file = FILES[key];
 if (!fs.existsSync(file)) {
  fail(`${path.relative(ROOT, file)} does not exist. The layout moved.`);
 }
 const raw = fs.readFileSync(file, 'utf8');
 return {
  eol: raw.includes('\r\n') ? '\r\n' : '\n',
  lines: raw.replace(/\r\n/g, '\n').split('\n'),
 };
}

function writeSource(key, source, lines) {
 fs.writeFileSync(FILES[key], lines.join(source.eol), 'utf8');
}

function blockRange(lines, opener, closer) {
 const open = lines.findIndex((line) => line.includes(opener));
 if (open === -1) return null;

 const close = lines.findIndex((line, i) => i > open && closer.test(line));
 if (close === -1) return null;

 return { open, close };
}

// Removes the entry matching `find` and the comment lines that belong to it. `shape` matches any entry
// of the list; a comment is taken only if the line above is another entry, else it describes the list.
// Returns the lines unchanged when the entry is absent: the removal goal is already met.
function removeEntry(lines, range, { find, shape = find, multiline = false }) {
 let last = -1;
 for (let i = range.open + 1; i < range.close; i += 1) {
  if (find(lines[i])) last = i;
 }
 if (last === -1) return lines;

 let first = last;
 if (multiline) {
  // populateDB.js entries can span five lines; walk out to their braces.
  while (first > range.open && !lines[first].includes('{')) first -= 1;
  while (last < range.close && !lines[last].includes('}')) last += 1;
 }

 let from = first;
 while (from > range.open + 1 && /^\s*\/\//.test(lines[from - 1])) from -= 1;
 if (from < first && !shape(lines[from - 1]) && !lines[from - 1].includes('}')) {
  from = first;
 }

 const next = [...lines.slice(0, from), ...lines.slice(last + 1)];
 const closer = range.close - (last - from + 1);

 // Lists have one blank line between entries, so removing one leaves two:
 // collapse them, and when the entry was last, drop the blank line the closing
 // bracket never had above it.
 if (
  from > 0 &&
  from < next.length &&
  next[from - 1].trim() === '' &&
  (next[from].trim() === '' || from === closer)
 ) {
  next.splice(from - 1, 1);
 }

 return next;
}

// Rewrites a one-line list of quoted codes without the code. Returns null when
// that would empty the list: an app with no currency is not a state this script
// may produce.
function removeFromInlineList(lines, pattern, code, join) {
 const index = lines.findIndex((line) => pattern.test(line));
 if (index === -1) return null;

 const match = lines[index].match(pattern);
 const codes = [...match[2].matchAll(/'([a-z]{3})'/g)].map((m) => m[1]);
 if (codes.length === 0) return null;
 if (!codes.includes(code)) return lines;

 const kept = codes.filter((c) => c !== code);
 if (kept.length === 0) return null;

 const next = [...lines];
 next[index] = `${match[1]}${kept.map((c) => `'${c}'`).join(join)}${match[3]}`;
 return next;
}

// Each removeFrom* returns the new lines, or null when its anchor is missing. A
// null aborts the run before any write: a partial removal leaves the client
// offering a code the API has stopped accepting.

// Keeps the two build paths in step: the migration deletes the catalog row from a
// chain-built database, this edit from one built by createTables.js.
function removeFromPopulateDB(lines, { code }) {
 const range = blockRange(lines, 'const currenciesValues = [', /^\s*\];/);
 if (!range) return null;

 return removeEntry(lines, range, {
  find: (line) => new RegExp(`currency_code: *'${code}'`).test(line),
  shape: (line) => /currency_code: *'[a-z]{3}'/.test(line),
  multiline: true,
 });
}

// The backend list every request validator derives its accepted set from.
function removeFromFxConfig(lines, { code }) {
 return removeFromInlineList(
  lines,
  /^(export const SUPPORTED_CURRENCIES = \[)(.*)(\];)$/,
  code,
  ', ',
 );
}

// Absence here is not an error: a currency is added to this list only when the
// provider was measured to publish it.
function removeFromBancaDItalia(lines, { code }) {
 return removeFromInlineList(
  lines,
  /^(const SUPPORTED_CURRENCIES = \[)(.*)(\];)$/,
  code,
  ', ',
 );
}

// The static floor the last provider in the cascade answers with.
function removeFromFallbackRate(lines, { code }) {
 const range = blockRange(lines, 'export const fixedRates = {', /^\s*\};/);
 if (!range) return null;

 return removeEntry(lines, range, {
  find: (line) => new RegExp(`^\\s*${code}: *[\\d.]+,$`).test(line),
  shape: (line) => /^\s*[a-z]{3}: *[\d.]+,$/.test(line),
 });
}

// The union the client typechecks against. Narrowing it is what turns every
// stale use of the code into a compile error.
function removeFromTypes(lines, { code }) {
 return removeFromInlineList(
  lines,
  /^(export type CurrencyType = )(.*)(;)$/,
  code,
  ' | ',
 );
}

// Three lists in one file (supported set, badge toggle order, locale map) in one
// pass, so the file is never half done.
function removeFromCurrencyConstants(lines, { code }) {
 let next = lines;

 for (const name of ['SUPPORTED_CURRENCIES', 'CURRENCY_CYCLE']) {
  const range = blockRange(
   next,
   `export const ${name}: CurrencyType[] = [`,
   /^\s*\];/,
  );
  if (!range) return null;

  next = removeEntry(next, range, {
   find: (line) => new RegExp(`^\\s*'${code}',$`).test(line),
   shape: (line) => /^\s*'[a-z]{3}',$/.test(line),
  });
 }

 const options = blockRange(
  next,
  'export const CURRENCY_OPTIONS: Record<CurrencyType, string> = {',
  /^\s*\};/,
 );
 if (!options) return null;

 return removeEntry(next, options, {
  find: (line) => new RegExp(`^\\s*${code}: '.*',$`).test(line),
  shape: (line) => /^\s*[a-z]{3}: '.*',$/.test(line),
 });
}

// The uppercase validation set. Its commented-out codes are left alone.
function removeFromFunctions(lines, { code }) {
 const range = blockRange(
  lines,
  'const validCurrencyCodes = new Set([',
  /^\s*\]\);/,
 );
 if (!range) return null;

 return removeEntry(lines, range, {
  find: (line) => new RegExp(`^\\s*'${code.toUpperCase()}',$`).test(line),
  shape: (line) => /^\s*'[A-Z]{3}',$/.test(line),
 });
}

// Same two regression guards as addCurrency.js.

function checkNoHardcodedCurrencyEnum(text) {
 if (/z\s*\.\s*enum\(\s*\[\s*'usd'/.test(text)) {
  return (
   'currencySchema in userSchemas.js has gone back to a hardcoded z.enum.\n' +
   '  A local list there keeps accepting the code after every other list has\n' +
   '  dropped it, so the API would take a currency the catalog no longer has.\n' +
   '  Restore the .refine() over SUPPORTED_CURRENCIES.'
  );
 }
 return null;
}

function checkNoShadowedCurrencyConstants(text) {
 const shadowed = [
  'CURRENCY_CYCLE',
  'CURRENCY_OPTIONS',
  'SELECT_CURRENCY_OPTIONS',
  'DEFAULT_CURRENCY',
  'SUPPORTED_CURRENCIES',
 ].filter((name) => new RegExp(`^export const ${name}\\b`, 'm').test(text));

 if (shadowed.length > 0) {
  return (
   `constants.ts redeclares ${shadowed.join(', ')} under its own star\n` +
   '  re-export of currencyConstants.ts. A local export wins over a star\n' +
   '  re-export, so this raises no error -- it splits the application in two,\n' +
   '  half reading each copy, and removing the code from one half leaves the\n' +
   '  other half offering it. Remove the redeclaration first.'
  );
 }
 return null;
}

function strayReferences(code) {
 const declared = new Set(Object.values(FILES));
 const quoted = new RegExp(`['"\`](${code}|${code.toUpperCase()})['"\`]`);
 const found = [];

 for (const root of SWEEP_ROOTS) {
  if (!fs.existsSync(root)) continue;
  walk(root, (file) => {
   if (declared.has(file)) return;
   if (!SWEEP_EXTENSIONS.has(path.extname(file))) return;

   fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
     if (quoted.test(line)) found.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  });
 }

 return found;
}

function walk(dir, visit) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) {
   if (SWEEP_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
   walk(full, visit);
  } else {
   visit(full);
  }
 }
}

const DELETE_RULE = {
 a: 'NO ACTION',
 r: 'RESTRICT',
 c: 'CASCADE',
 n: 'SET NULL',
 d: 'SET DEFAULT',
};

async function census(id) {
 const [{ getDbConfig, isProduction }, { default: pg }] = await Promise.all([
  import('../src/db/migrations/dbMigrationConfig.js'),
  import('pg'),
 ]);

 if (isProduction()) {
  fail(
   'NODE_ENV is production. Refusing to open a connection.\n' +
    '  Pass --offline to write the migration without a census; the census is\n' +
    '  then owed on a restored copy, not on the live database.',
  );
 }

 const config = getDbConfig();

 // Same refusal schemaParity.js makes: this script only reads, but through
 // whatever the environment points at, and it must not choose that database.
 if (/prod|supabase/i.test(`${config.host} ${config.database}`)) {
  fail(
   `Refusing to run: '${config.database}' does not name a local database.\n` +
    '  Read it through section 5 of the migration procedure instead.',
  );
 }

 const client = new pg.Client(config);
 await client.connect();

 try {
  // Foreign keys to currencies are discovered, not listed, so a table added
  // later is still counted.
  const { rows: keys } = await client.query(`
    SELECT rel.relname::text AS tbl,
           att.attname::text AS col,
           con.confdeltype::text AS on_delete
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_class fre ON fre.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute att
      ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND fre.relname = 'currencies'
      AND ns.nspname = 'public'
    ORDER BY 1, 2
  `);

  const counts = [];
  for (const key of keys) {
   const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM "${key.tbl}" WHERE "${key.col}" = $1`,
    [id],
   );
   counts.push({ ...key, n: rows[0].n });
  }

  return { database: config.database, counts };
 } finally {
  await client.end();
 }
}

function nextMigrationNumber() {
 const numbers = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => Number.parseInt(f.slice(0, 3), 10))
  .filter((n) => Number.isInteger(n));

 if (numbers.length === 0) {
  fail(`No numbered migrations found in ${MIGRATIONS_DIR}.`);
 }

 return String(Math.max(...numbers) + 1).padStart(3, '0');
}

// Id and name are read from the boot seed (the copy this script also edits), as
// addCurrency.js does.
function catalogEntry(lines, code) {
 const range = blockRange(lines, 'const currenciesValues = [', /^\s*\];/);
 if (!range) return null;

 const block = lines.slice(range.open, range.close + 1).join('\n');
 const match = new RegExp(
  `currency_id: *(\\d+),\\s*currency_code: '${code}',\\s*currency_name: '([^']*)'`,
 ).exec(block);
 if (!match) return null;

 return { id: Number(match[1]), name: match[2] };
}

function migrationBody({ code, name, id, filename, measured }) {
 const upper = code.toUpperCase();
 return `-- ${filename}
--
-- ============================================================================
-- Migration ${filename.slice(0, 3)}: removes ${name} (${upper}) from the currency catalog.
-- Depends on: currencies, and the rate tables exchange_rates,
--   daily_exchange_rates and exchange_rate_query_coverage.
-- Measured before writing: ${measured}
-- ============================================================================
--
-- Written by scripts/removeCurrency.js. Read it before running it.
--
-- WHY A DELETE IS NOT THE MIRROR OF AN INSERT
--
-- Nothing points at a currency before it exists; a great deal can point at one
-- before it is removed. The keys holding those rows are not uniform, and the
-- difference decides whether a mistake is loud or silent:
--
--   ON DELETE RESTRICT -- currency_id, original_currency_id and
--   exchange_rate_target_currency_id on the money tables, and base_currency_id /
--   target_currency_id on the rate tables. The DELETE fails and the runner rolls
--   the whole file back. That is the correct outcome and it needs no help here.
--
--   ON DELETE SET NULL -- users.currency_id and
--   income_source_accounts.currency_id. The DELETE succeeds and silently blanks
--   the accounting currency of every owner who chose ${upper}. Nothing in the
--   application announces it, and the row it damages is the one that decides
--   how that owner's money is valued.
--
-- The guard below is for the second kind. It exists because the script that
-- wrote this file counted rows in ONE database, and this file may be applied to
-- another.
--
-- WHY THE RATE ROWS GO AND THE MONEY ROWS DO NOT
--
-- exchange_rates, daily_exchange_rates and exchange_rate_query_coverage store
-- published rates and what has been asked for. They are a cache and a record of
-- sources, never a record of anybody's money: the audit of a movement is the six
-- FX columns on the movement's own row, which no key here reaches. A rate for a
-- currency the catalog no longer has is unreachable data, so it goes with the
-- row. Every other table is left to its RESTRICT key.
--
-- THE OTHER BUILD PATH
--
-- A database built by run_time_db_init/createTables.js never sees this file; it
-- takes its catalog from run_time_db_init/populateDB.js, and the same run that
-- wrote this migration removed the row there. npm run db:parity compares the two.

-- UP ------------------------------------------------------------------------

-- The guard. It discovers the SET NULL keys instead of naming them, so a key
-- added after this file was written is still checked. The BEGIN below is the
-- PL/pgSQL construct, not a transaction: the runner opens one per file.
DO $$
DECLARE
 fk RECORD;
 holders BIGINT;
BEGIN
 FOR fk IN
  SELECT rel.relname::text AS tbl, att.attname::text AS col
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class fre ON fre.oid = con.confrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  JOIN pg_attribute att
    ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE con.contype = 'f'
    AND fre.relname = 'currencies'
    AND ns.nspname = 'public'
    AND con.confdeltype = 'n'
 LOOP
  EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', fk.tbl, fk.col)
   INTO holders
   USING ${id};

  IF holders > 0 THEN
   RAISE EXCEPTION
    '% rows of %.% still hold currency_id ${id} (${code}). That key is ON DELETE SET NULL, so deleting the currency would blank them without failing. Reassign them first.',
    holders, fk.tbl, fk.col;
  END IF;
 END LOOP;
END $$;

DELETE FROM daily_exchange_rates
 WHERE base_currency_id = ${id} OR target_currency_id = ${id};

DELETE FROM exchange_rates
 WHERE base_currency_id = ${id} OR target_currency_id = ${id};

DELETE FROM exchange_rate_query_coverage
 WHERE base_currency_id = ${id} OR target_currency_id = ${id};

DELETE FROM currencies WHERE currency_id = ${id};

-- DOWN ----------------------------------------------------------------------
--
-- Commented out and run by hand, like every reverse from 025 onward: there is
-- no reverse runner, so it must read as statements someone can paste.
--
-- It restores the catalog row and nothing else. The rate rows deleted above are
-- a cache and refill themselves from the providers. The source edits this
-- migration travelled with are reversed by scripts/addCurrency.js.
--
-- BEGIN;
-- INSERT INTO currencies (currency_id, currency_code, currency_name)
-- VALUES (${id}, '${code}', '${name}')
-- ON CONFLICT (currency_id) DO NOTHING;
-- DELETE FROM migrations WHERE filename = '${filename}';
-- COMMIT;
`;
}

function parseArgs(argv) {
 const positional = [];
 const flags = { dryRun: false, offline: false, ignoreStrays: false };

 for (const arg of argv) {
  if (arg === '--dry-run') flags.dryRun = true;
  else if (arg === '--offline') flags.offline = true;
  else if (arg === '--ignore-strays') flags.ignoreStrays = true;
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}.${USAGE}`);
  else positional.push(arg);
 }

 return { positional, flags };
}

async function main() {
 const { positional, flags } = parseArgs(process.argv.slice(2));

 if (positional.length !== 1) {
  console.log(USAGE);
  process.exit(positional.length === 0 ? 0 : 1);
 }

 const code = positional[0].toLowerCase();
 if (!/^[a-z]{3}$/.test(code)) {
  fail(`'${positional[0]}' is not a three-letter currency code.`);
 }

 // Checked first: it needs neither network nor database.
 const { ACCOUNTING_CURRENCY_CODE } = await import(
  '../src/fintrack_api/config/fintrackConfig.js'
 );

 if (code === String(ACCOUNTING_CURRENCY_CODE).toLowerCase()) {
  fail(
   `'${code}' is the accounting currency.\n` +
    '  Every stored amount is converted into it and every conversion resolves\n' +
    '  its target through the catalog. Removing it does not degrade the\n' +
    '  application, it stops it. Nothing was written.',
  );
 }

 const sources = Object.fromEntries(
  Object.keys(FILES).map((key) => [key, loadSource(key)]),
 );

 const guards = [
  checkNoHardcodedCurrencyEnum(sources.userSchemas.lines.join('\n')),
  checkNoShadowedCurrencyConstants(sources.constants.lines.join('\n')),
 ].filter(Boolean);

 if (guards.length > 0) fail(guards.join('\n\n  '));

 const entry = catalogEntry(sources.populateDB.lines, code);
 if (!entry) {
  fail(
   `'${code}' is not declared in populateDB.js, so there is no catalog row to\n` +
    '  remove and no id to write a migration against. Nothing was written.',
  );
 }

 const { id, name } = entry;
 console.log(`\n  ${code.toUpperCase()} -- ${name}, currency_id ${id}`);

 let measured;

 if (flags.offline) {
  measured = 'nothing -- the run was --offline and read no database.';
  console.log(
   '\n  --offline: no database was read. Nothing has confirmed that this\n' +
    '  currency is unused. The migration carries its own guard, which will\n' +
    '  catch it at apply time instead of now.',
  );
 } else {
  console.log('\n  Counting what points at it...');
  const { database, counts } = await census(id);
  console.log(`  on ${database}\n`);

  if (counts.length === 0) {
   fail(
    `no foreign key to currencies exists in '${database}'.\n` +
     '  Either the connection points somewhere unexpected or that schema is\n' +
     '  not this application. Nothing was written.',
   );
  }

  for (const c of counts) {
   console.log(
    `   ${c.n > 0 ? '!' : ' '} ${String(c.n).padStart(6)}  ` +
     `${c.tbl}.${c.col}  ON DELETE ${DELETE_RULE[c.on_delete] || c.on_delete}`,
   );
  }

  const held = counts.filter((c) => c.n > 0);
  const money = held.filter((c) => !RATE_TABLES.has(c.tbl));

  if (money.length > 0) {
   fail(
    `'${code}' is in use on '${database}': ` +
     `${money.map((c) => `${c.tbl}.${c.col} (${c.n})`).join(', ')}.\n` +
     "  Every one of those rows is somebody's money or somebody's setting, and\n" +
     '  what to do with it is a decision, not a cleanup. Reassign them first,\n' +
     '  in a migration of their own. Nothing was written.',
   );
  }

  measured =
   held.length === 0
    ? `no row references currency_id ${id} on ${database}, across all ` +
      `${counts.length} foreign keys to currencies.`
    : `on ${database}, only rate rows reference currency_id ${id} -- ` +
      `${held.map((c) => `${c.tbl}.${c.col} (${c.n})`).join(', ')}. ` +
      'No money table and no owner setting holds it.';

  if (held.length > 0) {
   console.log(
    '\n  Only rate rows hold it. The migration deletes those: they are a cache\n' +
     "  of published rates, not a record of anybody's money.",
   );
  }
 }

 const strays = strayReferences(code);
 if (strays.length > 0 && !flags.ignoreStrays) {
  fail(
   `'${code}' is still named outside the declaration sites:\n` +
    strays.map((s) => `    ${s}`).join('\n') +
    '\n\n  Each one is either a use that will break or a comment that will lie.\n' +
    '  Fix them first, or pass --ignore-strays once you have read every line.\n' +
    '  Nothing was written.',
  );
 }
 if (strays.length > 0) {
  console.log(`\n  --ignore-strays: ${strays.length} mention(s) left standing.`);
 }

 const edits = [
  ['populateDB', removeFromPopulateDB(sources.populateDB.lines, { code })],
  ['fxConfig', removeFromFxConfig(sources.fxConfig.lines, { code })],
  [
   'fallbackRate',
   removeFromFallbackRate(sources.fallbackRate.lines, { code }),
  ],
  [
   'bancaDItalia',
   removeFromBancaDItalia(sources.bancaDItalia.lines, { code }),
  ],
  ['types', removeFromTypes(sources.types.lines, { code })],
  [
   'currencyConstants',
   removeFromCurrencyConstants(sources.currencyConstants.lines, { code }),
  ],
  ['functions', removeFromFunctions(sources.functions.lines, { code })],
 ];

 const missing = edits.filter(([, result]) => result === null);
 if (missing.length > 0) {
  fail(
   `could not locate the anchor in: ${missing
    .map(([key]) => path.relative(ROOT, FILES[key]))
    .join(', ')}.\n` +
    '  The file was reformatted, the list moved, or removing this code would\n' +
    '  empty a list that cannot be empty. Nothing was written -- remove this\n' +
    '  currency by hand and fix the anchor in this script afterwards.',
  );
 }

 const changed = edits.filter(
  ([key, lines]) => lines.join('\n') !== sources[key].lines.join('\n'),
 );
 const untouched = edits.filter(
  ([key, lines]) => lines.join('\n') === sources[key].lines.join('\n'),
 );

 const number = nextMigrationNumber();
 const filename = `${number}_remove_${code}_currency.sql`;
 const migrationPath = path.join(MIGRATIONS_DIR, filename);

 if (fs.existsSync(migrationPath)) {
  fail(`${filename} already exists. Nothing was written.`);
 }

 const migration = migrationBody({ code, name, id, filename, measured });

 if (flags.dryRun) {
  console.log(`\n  --dry-run. ${filename} would read:\n`);
  console.log(
   migration
    .split('\n')
    .map((line) => `  | ${line}`)
    .join('\n'),
  );
  console.log('  And these files would change:');
  for (const [key] of changed) {
   console.log(`   M ${path.relative(ROOT, FILES[key])}`);
  }
  for (const [key] of untouched) {
   console.log(`   . ${path.relative(ROOT, FILES[key])}  (does not declare it)`);
  }
  console.log('\n  Nothing was written.\n');
  process.exit(0);
 }

 fs.writeFileSync(migrationPath, migration, 'utf8');
 console.log(`\n   + ${path.relative(ROOT, migrationPath)}`);

 for (const [key, lines] of changed) {
  writeSource(key, sources[key], lines);
  console.log(`   M ${path.relative(ROOT, FILES[key])}`);
 }
 for (const [key] of untouched) {
  console.log(`   . ${path.relative(ROOT, FILES[key])}  (does not declare it)`);
 }

 console.log(`
  WHAT IS LEFT, AND NONE OF IT IS OPTIONAL

  1. Read the migration before applying it. Its guard is the only thing standing
     between an ON DELETE SET NULL key and a silently blanked owner setting.
  2. Apply it:                       npm run db:migrate
  3. Confirm both build paths agree: npm run db:parity
  4. Restart the backend. The catalog is read once at startup, so until it is,
     the removed currency is still in memory.
  5. Typecheck the client:           npx tsc --noEmit   (from frontend/)
     CurrencyType is narrower now, so every place that named this code is a
     compile error. That is the point: the compiler finds what the sweep above
     could only guess at.

  ON A DATABASE THIS RUN DID NOT SEE

  The census counted rows in one database. Any other one is a separate reading.
  Apply this through section 5 of
  backend/src/db/docs/db-documented/db-migration-procedure.md, which is where
  proving which database you are about to write to lives.

  Nothing was committed and nothing was pushed.
`);

 process.exit(0);
}

main().catch((error) => {
 fail(`unexpected failure: ${error.message}`);
});

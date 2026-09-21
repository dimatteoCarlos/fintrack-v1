// Connection config shared by the DB scripts, plus the destination guards they call.

import pc from 'picocolors';
import dotenv from 'dotenv';

dotenv.config();

function parseConnectionString(uri) {
  const parsed = new URL(uri);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
  };
}

export function getDbConfig() {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DATABASE_URI,
  } = process.env;

  let parsed = null;
  if (DATABASE_URI) {
    try {
      parsed = parseConnectionString(DATABASE_URI);
    } catch (err) {
      console.warn(pc.yellow(`⚠️ Failed to parse DATABASE_URI: ${err.message}`));
    }
  }

  // Precedence: individual DB_* variables, then DATABASE_URI, then defaults.
  const config = {
    host: DB_HOST || parsed?.host || 'localhost',
    port: parseInt(DB_PORT || parsed?.port || '5432', 10),
    user: DB_USER || parsed?.user || 'postgres',
    password: DB_PASSWORD || parsed?.password || '',
    database: DB_NAME || parsed?.database || '',
  };

  if (!config.database) {
    console.error(pc.red('❌ Database name could not be determined (DB_NAME or DATABASE_URI required)'));
    process.exit(1);
  }

  return config;
}

// Connects to the 'postgres' database, for CREATE and DROP DATABASE.
export function getAdminDbConfig() {
  const config = getDbConfig();
  return {
    ...config,
    database: 'postgres',
  };
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Loopback in every spelling a server reports. A Unix socket makes
// inet_server_addr() return NULL, which the callers handle.
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Guards the destination, not the mode: refuses unless DB_EXPECTED names the database actually reached.
 * NODE_ENV does not choose the database (DATABASE_URI is read in every mode), so mode checks can pass.
 * An unset DB_EXPECTED is refused on purpose: a guard that defaults to proceeding protects nobody.
 *
 * @param {string} script the npm script being guarded, named in the refusal
 * @returns {Promise<string>} the confirmed database name
 */
export async function assertExpectedDatabase(client, script) {
 const expected = process.env.DB_EXPECTED;

 const {
  rows: [server],
 } = await client.query(
  'SELECT current_database() AS db, inet_server_addr() AS host, inet_server_port() AS port',
 );

 const where = `${server.db} at ${server.host || 'local socket'}:${server.port || '-'}`;

 if (!expected) {
  console.error(
   pc.red(`\n❌ ${script} refuses to run without DB_EXPECTED.\n`) +
    pc.gray(`   This connection reached ${where}.\n`) +
    pc.gray(`   Set DB_EXPECTED to that database name to confirm it is the one you mean.\n`),
  );
  process.exit(1);
 }

 if (expected !== server.db) {
  console.error(
   pc.red(`\n❌ ${script} refuses to run: destination mismatch.\n`) +
    pc.gray(`   DB_EXPECTED names "${expected}" and this connection reached ${where}.\n`),
  );
  process.exit(1);
 }

 // A typed name does not prove where the database is, so the address decides
 // too. The rule lives in assertOffMachineAllowed because the boot path shares it.
 assertOffMachineAllowed(server, where, script);

 console.log(pc.green(`✅ Destination confirmed: ${where}`));
 return server.db;
}

/**
 * Refuses a destination that is not this machine unless DB_REMOTE_OK is set: a remote database can carry
 * the DB_EXPECTED name, so a run leaving this machine must say so. An allowlist of addresses (loopback, or
 * NULL for a Unix socket), not of names, since a managed database can be called anything.
 *
 * @param {{db: string, host: string|null, port: number|null}} server
 */
function assertOffMachineAllowed(server, where, script) {
 const local = server.host === null || LOOPBACK.has(server.host);

 if (!local && !process.env.DB_REMOTE_OK) {
  console.error(
   pc.red(`\n❌ ${script} refuses to run: the destination is not this machine.\n`) +
    pc.gray(`   This connection reached ${where}.\n`) +
    pc.gray('   A name confirms a database, and a remote database can carry any name.\n') +
    pc.gray('   A production run is authorized one at a time, by the owner, for named files.\n') +
    pc.gray('   Set DB_REMOTE_OK=1 to state that an off-machine destination is meant.\n'),
  );
  process.exit(1);
 }

 if (!local) {
  console.log(
   pc.yellow(`⚠ Off-machine destination, allowed by DB_REMOTE_OK: ${where}`),
  );
 }
}

/**
 * Destination interlock for callers with no DB_EXPECTED: initializeDatabase() runs boot DDL on each boot,
 * so a typed name would be typed by reflex; it only asks whether the database is on this machine.
 *
 * @returns {Promise<string>} the destination, as "database at host:port"
 */
export async function assertLocalDestination(client, script) {
 const {
  rows: [server],
 } = await client.query(
  'SELECT current_database() AS db, inet_server_addr() AS host, inet_server_port() AS port',
 );

 const where = `${server.db} at ${server.host || 'local socket'}:${server.port || '-'}`;

 assertOffMachineAllowed(server, where, script);

 return where;
}

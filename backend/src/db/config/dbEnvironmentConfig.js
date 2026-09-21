// Per-environment database configuration.
import dotenv from 'dotenv';

// Load .env only in non-production environments (Vercel provides env vars)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
 }
// TLS must verify who is on the other end, not only encrypt: without ca and
// rejectUnauthorized a MITM presenting any certificate is accepted. The CA is
// preferably Base64, which survives every env-var transport without newline mangling.
const caCert = process.env.DB_CA_CERT_B64
  ? Buffer.from(process.env.DB_CA_CERT_B64, 'base64').toString('utf8')
  : process.env.DB_CA_CERT || null;

const sslRequired = process.env.DB_SSL === 'true';

// Fail fast: a security control that silently disables itself is worse than none,
// because it reports success. Mirrors the DATABASE_URI check below.
if (sslRequired && !caCert) {
  throw new Error(
    'DB_SSL=true requires DB_CA_CERT_B64 (or DB_CA_CERT). ' +
    'Refusing to connect without verifying the database certificate.',
  );
}

const ssl_env = sslRequired ? { ca: caCert, rejectUnauthorized: true } : false;
// Never set this to 1: several paths hold a pool.connect() client and then call
// pool.query(), which needs a second free connection. At max=1 that query waits
// on the caller's own connection until connectionTimeoutMillis (10 s) fires.
const max_env = parseInt(process.env.DB_POOL_MAX || '2', 10);

const config = {
  development: {
    database: {
      connectionString: process.env.DATABASE_URI,
      ssl:  ssl_env, 
      max:max_env, 
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
  },
  production: {
    database: {
      connectionString: process.env.DATABASE_URI,
      ssl: ssl_env, 
      max: max_env, 
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
  },
};

const env = process.env.NODE_ENV || 'development';

// Fail fast on an unknown NODE_ENV.
if (!config[env]) {
  throw new Error(`❌ Invalid NODE_ENV: ${env}`);
}

const activeConfig = config[env];

if (!activeConfig.database.connectionString) {
  throw new Error(`Missing DATABASE_URI for environment: ${env}`);
}

export { activeConfig };
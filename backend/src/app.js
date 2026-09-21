// Express app: middlewares, routes, CORS and error handlers.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import useragent from 'express-useragent';

import routes from './auth_api/routes/index.js';
import { verifyToken } from './auth_api/middlewares/authMiddleware.js';
import fintrack_routes from './fintrack_api/routes/index.js';
import export_routes from './export_api/routes/index.js';

import { pool } from './db/config/configDB.js';

import { loadCurrencyCatalog } from './fintrack_api/services/fx_services/currency_catalog/loadCurrencyCatalog.js';

import { ACCEPTED_ORIGINS } from './utils/authUtils/acceptedOrigins.js';

const app = express();

// Load .env conditionally (Vercel injects env vars automatically)
if (!process.env.VERCEL) {
  dotenv.config();
}

// Checked at load: a missing JWT_SECRET otherwise surfaces as a 500 that names no cause on
// the first authenticated request (and on every serverless cold start); here the deployment
// log names the absent variable. The value is never printed.
const JWT_SECRET_MIN_LENGTH = 32;

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Tokens cannot be signed or verified without it.',
  );
}

if (process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  console.warn(
    `⚠️ JWT_SECRET is shorter than ${JWT_SECRET_MIN_LENGTH} characters. A short secret can be recovered offline from any token the server has issued.`,
  );
}

// authFn.js reads JWT_REFRESH_TOKEN_SECRET and SALT_ROUNDS. Missing, the secret fails only
// inside jwt.sign, far from this file, and the rounds become NaN (bcrypt throws "Not a
// number" on the first sign-up); both are checked at boot instead.
if (!process.env.JWT_REFRESH_TOKEN_SECRET) {
  throw new Error(
    'JWT_REFRESH_TOKEN_SECRET is not set. Refresh tokens cannot be signed or verified without it.',
  );
}

if (process.env.JWT_REFRESH_TOKEN_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  console.warn(
    `⚠️ JWT_REFRESH_TOKEN_SECRET is shorter than ${JWT_SECRET_MIN_LENGTH} characters. A short secret can be recovered offline from any refresh token the server has issued.`,
  );
}

if (!Number.isInteger(Number(process.env.SALT_ROUNDS))) {
  throw new Error(
    'SALT_ROUNDS is not set to an integer. Passwords cannot be hashed without it.',
  );
}

try {
  await loadCurrencyCatalog();
  console.log('✅ Currency catalog loaded successfully');
} catch (err) {
  console.error('❌ Failed to load currency catalog:', err.message);
}

// Trust the first proxy only in production: cloud hosts (Render, Vercel) sit behind reverse
// proxies, and Express needs to trust them to see the real client IP and protocol.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ACCEPTED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      console.error('CORS error: Origin not allowed', origin);

      return callback(
        new Error('Your address is not an allowed origin by CORS'),
        false,
      );
    },
    credentials: true, // Allow to send cookies
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Frontend and backend are separate origins, so downloadFile.ts's filenameFrom() can only
    // read Content-Disposition if it is exposed; otherwise every download falls back to the
    // caller's hardcoded name.
    exposedHeaders: ['Content-Disposition'],
  }),
);

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(useragent.express());

// Routes assume backend is the root directory on Vercel.
let totalRequests = 0;

app.use((req, res, next) => {
  totalRequests++;
  console.log(`Total request received: ${totalRequests}`);
  next();
});
app.get('/api/health', (req, res) => {
  console.log('✅ /api/health invoked');
  // Public and unauthenticated, so it answers only that the process is up and describes
  // nothing about the deployment.
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    message: 'Testing vercel-serverless',
  });
});
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as test');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    // The driver's text names the host, role, database and whether the connection is
    // encrypted. It belongs in the log, not in the response of a public, unauthenticated route.
    console.error('DB test error', error);
    res.status(500).json({
      success: false,
      error: 'Database unreachable',
    });
  }
});

app.use('/api', routes);

// No API-wide rate limiter on this router: one counter treated a dashboard paint like a
// password guess, so a normal session exhausted it.
app.use('/api/fintrack', verifyToken, fintrack_routes);

// Sibling of /api/fintrack, not nested: Data Export reads FinTrack's data but is a separate
// module by folder and by route. Removing it means deleting this line and the export_api folder.
app.use('/api/export', verifyToken, export_routes);

app.all('*', (req, res) => {
  res.status(404).json({ error: '404', message: 'Route link was not found' });
});

app.use((err, req, response, next) => {
  console.error('error handled response ', err);

  const errorStatus = err.status || 500;
  const errorMessage = err.message || 'Something went wrong';

  response.status(errorStatus).json({
    message: errorMessage,
    status: errorStatus,
    // Emitted only when the thrower declared one, so errors without a stable identity keep
    // their existing response body.
    ...(err.errorCode ? { error: err.errorCode } : {}),
    ...(err.details ? { details: err.details } : {}),
    stack: process.env.NODE_ENV == 'development' ? err.stack : undefined,
  });
});

export default app;

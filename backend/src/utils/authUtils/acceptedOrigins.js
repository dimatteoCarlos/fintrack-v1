// Same pattern as configDB.js: loaded unconditionally so CLIENT_URL is readable
// whatever imports this first; app.js's own dotenv.config() runs too late, since
// the auth route tree imports this module (via authMiddleware.js) before app.js's body.
import 'dotenv/config';

// The one list of origins trusted with credentials, shared by app.js's CORS and
// verifyOriginForCookieAuth so the two cannot drift. Localhost origins are dev-only:
// in production they would trust any developer machine on those ports.
const LOCALHOST_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:5000',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8080',
        'http://localhost:1234',
        'http://localhost:5432',
      ];

export const ACCEPTED_ORIGINS = [
  process.env.CLIENT_URL,
  ...LOCALHOST_ORIGINS,
  'https://pern-fintrack.vercel.app',
].filter(Boolean);

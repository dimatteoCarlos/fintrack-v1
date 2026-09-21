// An export builds a file in memory from up to EXPORT_ROW_LIMIT rows, so it costs more than
// an ordinary read; this limiter applies even while the global limiter is disabled.

import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

const WINDOW_MINUTES = 5;
const MAX_EXPORTS = 20;

const keyGenerator = (req) => {
 const safeIp = ipKeyGenerator(req.ip);
 const userId = req.user?.userId;
 return userId ? `${userId}_${safeIp}` : safeIp;
};

export const exportRateLimiter = rateLimit({
 windowMs: WINDOW_MINUTES * 60 * 1000,
 limit: MAX_EXPORTS,
 keyGenerator,
 standardHeaders: true,
 legacyHeaders: false,
 skipSuccessfulRequests: false,
 handler: (req, res, next, options) => {
  res.status(429).json({
   success: false,
   error: 'ExportRateLimitExceeded',
   message: `Too many export requests. Try again in ${WINDOW_MINUTES} minutes.`,
   retryAfter: Math.ceil(options.windowMs / 1000),
  });
 },
});

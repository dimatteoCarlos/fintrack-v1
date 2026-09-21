// Rate limiters for the auth and user routes, built on express-rate-limit.
import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

// Key is userId_ip when authenticated, otherwise ip. ipKeyGenerator needs the ip
// string: given the request it returns it unchanged, so every call would create
// a fresh Map key and nothing would ever accumulate.
const keyGenerator = (req) => {
 const safeIp = ipKeyGenerator(req.ip);
 const userId = req.user?.userId;
 return userId ? `${userId}_${safeIp}` : safeIp;
};

// Standard 429 body. retryAfter is the caller's real reset time from
// req.rateLimit.resetTime (populated by standardHeaders: true); windowMs is only
// the fallback when a store omits it.
const createRateLimitResponse = (errorType, userMessage, resetTime, windowMs) => {
 const secondsRemaining = resetTime
  ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
  : Math.ceil(windowMs / 1000);

 return {
  success: false,
  error: errorType,
  message: userMessage,
  retryAfter: secondsRemaining, // in seconds
 };
};

// Profile update: 5 attempts per 2 minutes per user; the reference figure is 10
// attempts per 15 minutes.
const PROFILE_WINDOW_MINUTES =2;
const PROFILE_MAX_ATTEMPTS = 5;

export const profileUpdateLimiter = rateLimit({
  windowMs: PROFILE_WINDOW_MINUTES * 60 * 1000,
  limit: PROFILE_MAX_ATTEMPTS,
 keyGenerator,
 standardHeaders: true,
 legacyHeaders: false,
 skipSuccessfulRequests: false,

  handler: (req, res, next, options) => {
    res.status(429).json(
     createRateLimitResponse(
      'RateLimitExceeded',
      `Security: Too many UPDATE attempts. Try again in ${PROFILE_WINDOW_MINUTES} minutes.`,
      req.rateLimit?.resetTime,
      options.windowMs, // Use 'options': windowMs is not attached to the returned middleware
     )
   );
  }
}
);

// Password change: 5 attempts per 30 seconds per user; the reference figure for
// this security-critical route is 5 attempts per 15 minutes.
const WINDOW_MINUTES = 0.5;
const MAX_ATTEMPTS = 5;

export const passwordChangeLimiter = rateLimit(
 {
  windowMs: WINDOW_MINUTES  * 60 * 1000,
  limit: MAX_ATTEMPTS,
  keyGenerator,

  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,

  handler:(req, res, next, options)=>{
   res.status(429).json(
    createRateLimitResponse(
    'PasswordChangeRateLimitExceeded',
    `Security: Too many password change attempts. Try again in ${WINDOW_MINUTES} minutes.`,
    req.rateLimit?.resetTime,
    options.windowMs
    )
   )
  }
 });

// Sign-in: 5 attempts per 2 minutes per IP.
export const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  limit: 5,
  // Dead: the custom handler below replaces the default handler, so this message
  // is never sent (and its "5 minutes" disagrees with windowMs).
  message: {
    success: false,
    error: 'AuthRateLimitExceeded',
    message: 'Too many authentication attempts. Please try again in 5 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // successful logins do not count toward the limit

// IP only: nobody is logged in yet. The arrow is needed because keyGenerator is
// called with (req, res), so ipKeyGenerator itself would read the request as an ip.
  keyGenerator: (req) => ipKeyGenerator(req.ip),

  handler: (req, res,  next, options) => {
   res.status(429).json(
   createRateLimitResponse(
    'AuthRateLimitExceeded',
    'Too many login attempts. Please wait before trying again.',
    req.rateLimit?.resetTime,
    options.windowMs
   ));
  }
});

// Counts successes, since a completed sign-up is what this caps (authLimiter skips them).
// Production allows 4 per 15 minutes per IP; raised elsewhere because the dev seed script
// re-creates the same demo account on every run.
const SIGN_UP_LIMIT = process.env.NODE_ENV === 'production' ? 4 : 1000;

export const signUpLimiter = rateLimit({
 windowMs: 15 * 60 * 1000,
 limit: SIGN_UP_LIMIT,
 standardHeaders: true,
 legacyHeaders: false,
 skipSuccessfulRequests: false,
 // No user exists yet at sign-up, so the shared keyGenerator has no id to use.
 keyGenerator: (req) => ipKeyGenerator(req.ip),
 handler: (req, res, next, options) => {
  res.status(429).json(
   createRateLimitResponse(
    'SignUpRateLimitExceeded',
    'Too many accounts created from this network. Please wait before trying again.',
    req.rateLimit?.resetTime,
    options.windowMs,
   ),
  );
 },
});

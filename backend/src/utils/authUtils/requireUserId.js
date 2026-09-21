import { respondError } from '../responseHelpers.js';
import { getAuthenticatedUserId } from './getAuthenticatedUserId.js';

/**
 * Guard: resolve the authenticated user's ID, or send a 401 and return null.
 *
 * SIDE EFFECT: on failure this WRITES the response, so callers must return immediately
 * (`if (!userId) return;`) or hit ERR_HTTP_HEADERS_SENT later, far from the cause.
 *
 * @returns {string | null} the userId, or null when a 401 was already sent
 */
export const requireUserId = (req, res) => {
 const userId = getAuthenticatedUserId(req);

 if (!userId) {
  respondError(res, 401, 'Unauthorized: missing user identity claim in token.');
  return null;
 }

 return userId;
};
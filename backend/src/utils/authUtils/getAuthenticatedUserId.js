/**
 * The user ID from the verified JWT claim `userId` (signed in authFn.js). The token is the only
 * acceptable source of identity: never read a user ID from req.body, req.query or req.params.
 *
 * @returns {string | null} null when the request carries no verified identity
 */
export const getAuthenticatedUserId = (req) => {
 return req.user?.userId ?? null;
};

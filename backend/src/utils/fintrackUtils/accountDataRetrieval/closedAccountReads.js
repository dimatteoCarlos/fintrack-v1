// Switch that decides whether a read sees closed and erased accounts.

import { accountIdentitySource } from './accountIdentity.js';

/**
 * When true, dashboard joins go through `account_registry` (`accountIdentitySource`), which also yields
 * accounts erased by the deletion tail. A flag because that table arrives with migration 035 and
 * deployment does not carry the schema: set it only where the chain has reached 035, or reads fail.
 */
export const INCLUDE_CLOSED_ACCOUNTS =
 String(process.env.INCLUDE_CLOSED_ACCOUNTS ?? '').toLowerCase() === 'true';

/**
 * What a read joins to reach an account. It replaces only the table name, so the caller's alias and
 * every `ua.` reference stay valid, including `ua.user_id`, which `accountIdentitySource` selects.
 *
 * @param {string} [userIdPlaceholder] - The bind placeholder holding the owner's id, e.g. '$1'
 * @returns {string} - `user_accounts`, or a parenthesised subquery
 */
export const accountReadSource = (userIdPlaceholder = '$1') =>
 INCLUDE_CLOSED_ACCOUNTS ? accountIdentitySource(userIdPlaceholder) : 'user_accounts';

/**
 * How a read joins an account's extension table (`pocket_saving_accounts`, `debtor_accounts`, ...).
 * LEFT under the flag: an erased account has no extension row, and an INNER join would drop it.
 * Callers must handle NULL in every extension column for it (no `target`, no `desired_date`).
 *
 * @returns {string} - `JOIN` or `LEFT JOIN`
 */
export const ACCOUNT_EXTENSION_JOIN = INCLUDE_CLOSED_ACCOUNTS ? 'LEFT JOIN' : 'JOIN';

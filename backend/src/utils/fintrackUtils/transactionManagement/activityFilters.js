// Shared by the Overview activity list and the export report, so the export does
// not have to import overview_services to read the same predicate.

// What counts as a movement here, written once so the teaser and the paged endpoint cannot drift.
// $1 is the owner; no other placeholder appears, since embedding statements number their own parameters.
export const ACTIVITY_FILTER = `
  -- Owner and type are read off account_registry, which holds every account open or
  -- closed: where the user_accounts row is gone, ua.user_id and its type are NULL and
  -- the account's movements would vanish from the list while the domain totals kept them.
  WHERE ar.user_id = $1
    -- IS DISTINCT FROM and not <>: the registry's type is ON DELETE SET NULL, and
    -- a NULL type is not a boundary account.
    AND COALESCE(ua.account_type_id, ar.account_type_id) IS DISTINCT FROM (
      SELECT account_type_id FROM account_types WHERE account_type_name = 'boundary'
    )`;

// The reader's narrowings (search term, movement type), shared by the page and its count; a null drops out.
// Not in ACTIVITY_FILTER: the teaser shares it, and a search nobody typed would change its question.
// $5 term and $6 type precede the page bounds: the count binds no LIMIT/OFFSET, so $7 would be unreachable.
export const ACTIVITY_READER_FILTER = `
    -- strpos over lower(), not ILIKE: with ILIKE the term's own % and _ act as
    -- wildcards, so "50%" or "credit_card" would match unrelated rows.
    -- Searches the WHOLE description, not only the note the row displays: the
    -- server-narrated half ("Transaction: ... from X to Y") is where an owner looks for
    -- a counterparty. extractNoteFromDescription splits the two for display only.
    AND (
      $5::text IS NULL
      OR strpos(lower(tr.description), lower($5::text)) > 0
      OR strpos(lower(COALESCE(ua.account_name, ar.account_name, '')), lower($5::text)) > 0
    )
    -- By name, not id: a client can send the name without holding the movement-type
    -- catalog, and validation already refuses names outside it.
    AND ($6::text IS NULL OR mt.movement_type_name = $6::text)`;

// Newest first; the id breaks the tie, so a page boundary between two movements
// with the same actual date neither repeats one row nor skips another.
export const ACTIVITY_ORDER = `
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC`;

/**
 * Every movement_type_name the catalog holds, in catalog order. Re-exported by
 * overview_services/db/movementTypes.js so the export validator can read the catalog that
 * ACTIVITY_READER_FILTER's $6 compares against.
 */
export const MOVEMENT_TYPE_NAMES = [
 'expense',
 'income',
 'investment',
 'debt',
 'pocket',
 'transfer',
 'receive',
 'account-opening',
 'pnl',
 'account-closure',
 'balance-reversal',
];

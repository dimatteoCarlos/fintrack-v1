// Rows come from `account_registry`, not `user_accounts` (closing deletes that row), so catalog
// references may be stale. An account erased before the registry existed has only a null name;
// an inner join would drop it.

// One closure, as the registry stamped it.
export type ClosedAccountRowType = {
  accountId: number;
  // Null on a row for an account erased before the registry existed. Render it
  // as an explicit "not recorded", never as an empty cell.
  accountName: string | null;
  // Null when the type catalog row it referenced was removed: the stamp is
  // ON DELETE SET NULL.
  accountTypeName: string | null;
  currencyCode: string | null;
  // TEXT, not a number, for the same reason every amount in this module is:
  // nothing rounds it in transit.
  accountStartingAmount: string | null;
  accountStartDate: string | null;
  accountCreatedAt: string | null;
  // category_budget only. Never recover either part by splitting accountName:
  // migration 013 trimmed the name and the subcategory in separate statements,
  // so some accounts have a name and parts that disagree.
  categoryName: string | null;
  subcategory: string | null;
  categoryNatureTypeName: string | null;
  // Never null on a returned row: the query filters on `closed_at IS NOT NULL`,
  // which is what makes a registry row a closure rather than an open account's.
  closedAt: string;
  // Never null either: migration 035's chk_close_reason_accompanies_closure
  // refuses a closure stamp with no reason or a whitespace-only one.
  closeReason: string;
};

// The sort keys the endpoint accepts, written out so the dropdown and the
// server's whitelist cannot drift: an unknown key silently falls back to the
// default, and the control appears to do nothing.
export const CLOSED_ACCOUNT_SORT_KEYS = [
  'closed_at',
  'account_name',
  'account_type_name',
  'account_created_at',
] as const;

export type ClosedAccountSortKeyType =
  (typeof CLOSED_ACCOUNT_SORT_KEYS)[number];

export type ClosedAccountOrderType = 'asc' | 'desc';

// The toolbar's choices in one object: each one resets the page to 1, and
// separate setters would each have to remember that.
export type ClosedAccountQueryType = {
  search: string;
  type: string;
  sort: ClosedAccountSortKeyType;
  order: ClosedAccountOrderType;
  page: number;
  limit: number;
};

// One page plus the figures a pager needs. The server echoes back the search,
// type, sort and order it actually applied: an unparseable page or unknown sort
// key falls back instead of raising.
export type ClosedAccountsDataType = {
  rows: number;
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  sort: string;
  order: string;
  search: string;
  type: string;
  accountList: ClosedAccountRowType[];
};

export type ClosedAccountsResponseType = {
  status: number;
  message: string;
  data: ClosedAccountsDataType;
};

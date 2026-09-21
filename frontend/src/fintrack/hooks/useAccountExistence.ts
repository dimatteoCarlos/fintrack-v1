// Fetches every account once: which names of a type exist (autocomplete) and whether ANOTHER
// account of the same type holds a name. Indexed by id so a rename can exclude itself.
import { useCallback, useMemo } from 'react';
import { useFetch } from './useFetch';
import { url_get_all_accounts } from '../../urlConfig';

/** Item of the /account/allAccounts list; the id is what enables self-exclusion. */
type AccountListItem = {
 account_id: number | string;
 account_name: string;
 account_type_name: string;
};

type AllAccountsResponse = {
 data: {
  accountList: AccountListItem[];
 };
};

/** Per-type index entry: the id used for exclusion and the folded name compared against. */
type AccountIndexEntry = {
 accountId: string;
 foldedName: string;
};

/**
 * 'taken' - another account of this type holds the name; 'free' - none does.
 * 'unknown' - the account list has not arrived, so nothing can be claimed.
 */
export type NameAvailability = 'taken' | 'free' | 'unknown';

type UseAccountExistenceReturn = {
 isLoading: boolean;
 error: string | null;
 /** False until the account list has actually arrived. */
 isIndexReady: boolean;
 getSuggestions: (type: string, excludeAccountId?: number | string) => string[];
 checkNameCollision: (
  name: string,
  type: string,
  excludeAccountId?: number | string,
 ) => NameAvailability;
 checkDuplicate: (
  name: string,
  type: string,
  excludeAccountId?: number | string,
 ) => boolean;
};

// The list carries a numeric id while a route parameter is a string; compared raw
// the exclusion would silently never match, so both sides are folded to a string.
const asAccountKey = (
 accountId: number | string | null | undefined,
): string | null =>
 accountId === null || accountId === undefined ? null : String(accountId);

/**
 * Autocomplete and duplicate checking by account type, with an optional account
 * excluded from both so an edit does not collide with itself.
 */
export const useAccountExistence = (): UseAccountExistenceReturn => {
 const { apiData, isLoading, error } =
  useFetch<AllAccountsResponse>(url_get_all_accounts);

 // The only proof the list was answered: useFetch starts isLoading at false, so the
 // first render is neither loading nor answered, and reading it as "free" would be
 // a false negative.
 const accountList = useMemo(() => {
  const list = apiData?.data?.accountList;
  return Array.isArray(list) ? list : null;
 }, [apiData]);

 const isIndexReady = accountList !== null;

 const accountsByType = useMemo(() => {
  const map = new Map<string, AccountIndexEntry[]>();

  (accountList ?? []).forEach((account) => {
   const type = account.account_type_name;
   const accountKey = asAccountKey(account.account_id);
   if (!type || accountKey === null) return;

   const entries = map.get(type) ?? [];
   entries.push({
    accountId: accountKey,
    // Folded to lowercase to match the server, which compares with LOWER().
    foldedName: account.account_name.trim().toLowerCase(),
   });
   map.set(type, entries);
  });

  return map;
 }, [accountList]);

 /**
  * Sorted names of a type, original case kept. The excluded account does not
  * suggest its own name: it is exempt from the collision check, so the form would
  * accept it for a reason the user cannot see.
  */
 const getSuggestions = useCallback(
  (type: string, excludeAccountId?: number | string): string[] => {
   if (!type || accountList === null) return [];

   const excludedKey = asAccountKey(excludeAccountId);
   const names = accountList
    .filter((account) => account.account_type_name === type)
    .filter((account) => asAccountKey(account.account_id) !== excludedKey)
    .map((account) => account.account_name);

   return Array.from(new Set(names)).sort();
  },
  [accountList],
 );

 /**
  * Whether the name is already held by another account of the same type.
  * Returns 'unknown' while the account list has not arrived, so a caller can
  * tell "no collision" from "no answer yet".
  */
 const checkNameCollision = useCallback(
  (
   name: string,
   type: string,
   excludeAccountId?: number | string,
  ): NameAvailability => {
   // An empty name asks nothing; the required-field rule owns that case.
   if (!type || !name.trim()) return 'free';
   if (!isIndexReady) return 'unknown';

   const excludedKey = asAccountKey(excludeAccountId);
   const target = name.trim().toLowerCase();
   const entries = accountsByType.get(type) ?? [];

   const collides = entries.some(
    (entry) => entry.foldedName === target && entry.accountId !== excludedKey,
   );

   return collides ? 'taken' : 'free';
  },
  [accountsByType, isIndexReady],
 );

 /**
  * Boolean view of the check, kept for the creation screens that already read
  * it that way. 'unknown' reads as not-a-duplicate here, which is why a caller
  * that gates a submit control must read checkNameCollision instead.
  */
 const checkDuplicate = useCallback(
  (name: string, type: string, excludeAccountId?: number | string): boolean =>
   checkNameCollision(name, type, excludeAccountId) === 'taken',
  [checkNameCollision],
 );

 return {
  isLoading,
  error: error || null,
  isIndexReady,
  getSuggestions,
  checkNameCollision,
  checkDuplicate,
 };
};

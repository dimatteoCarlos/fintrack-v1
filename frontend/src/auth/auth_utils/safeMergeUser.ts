import { UserDataType } from "../types/authTypes";

/**
 * Merges a partial backend user over the current one so fields the backend
 * omits are not lost. @throws when newUser is missing.
 */
export const safeMergeUser = ( 
 current: UserDataType | null,
 newUser: Partial<UserDataType>): UserDataType => {
  
  if (!newUser) {
   console.error('❌ safeMergeUser: newUser is null or undefined');
   throw new Error("Invalid server response - Missing user data");
  }

 // Drop undefined values so they do not overwrite existing fields.
  const cleaned = Object.fromEntries(
 // eslint-disable-next-line @typescript-eslint/no-unused-vars 
    Object.entries(newUser).filter(([_, value]) => value !== undefined)
  ) as Partial<UserDataType>;

   return {
    ...current,
    ...cleaned,
  } as UserDataType;
};
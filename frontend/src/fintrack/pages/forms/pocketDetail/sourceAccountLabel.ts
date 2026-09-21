// Source-account label of a history entry; a closed account keeps its name, marked (closed).

import { PocketAllocationEntry } from '../../../types/pocketTypes';

export const sourceAccountLabel = (
 entry: Pick<PocketAllocationEntry, 'sourceAccountName' | 'sourceAccountIsClosed'>,
 unnamed: string,
): string => {
 if (entry.sourceAccountName === null) return unnamed;

 return entry.sourceAccountIsClosed
  ? `${entry.sourceAccountName} (closed)`
  : entry.sourceAccountName;
};

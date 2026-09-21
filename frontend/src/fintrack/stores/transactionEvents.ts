// Write signals: the writer announces, each cache decides what to invalidate (no payload or named consumer).
// Must import nothing: tracker and stores both import it; no tracker chunk may pull in a store.

type TransactionRecordedListener = () => void;

const listeners = new Set<TransactionRecordedListener>();

// Returns the unsubscribe function. Stores subscribe at module scope and never
// call it; a component that subscribes must, in its effect cleanup.
export const onTransactionRecorded = (
 listener: TransactionRecordedListener,
): (() => void) => {
 listeners.add(listener);
 return () => {
  listeners.delete(listener);
 };
};

// Called from the tracker once a write is confirmed. Listeners only drop their
// memo, so this issues no request of its own.
export const notifyTransactionRecorded = (): void => {
 listeners.forEach((listener) => {
  listener();
 });
};

// Account write signal: an edit changes what spending was against (name, category, nature). Separate
// listener sets keep a spending-only cache from dropping its memo on a rename.

type AccountChangedListener = () => void;

const accountListeners = new Set<AccountChangedListener>();

export const onAccountChanged = (
 listener: AccountChangedListener,
): (() => void) => {
 accountListeners.add(listener);
 return () => {
  accountListeners.delete(listener);
 };
};

// Called from an account editor once a write is confirmed. Same contract as
// above: no payload, no named consumer, no request issued here.
export const notifyAccountChanged = (): void => {
 accountListeners.forEach((listener) => {
  listener();
 });
};

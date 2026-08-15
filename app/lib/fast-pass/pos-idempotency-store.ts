const SAME_TAB_EVENT_PREFIX = "fast-pass-pos-storage:";
const LOCK_PREFIX = "fast-pass-pos-idempotency:";
const memoryFallback = new Map<string, string>();
const fallbackKeys = new Set<string>();
/** Serializes same-tab POS claims when `navigator.locks` is unavailable. */
let sameTabLockChain: Promise<unknown> = Promise.resolve();

function sameTabEventName(storageKey: string): string {
  return `${SAME_TAB_EVENT_PREFIX}${storageKey}`;
}

export function getPosIdempotencyKey(storageKey: string): string | null {
  if (fallbackKeys.has(storageKey)) {
    return memoryFallback.get(storageKey) ?? null;
  }
  try {
    const key = window.localStorage.getItem(storageKey);
    if (key === null) memoryFallback.delete(storageKey);
    else memoryFallback.set(storageKey, key);
    return key;
  } catch {
    fallbackKeys.add(storageKey);
    return memoryFallback.get(storageKey) ?? null;
  }
}

export function getServerPosIdempotencyKey(): null {
  return null;
}

export function subscribeToPosIdempotencyKey(
  storageKey: string,
  onStoreChange: () => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      onStoreChange();
    }
  };
  const eventName = sameTabEventName(storageKey);

  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventName, onStoreChange);
  };
}

export function persistPosIdempotencyKey(
  storageKey: string,
  key: string,
): void {
  memoryFallback.set(storageKey, key);
  try {
    window.localStorage.setItem(storageKey, key);
    fallbackKeys.delete(storageKey);
  } catch {
    fallbackKeys.add(storageKey);
  }
  window.dispatchEvent(new Event(sameTabEventName(storageKey)));
}

export function clearPosIdempotencyKey(
  storageKey: string,
  expectedKey?: string,
): void {
  if (
    expectedKey !== undefined &&
    getPosIdempotencyKey(storageKey) !== expectedKey
  ) {
    return;
  }
  memoryFallback.delete(storageKey);
  fallbackKeys.delete(storageKey);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    fallbackKeys.add(storageKey);
  }
  window.dispatchEvent(new Event(sameTabEventName(storageKey)));
}

export async function withPosIdempotencyLock<T>(
  storageKey: string,
  task: () => Promise<T>,
): Promise<T> {
  if (navigator.locks?.request) {
    return navigator.locks.request(`${LOCK_PREFIX}${storageKey}`, task);
  }

  const run = sameTabLockChain.then(() => task());
  // Keep the chain usable after a rejection so later claims still serialize.
  sameTabLockChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

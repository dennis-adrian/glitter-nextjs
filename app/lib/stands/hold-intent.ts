export type HoldIntentCache = {
  standId: number;
  key: string;
  expiresAt: number;
};

export function isHoldIntentExpired(
  cached: Pick<HoldIntentCache, "expiresAt"> | null,
  now: number,
): boolean {
  return cached != null && now >= cached.expiresAt;
}

export function nextHoldIntent(
  cached: HoldIntentCache | null,
  standId: number,
  now: number,
  ttlMs: number,
  createKey: () => string,
): HoldIntentCache {
  if (
    !cached ||
    cached.standId !== standId ||
    isHoldIntentExpired(cached, now)
  ) {
    return {
      standId,
      key: createKey(),
      expiresAt: now + ttlMs,
    };
  }
  return cached;
}

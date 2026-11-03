import "server-only";

import { getTableColumns, type Table } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Reads that every request repeats and that change only when staff change
 * them: the feature flags, the festival in progress, the store's open or
 * closed state and the landing content. The navbar alone used to read them
 * with about five sequential round trips on every page load.
 *
 * Each is cached across requests under one of these tags, for a short time
 * at most, and the action that changes the data expires its tag at once, so
 * staff see their own change on the next screen.
 */
export const SHARED_CACHE_TAGS = {
  featureFlags: "feature-flags",
  festivals: "festivals",
  storeSettings: "store-settings",
  landingContent: "landing-content",
} as const;

export type SharedCacheTag =
  (typeof SHARED_CACHE_TAGS)[keyof typeof SHARED_CACHE_TAGS];

/** What `unstable_cache` throws when no Next server is running. */
const NO_CACHE = "incrementalCache missing in unstable_cache";
/** What `revalidateTag` throws outside a request. */
const NO_REQUEST = "static generation store missing";

type SharedCacheOptions<Result> = {
  tags: SharedCacheTag[];
  /** The longest a value is served, in seconds, if nothing expires it. */
  revalidate: number;
  /**
   * Restores what JSON loses. The cache stores values as JSON, so a `Date`
   * comes back as a string; a value just computed still has its `Date`s, so
   * this must accept both.
   */
  revive?: (value: Result) => Result;
};

/**
 * `unstable_cache` with the app's tags and a lifetime, that also runs where
 * there is no Next cache: scripts and tests call the function directly.
 *
 * Arguments become part of the key, so they must be plain values, never
 * anything that depends on who is asking. A failed read throws and is never
 * stored.
 */
export function sharedCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  key: string,
  options: SharedCacheOptions<Result>,
): (...args: Args) => Promise<Result> {
  // Built on first use, not at import: nothing about Next is touched until a
  // value is actually read.
  let cached: ((...args: Args) => Promise<Result>) | null = null;

  return async (...args: Args) => {
    cached ??= unstable_cache(fn, [key], {
      tags: [...options.tags],
      revalidate: options.revalidate,
    });

    let value: Result;
    try {
      value = await cached(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes(NO_CACHE)) {
        return fn(...args);
      }
      throw error;
    }
    return options.revive ? options.revive(value) : value;
  };
}

/**
 * Expires a tag at once: the next read goes to the database. Call it after
 * the write has committed, never inside its transaction, or a read in between
 * stores the old row again.
 *
 * Outside a request (a script, a test) there is nothing to expire, and the
 * lifetime bounds how long a running server keeps the old value.
 */
export function expireSharedCache(...tags: SharedCacheTag[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (error) {
      if (error instanceof Error && error.message.includes(NO_REQUEST)) {
        continue;
      }
      throw error;
    }
  }
}

/**
 * Turns a row's timestamp columns back into `Date`s, after a trip through the
 * cache's JSON. Only the columns the table declares as dates are touched, so a
 * text column that happens to hold a date-like string stays a string.
 */
export function reviveTimestamps<Row extends object>(
  row: Row,
  table: Table,
): Row {
  const revived = { ...row } as Record<string, unknown>;
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    const value = revived[name];
    if (column.dataType === "date" && typeof value === "string") {
      revived[name] = new Date(value);
    }
  }
  return revived as Row;
}

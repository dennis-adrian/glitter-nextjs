import "server-only";

import { createHash } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionRateLimits } from "@/db/schema";

const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
let nextCleanupAt = 0;

/**
 * A stable, non-reversible name for the caller's network address, for keying
 * rate limits on anonymous callers.
 *
 * Only headers the hosting platform sets are read: Vercel overwrites
 * `x-real-ip` and `x-forwarded-for` with the connecting address. Headers it
 * passes through as sent, such as `cf-connecting-ip` (the site is not behind
 * Cloudflare), would let a script pick a new address for every request.
 */
export function callerFingerprint(requestHeaders: Pick<Headers, "get">) {
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  const clientIdentifier =
    requestHeaders.get("x-real-ip")?.trim() ||
    forwardedIp?.trim() ||
    `unknown:${requestHeaders.get("user-agent") ?? "no-user-agent"}`;
  return createHash("sha256").update(clientIdentifier).digest("hex");
}

async function cleanupStaleRateLimits(now: Date) {
  if (now.getTime() < nextCleanupAt) return;
  nextCleanupAt = now.getTime() + RATE_LIMIT_CLEANUP_INTERVAL_MS;

  try {
    await db
      .delete(actionRateLimits)
      .where(
        lt(
          actionRateLimits.updatedAt,
          new Date(now.getTime() - RATE_LIMIT_RETENTION_MS),
        ),
      );
  } catch {
    // Cleanup is best-effort and must not change the active request's limit.
  }
}

export async function consumeActionRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / input.windowMs) * input.windowMs,
  );

  const [bucket] = await db
    .insert(actionRateLimits)
    .values({
      key: input.key,
      windowStartedAt,
      requestCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: actionRateLimits.key,
      set: {
        windowStartedAt: sql`excluded.window_started_at`,
        requestCount: sql`CASE
          WHEN ${actionRateLimits.windowStartedAt} = excluded.window_started_at
          THEN ${actionRateLimits.requestCount} + 1
          ELSE 1
        END`,
        updatedAt: now,
      },
    })
    .returning({ requestCount: actionRateLimits.requestCount });

  await cleanupStaleRateLimits(now);

  return (bucket?.requestCount ?? input.limit + 1) <= input.limit;
}

import "server-only";

import { lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionRateLimits } from "@/db/schema";

const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
let nextCleanupAt = 0;

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

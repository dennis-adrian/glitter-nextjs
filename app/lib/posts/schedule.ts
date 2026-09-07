import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { posts } from "@/db/schema";

/**
 * Publishes every scheduled post whose time has come.
 *
 * `publishedAt` is set to `scheduledAt`, not to `now()`: the article is dated
 * when the admin said it would go out, so a late sweep — or a run the cron
 * missed entirely — does not reorder the blog by however long the delay was.
 *
 * Idempotent by construction. The `where` matches only rows still in
 * `scheduled`, so a re-run, an overlapping run, or a retry after a partial
 * failure promotes each post exactly once.
 */
export async function publishDueScheduledPosts(
  now = new Date(),
): Promise<{ promoted: number; slugs: string[] }> {
  const promoted = await db
    .update(posts)
    .set({
      status: "published",
      publishedAt: posts.scheduledAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(posts.status, "scheduled"),
        isNotNull(posts.scheduledAt),
        lte(posts.scheduledAt, now),
      ),
    )
    .returning({ slug: posts.slug });

  if (promoted.length > 0) {
    revalidatePath("/blog", "layout");
    for (const row of promoted) {
      revalidatePath(`/blog/${row.slug}`, "page");
    }
  }

  return { promoted: promoted.length, slugs: promoted.map((r) => r.slug) };
}

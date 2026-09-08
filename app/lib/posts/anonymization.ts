import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { PostStatus } from "@/app/lib/posts/definitions";
import { db } from "@/db";
import { posts } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

/**
 * Statuses a reader could never have seen. Nothing links to them, so removing
 * them with their author leaves no gap — unlike a published article, which
 * other pages and outside links point at.
 *
 * `scheduled` belongs here on purpose: it was going to be published, but
 * publishing a departed author's post on a timer after they asked to be
 * forgotten is not a thing the cron should do.
 */
const NEVER_PUBLIC: PostStatus[] = [
  "draft",
  "submitted",
  "approved",
  "scheduled",
  "rejected",
];

/**
 * Settles a departing user's posts so `DELETE FROM users` can proceed.
 *
 * Published and archived posts stay, with `authorId` nulled — the public page
 * falls back to "Equipo Glitter". Everything that never reached a reader is
 * deleted outright.
 *
 * Must run before `DELETE FROM users`. The foreign key is `ON DELETE SET NULL`
 * so a forgotten call cannot abort the deletion the way `posts.authorId` once
 * did while it was `RESTRICT`; what the explicit call adds is removing the
 * private drafts, which the constraint alone would silently keep forever.
 *
 * Mirrors `anonymizeProgramPurchasesForUser`, which runs on the same path.
 */
export async function detachPostsForDeletedUser(
  executor: Executor,
  userId: number,
): Promise<{ deleted: number; detached: number }> {
  const deleted = await executor
    .delete(posts)
    .where(and(eq(posts.authorId, userId), inArray(posts.status, NEVER_PUBLIC)))
    .returning({ id: posts.id });

  const detached = await executor
    .update(posts)
    .set({ authorId: null, updatedAt: new Date() })
    .where(eq(posts.authorId, userId))
    .returning({ id: posts.id });

  return { deleted: deleted.length, detached: detached.length };
}

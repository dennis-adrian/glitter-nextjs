import "server-only";

import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import {
  COMMENT_RATE_LIMIT,
  COMMENT_RATE_WINDOW_MS,
  type CommentNode,
} from "@/app/lib/posts/definitions";
import { db } from "@/db";
import { postComments } from "@/db/schema";

const COMMENT_AUTHOR_COLUMNS = {
  id: true as const,
  displayName: true as const,
  firstName: true as const,
  lastName: true as const,
  imageUrl: true as const,
};

/**
 * A post's visible thread: top-level comments in posting order, each with its
 * replies.
 *
 * Hidden comments are dropped here rather than at render time, and a hidden
 * parent takes its replies with it — a reply reads as an answer to something,
 * so leaving it standing after its comment is moderated away shows half a
 * conversation and re-publishes the part that was removed.
 */
export async function fetchCommentThread(
  postId: number,
): Promise<CommentNode[]> {
  const rows = await db.query.postComments.findMany({
    where: and(
      eq(postComments.postId, postId),
      eq(postComments.isHidden, false),
    ),
    with: { user: { columns: COMMENT_AUTHOR_COLUMNS } },
    orderBy: [asc(postComments.createdAt), asc(postComments.id)],
  });

  const roots = rows.filter((row) => row.parentId === null);
  const byParent = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const bucket = byParent.get(row.parentId);
    if (bucket) bucket.push(row);
    else byParent.set(row.parentId, [row]);
  }

  return roots.map((root) => ({
    id: root.id,
    body: root.body,
    createdAt: root.createdAt,
    userId: root.userId,
    user: root.user,
    replies: (byParent.get(root.id) ?? []).map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt,
      userId: reply.userId,
      user: reply.user,
    })),
  }));
}

export async function countVisibleComments(postId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postComments)
    .where(
      and(eq(postComments.postId, postId), eq(postComments.isHidden, false)),
    );
  return row?.count ?? 0;
}

/**
 * Whether this user has already spent their allowance on this post.
 *
 * Counts rows rather than holding state, so it survives a restart and cannot
 * drift from what was actually written. Hidden comments still count: deleting
 * your own comment must not hand back a token to post another.
 */
export async function isCommentRateLimited(
  userId: number,
  postId: number,
  now = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - COMMENT_RATE_WINDOW_MS);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postComments)
    .where(
      and(
        eq(postComments.userId, userId),
        eq(postComments.postId, postId),
        gte(postComments.createdAt, since),
      ),
    );
  return (row?.count ?? 0) >= COMMENT_RATE_LIMIT;
}

/** A parent must exist, belong to this post, and not already be a reply. */
export async function findValidParent(
  postId: number,
  parentId: number,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: postComments.id })
    .from(postComments)
    .where(
      and(
        eq(postComments.id, parentId),
        eq(postComments.postId, postId),
        isNull(postComments.parentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

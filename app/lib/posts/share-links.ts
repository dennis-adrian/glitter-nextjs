/**
 * Unlisted share links: read access to one post for anyone holding the link.
 *
 * Server-only, never a server action — same reasoning as `posts/data.ts`. The
 * resolver below is the single place that decides whether a token opens a
 * post, so both the page and its `generateMetadata` go through it rather than
 * each re-deriving the rule. That seam has already produced one leak in this
 * feature (the working preview, fixed by self-gating the fetch), and metadata
 * runs first.
 *
 * One live link per post, stored as issued so the author can open the editor a
 * month later and re-send the same URL. See `postShareLinks` in db/schema.ts
 * for why this one is not hashed.
 */
import "server-only";

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { postShareLinks, posts } from "@/db/schema";
import {
  type PostWithRelations,
  type ShareLinkSummary,
} from "./definitions";

const SHARE_TOKEN_BYTES = 32;

/** 64 hex characters, from the same generator as `generateAccessToken`. */
export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("hex");
}

/**
 * Shape of a token as it arrives from the URL. Checked before the query so a
 * junk path segment costs a regex rather than a round-trip, and so the value
 * that reaches the log redactor always has the shape it looks for.
 */
const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/;

export function isWellFormedShareToken(value: string): boolean {
  return SHARE_TOKEN_RE.test(value);
}

export function shareUrlFor(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/blog/compartido/${token}`;
}

function summarize(row: {
  id: number;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
}): ShareLinkSummary {
  return {
    id: row.id,
    url: shareUrlFor(row.token),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    isExpired: row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
  };
}

/**
 * The post's current unrevoked link, expired or not, for the editor panel —
 * URL included, which is the whole point of storing the token as issued.
 *
 * Only ever called from a page that has already authorized the viewer to edit
 * the post; it does not authorize on its own.
 */
export async function fetchLiveShareLink(
  postId: number,
): Promise<ShareLinkSummary | null> {
  try {
    const [row] = await db
      .select({
        id: postShareLinks.id,
        token: postShareLinks.token,
        expiresAt: postShareLinks.expiresAt,
        createdAt: postShareLinks.createdAt,
      })
      .from(postShareLinks)
      .where(
        and(eq(postShareLinks.postId, postId), isNull(postShareLinks.revokedAt)),
      )
      .limit(1);
    return row ? summarize(row) : null;
  } catch (error) {
    console.error("fetchLiveShareLink", error);
    return null;
  }
}

/**
 * Resolve a token to the post it opens, or null.
 *
 * Deliberately ignores `status` and `audience`: an editor generated this link
 * precisely so someone could read a post the blog would otherwise refuse to
 * serve. `archived` is the one exception — retiring an article should not
 * leave a back door open to it.
 *
 * Expiry is evaluated here rather than in SQL so the boundary is the request's
 * own clock and the rule sits next to the one that reads it.
 */
export async function resolveSharedPost(
  token: string,
): Promise<PostWithRelations | null> {
  if (!isWellFormedShareToken(token)) return null;

  const [link] = await db
    .select({
      postId: postShareLinks.postId,
      expiresAt: postShareLinks.expiresAt,
    })
    .from(postShareLinks)
    .where(
      and(
        eq(postShareLinks.token, token),
        isNull(postShareLinks.revokedAt),
      ),
    )
    .limit(1);

  if (!link) return null;
  if (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const row = await db.query.posts.findFirst({
    where: eq(posts.id, link.postId),
    with: {
      author: {
        columns: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
          role: true,
        },
      },
      reviewer: {
        columns: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
          role: true,
        },
      },
      postCategories: { with: { category: true } },
      postTags: { with: { tag: true } },
    },
  });

  if (!row) return null;
  if (row.status === "archived") return null;

  return {
    ...row,
    categories: row.postCategories.map((pc) => pc.category),
    tags: row.postTags.map((pt) => pt.tag),
  };
}

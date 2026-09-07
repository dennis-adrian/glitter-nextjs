/**
 * Unlisted share links: read access to one post for anyone holding the token.
 *
 * Server-only, never a server action — same reasoning as `posts/data.ts`. The
 * resolver below is the single place that decides whether a token opens a
 * post, so both the page and its `generateMetadata` go through it rather than
 * each re-deriving the rule. That seam has already produced one leak in this
 * feature (the working preview, fixed by self-gating the fetch), and metadata
 * runs first.
 */
import "server-only";

import { createHash, randomBytes } from "crypto";
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
 * Digest stored in `post_share_links.tokenHash`. Plain SHA-256 rather than a
 * password hash: the input is 32 bytes of CSPRNG output, so there is nothing
 * to brute-force and no secret to manage, and being deterministic is what
 * keeps the lookup a single indexed equality.
 *
 * The consequence, identical to `programs/tokens.ts`: the raw token exists
 * only in the response that created it. Showing the link again means issuing
 * a fresh one, which is why `createShareLink` rotates.
 */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Shape of a token as it arrives from the URL. Checked before hashing so a
 * junk path segment costs a regex rather than a query.
 */
const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/;

export function isWellFormedShareToken(value: string): boolean {
  return SHARE_TOKEN_RE.test(value);
}

function summarize(row: {
  id: number;
  expiresAt: Date | null;
  createdAt: Date;
}): ShareLinkSummary {
  return {
    id: row.id,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    isExpired: row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
  };
}

/**
 * The post's current unrevoked link, expired or not, for the editor panel.
 * Never returns anything derived from the token — there is nothing stored to
 * derive it from.
 */
export async function fetchLiveShareLink(
  postId: number,
): Promise<ShareLinkSummary | null> {
  try {
    const [row] = await db
      .select({
        id: postShareLinks.id,
        expiresAt: postShareLinks.expiresAt,
        createdAt: postShareLinks.createdAt,
      })
      .from(postShareLinks)
      .where(
        and(
          eq(postShareLinks.postId, postId),
          isNull(postShareLinks.revokedAt),
        ),
      )
      .limit(1);
    return row ? summarize(row) : null;
  } catch (error) {
    console.error("fetchLiveShareLink", error);
    return null;
  }
}

/**
 * Resolve a raw token to the post it opens, or null.
 *
 * Deliberately ignores `status` and `audience`: an editor generated this link
 * precisely so that someone could read a post the blog would otherwise refuse
 * to serve. `archived` is the one exception — retiring an article should not
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
        eq(postShareLinks.tokenHash, hashShareToken(token)),
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
        },
      },
      reviewer: {
        columns: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
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

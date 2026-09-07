"use server";

import { and, eq, isNull } from "drizzle-orm";

import { canEditPost } from "@/app/lib/posts/helpers";
import {
  generateShareToken,
  hashShareToken,
} from "@/app/lib/posts/share-links";
import { shareLinkSchema } from "@/app/lib/posts/validate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { postShareLinks, posts } from "@/db/schema";

type ActionResult<T = void> =
  | ({ success: true } & (T extends void ? unknown : T))
  | { success: false; message: string };

function shareUrlFor(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/blog/compartido/${token}`;
}

/**
 * Whoever may edit the post may share it. Deliberately the same predicate the
 * editor itself uses rather than a new one: a link that reads an unpublished
 * article is exactly as sensitive as the edit screen that renders it, and one
 * predicate cannot drift from itself.
 */
async function authorizeShare(
  postId: number,
): Promise<
  { ok: true; profileId: number } | { ok: false; message: string }
> {
  const profile = await getCurrentUserProfile();
  if (!profile) return { ok: false, message: "Debes iniciar sesión" };

  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) return { ok: false, message: "Artículo no encontrado" };
  if (!canEditPost(profile, post)) {
    return { ok: false, message: "No puedes compartir este artículo" };
  }
  return { ok: true, profileId: profile.id };
}

/**
 * Issues a link, replacing whatever the post had.
 *
 * Rotation rather than reuse is forced by the storage rule: only the digest is
 * kept, so an existing link's raw token cannot be shown again. Revoking the
 * old row in the same transaction also keeps the "one live link per post"
 * unique index satisfied when the previous link had merely expired.
 *
 * The returned URL is the only time the raw token exists outside the
 * recipient's browser — the caller must show it to the author immediately.
 */
export async function createShareLink(
  postId: number,
  expiresAtInput?: unknown,
): Promise<ActionResult<{ url: string; expiresAt: string | null }>> {
  const auth = await authorizeShare(postId);
  if (!auth.ok) return { success: false, message: auth.message };

  const parsed = shareLinkSchema.safeParse({ expiresAt: expiresAtInput });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Fecha inválida",
    };
  }
  const expiresAt = parsed.data.expiresAt;

  const token = generateShareToken();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(postShareLinks)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(postShareLinks.postId, postId),
            isNull(postShareLinks.revokedAt),
          ),
        );

      await tx.insert(postShareLinks).values({
        postId,
        tokenHash: hashShareToken(token),
        expiresAt,
        createdByUserId: auth.profileId,
      });
    });
  } catch (error) {
    console.error("createShareLink", error);
    return { success: false, message: "No se pudo generar el enlace" };
  }

  return {
    success: true,
    url: shareUrlFor(token),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

/**
 * Kills the post's live link. Idempotent: revoking when there is nothing to
 * revoke succeeds, because the state the caller wanted is the state they get.
 */
export async function revokeShareLink(
  postId: number,
): Promise<ActionResult> {
  const auth = await authorizeShare(postId);
  if (!auth.ok) return { success: false, message: auth.message };

  try {
    await db
      .update(postShareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(postShareLinks.postId, postId),
          isNull(postShareLinks.revokedAt),
        ),
      );
  } catch (error) {
    console.error("revokeShareLink", error);
    return { success: false, message: "No se pudo revocar el enlace" };
  }

  return { success: true };
}

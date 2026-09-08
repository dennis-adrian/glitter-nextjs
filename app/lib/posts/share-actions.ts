"use server";

import { and, eq, isNull } from "drizzle-orm";

import { type ShareLinkSummary } from "@/app/lib/posts/definitions";
import { canEditPost } from "@/app/lib/posts/helpers";
import {
  fetchLiveShareLink,
  generateShareToken,
} from "@/app/lib/posts/share-links";
import { shareLinkSchema } from "@/app/lib/posts/validate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { postShareLinks, posts } from "@/db/schema";

type ActionResult<T = void> =
  | ({ success: true } & (T extends void ? unknown : T))
  | { success: false; message: string };

type LinkResult = ActionResult<{ link: ShareLinkSummary }>;

/**
 * Whoever may edit the post may share it. Deliberately the same predicate the
 * editor itself uses rather than a new one: a link that reads an unpublished
 * article is exactly as sensitive as the edit screen that renders it, and one
 * predicate cannot drift from itself.
 */
async function authorizeShare(
  postId: number,
): Promise<{ ok: true; profileId: number } | { ok: false; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile) return { ok: false, message: "Debes iniciar sesión" };

  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) return { ok: false, message: "Artículo no encontrado" };
  if (!canEditPost(profile, post)) {
    return { ok: false, message: "No puedes compartir este artículo" };
  }
  return { ok: true, profileId: profile.id };
}

function parseExpiry(
  input: unknown,
): { ok: true; value: Date | null } | { ok: false; message: string } {
  const parsed = shareLinkSchema.safeParse({ expiresAt: input });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Fecha inválida",
    };
  }
  return { ok: true, value: parsed.data.expiresAt };
}

/**
 * Reads back what the post now has. Every mutation below returns through here
 * so the panel's state comes from the database rather than from the caller's
 * idea of what it just wrote.
 */
async function currentLink(postId: number): Promise<LinkResult> {
  const link = await fetchLiveShareLink(postId);
  if (!link) {
    return { success: false, message: "No se pudo leer el enlace" };
  }
  return { success: true, link };
}

/**
 * Returns the post's link, creating one the first time.
 *
 * Idempotent on purpose: the link is meant to be re-sent, so asking for it
 * twice must hand back the same URL rather than quietly invalidating what the
 * author already gave people. Rotating is `regenerateShareLink`, which says so.
 */
export async function createShareLink(
  postId: number,
  expiresAtInput?: unknown,
): Promise<LinkResult> {
  const auth = await authorizeShare(postId);
  if (!auth.ok) return { success: false, message: auth.message };

  const existing = await fetchLiveShareLink(postId);
  if (existing) return { success: true, link: existing };

  const expiry = parseExpiry(expiresAtInput);
  if (!expiry.ok) return { success: false, message: expiry.message };

  try {
    await db.insert(postShareLinks).values({
      postId,
      token: generateShareToken(),
      expiresAt: expiry.value,
      createdByUserId: auth.profileId,
    });
  } catch (error) {
    console.error("createShareLink", error);
    return { success: false, message: "No se pudo generar el enlace" };
  }

  return await currentLink(postId);
}

/**
 * Changes when the existing link stops working, without changing the link.
 * Setting it to null makes it permanent again.
 */
export async function updateShareLinkExpiry(
  postId: number,
  expiresAtInput: unknown,
): Promise<LinkResult> {
  const auth = await authorizeShare(postId);
  if (!auth.ok) return { success: false, message: auth.message };

  const expiry = parseExpiry(expiresAtInput);
  if (!expiry.ok) return { success: false, message: expiry.message };

  try {
    const updated = await db
      .update(postShareLinks)
      .set({ expiresAt: expiry.value })
      .where(
        and(eq(postShareLinks.postId, postId), isNull(postShareLinks.revokedAt)),
      )
      .returning({ id: postShareLinks.id });

    if (updated.length === 0) {
      return { success: false, message: "Este artículo no tiene un enlace" };
    }
  } catch (error) {
    console.error("updateShareLinkExpiry", error);
    return { success: false, message: "No se pudo actualizar el enlace" };
  }

  return await currentLink(postId);
}

/**
 * Issues a different URL and kills the current one — for a link that reached
 * someone it should not have.
 *
 * Revoking inside the same transaction as the insert is what keeps the "one
 * live link per post" unique index satisfied. The expiry carries over: the
 * author is replacing a leaked address, not restating the terms.
 */
export async function regenerateShareLink(
  postId: number,
): Promise<LinkResult> {
  const auth = await authorizeShare(postId);
  if (!auth.ok) return { success: false, message: auth.message };

  const existing = await fetchLiveShareLink(postId);

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
        token: generateShareToken(),
        expiresAt: existing?.expiresAt ?? null,
        createdByUserId: auth.profileId,
      });
    });
  } catch (error) {
    console.error("regenerateShareLink", error);
    return { success: false, message: "No se pudo regenerar el enlace" };
  }

  return await currentLink(postId);
}

/**
 * Kills the post's link. Idempotent: revoking when there is nothing to revoke
 * succeeds, because the state the caller wanted is the state they get.
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
        and(eq(postShareLinks.postId, postId), isNull(postShareLinks.revokedAt)),
      );
  } catch (error) {
    console.error("revokeShareLink", error);
    return { success: false, message: "No se pudo revocar el enlace" };
  }

  return { success: true };
}

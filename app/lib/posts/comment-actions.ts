"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { canReadPost } from "@/app/lib/posts/audience";
import {
  findValidParent,
  isCommentRateLimited,
} from "@/app/lib/posts/comments";
import { isStaff } from "@/app/lib/posts/helpers";
import { commentSchema } from "@/app/lib/posts/validate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { postComments, posts } from "@/db/schema";

type ActionResult = { success: true } | { success: false; message: string };

/**
 * Posts a comment, or a reply to one.
 *
 * The audience gate is re-checked here rather than trusted from the page that
 * rendered the form: a restricted article's comment box is only shown to
 * people who can read it, but "was not rendered" is not a permission check.
 */
export async function addComment(
  postId: number,
  bodyInput: unknown,
  parentId?: number,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!profile) return { success: false, message: "Debes iniciar sesión" };

  const parsed = commentSchema.safeParse({ body: bodyInput });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Comentario inválido",
    };
  }

  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post || post.status !== "published") {
    return { success: false, message: "Artículo no encontrado" };
  }
  if (!canReadPost(profile, post)) {
    return { success: false, message: "Artículo no encontrado" };
  }
  /**
   * Checked here, not only in the page: the form being absent is a courtesy,
   * not a permission check. A closed thread keeps its existing comments, so
   * this refuses new ones without touching what is already there.
   */
  if (!post.commentsEnabled) {
    return {
      success: false,
      message: "Los comentarios están cerrados en este artículo",
    };
  }

  if (parentId !== undefined) {
    const parent = await findValidParent(postId, parentId);
    if (!parent) {
      return { success: false, message: "No se puede responder a eso" };
    }
  }

  if (await isCommentRateLimited(profile.id, postId)) {
    return {
      success: false,
      message: "Estás comentando demasiado rápido. Esperá un momento.",
    };
  }

  try {
    await db.insert(postComments).values({
      postId,
      userId: profile.id,
      body: parsed.data.body,
      parentId: parentId ?? null,
    });
    revalidatePath(`/blog/${post.slug}`, "page");
    return { success: true };
  } catch (error) {
    console.error("addComment", error);
    return { success: false, message: "No se pudo publicar el comentario" };
  }
}

/** Moderation. Hiding a parent hides its replies at render time. */
export async function hideComment(commentId: number): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!profile || !isStaff(profile.role)) {
    return { success: false, message: "No tienes permisos" };
  }

  try {
    const [row] = await db
      .update(postComments)
      .set({ isHidden: true, updatedAt: new Date() })
      .where(eq(postComments.id, commentId))
      .returning({ postId: postComments.postId });
    if (!row) return { success: false, message: "Comentario no encontrado" };

    const post = await db.query.posts.findFirst({
      where: eq(posts.id, row.postId),
    });
    if (post) revalidatePath(`/blog/${post.slug}`, "page");
    return { success: true };
  } catch (error) {
    console.error("hideComment", error);
    return { success: false, message: "No se pudo ocultar el comentario" };
  }
}

/**
 * Soft delete, by the comment's own author.
 *
 * The row stays so replies keep their anchor and the rate limit keeps counting
 * it — otherwise deleting your own comments would be a way to post without
 * limit.
 */
export async function deleteOwnComment(
  commentId: number,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!profile) return { success: false, message: "Debes iniciar sesión" };

  try {
    const [row] = await db
      .update(postComments)
      .set({ isHidden: true, updatedAt: new Date() })
      .where(
        and(
          eq(postComments.id, commentId),
          eq(postComments.userId, profile.id),
        ),
      )
      .returning({ postId: postComments.postId });
    if (!row) return { success: false, message: "Comentario no encontrado" };

    const post = await db.query.posts.findFirst({
      where: eq(posts.id, row.postId),
    });
    if (post) revalidatePath(`/blog/${post.slug}`, "page");
    return { success: true };
  } catch (error) {
    console.error("deleteOwnComment", error);
    return { success: false, message: "No se pudo borrar el comentario" };
  }
}

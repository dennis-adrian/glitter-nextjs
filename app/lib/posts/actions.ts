"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createBlankDraft } from "@/app/lib/posts/create-draft";
import { type PostStatus } from "@/app/lib/posts/definitions";
import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import {
	canEditPost,
	canPublishPosts,
	hasMeaningfulContent,
} from "@/app/lib/posts/helpers";
import { sanitizePostHtml } from "@/app/lib/posts/render";
import {
	ensureUniquePostCategorySlug,
	ensureUniquePostSlug,
	ensureUniquePostTagSlug,
	slugifyName,
} from "@/app/lib/posts/slug";
import {
	postAutosaveSchema,
	postCategoryFormSchema,
	postFormSchema,
	reviewNotesSchema,
} from "@/app/lib/posts/validate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
	postCategories,
	postCategoriesToPosts,
	postTags,
	postTagsToPosts,
	posts,
} from "@/db/schema";

type ActionResult<T = void> =
	| ({ success: true } & (T extends void ? unknown : T))
	| { success: false; message: string };

const PLACEHOLDER_SLUG_RE = /^borrador(-\d+)?$/;

export async function startNewPortalDraft(): Promise<never> {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");
	if (!(await canAuthorPosts(profile))) redirect("/portal/blog");
	const draft = await createBlankDraft(profile);
	redirect(`/portal/blog/${draft.id}/edit`);
}

export async function startNewDashboardDraft(): Promise<never> {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");
	if (!canPublishPosts(profile.role)) redirect("/dashboard/blog");
	const draft = await createBlankDraft(profile);
	redirect(`/dashboard/blog/${draft.id}/edit`);
}

function transitionPrecondition(existing: {
	title: string;
	content: unknown;
}): { ok: true } | { ok: false; message: string } {
	if (existing.title.trim().length < 3) {
		return { ok: false, message: "El título es obligatorio para publicar" };
	}
	if (!hasMeaningfulContent(existing.content)) {
		return { ok: false, message: "El contenido es obligatorio para publicar" };
	}
	return { ok: true };
}

function invalidatePosts(opts: { slugs?: string[] } = {}) {
	revalidatePath("/blog", "layout");
	revalidatePath("/dashboard/blog", "layout");
	revalidatePath("/portal/blog", "layout");
	for (const slug of opts.slugs ?? []) {
		revalidatePath(`/blog/${slug}`, "page");
	}
}

function invalidateCategories() {
	revalidatePath("/blog", "layout");
	revalidatePath("/dashboard/blog/categories", "page");
}

function invalidateTags() {
	revalidatePath("/blog", "layout");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function syncPostCategories(
	tx: Tx,
	postId: number,
	desiredIds: number[],
) {
	const existing = await tx
		.select({ categoryId: postCategoriesToPosts.categoryId })
		.from(postCategoriesToPosts)
		.where(eq(postCategoriesToPosts.postId, postId));
	const existingIds = new Set(existing.map((r) => r.categoryId));
	const desired = new Set(desiredIds);

	const toRemove = [...existingIds].filter((id) => !desired.has(id));
	const toInsert = [...desired].filter((id) => !existingIds.has(id));

	if (toRemove.length > 0) {
		await tx
			.delete(postCategoriesToPosts)
			.where(
				and(
					eq(postCategoriesToPosts.postId, postId),
					inArray(postCategoriesToPosts.categoryId, toRemove),
				),
			);
	}
	if (toInsert.length > 0) {
		await tx
			.insert(postCategoriesToPosts)
			.values(toInsert.map((categoryId) => ({ postId, categoryId })));
	}
}

async function syncPostTags(tx: Tx, postId: number, tagInputs: string[]) {
	const cleaned = Array.from(
		new Set(
			tagInputs
				.map((t) => t.trim())
				.filter((t) => t.length > 0)
				.map((t) => ({ name: t, slug: slugifyName(t) }))
				.filter((t) => t.slug.length > 0)
				.map((t) => JSON.stringify(t)),
		),
	).map((s) => JSON.parse(s) as { name: string; slug: string });

	const desiredIds: number[] = [];
	for (const input of cleaned) {
		const [existing] = await tx
			.select({ id: postTags.id })
			.from(postTags)
			.where(eq(postTags.slug, input.slug))
			.limit(1);
		if (existing) {
			desiredIds.push(existing.id);
			continue;
		}
		const uniqueSlug = await ensureUniquePostTagSlug(tx, input.slug);
		const [inserted] = await tx
			.insert(postTags)
			.values({ name: input.name, slug: uniqueSlug })
			.returning({ id: postTags.id });
		if (inserted) desiredIds.push(inserted.id);
	}

	const existingLinks = await tx
		.select({ tagId: postTagsToPosts.tagId })
		.from(postTagsToPosts)
		.where(eq(postTagsToPosts.postId, postId));
	const existingIds = new Set(existingLinks.map((r) => r.tagId));
	const desired = new Set(desiredIds);

	const toRemove = [...existingIds].filter((id) => !desired.has(id));
	const toInsert = [...desired].filter((id) => !existingIds.has(id));

	if (toRemove.length > 0) {
		await tx
			.delete(postTagsToPosts)
			.where(
				and(
					eq(postTagsToPosts.postId, postId),
					inArray(postTagsToPosts.tagId, toRemove),
				),
			);
	}
	if (toInsert.length > 0) {
		await tx
			.insert(postTagsToPosts)
			.values(toInsert.map((tagId) => ({ postId, tagId })));
	}
}

export async function updatePost(
	postId: number,
	input: unknown,
): Promise<ActionResult<{ id: number; slug: string }>> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };

	if (!canEditPost(profile, existing)) {
		return {
			success: false,
			message: "No puedes editar este artículo en su estado actual",
		};
	}

	const parsed = postFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}
	const data = parsed.data;

	try {
		const contentHtml = sanitizePostHtml(data.contentHtml);

		const result = await db.transaction(async (tx) => {
			const requestedSlug = (data.slug && data.slug.trim()) || data.title;
			const slug = await ensureUniquePostSlug(
				tx,
				slugifyName(requestedSlug),
				postId,
			);

			const willResetReview =
				existing.status === "rejected" && !canPublishPosts(profile.role);

			const [row] = await tx
				.update(posts)
				.set({
					title: data.title,
					slug,
					excerpt: data.excerpt || null,
					coverImageUrl: data.coverImageUrl || null,
					content: data.content,
					contentHtml,
					seoTitle: data.seoTitle || null,
					seoDescription: data.seoDescription || null,
					...(willResetReview
						? { status: "draft" as PostStatus, reviewerNotes: null }
						: {}),
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId))
				.returning({ id: posts.id, slug: posts.slug });

			if (!row) throw new Error("No se pudo actualizar el artículo");

			await syncPostCategories(tx, row.id, data.categoryIds);
			await syncPostTags(tx, row.id, data.tagInputs);
			return row;
		});

		invalidatePosts({ slugs: [existing.slug, result.slug] });
		invalidateTags();
		return { success: true, id: result.id, slug: result.slug };
	} catch (error) {
		console.error("updatePost", error);
		return { success: false, message: "Error al actualizar el artículo" };
	}
}

export async function autosaveDraft(
	postId: number,
	input: unknown,
): Promise<ActionResult<{ updatedAt: string }>> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };

	if (!canEditPost(profile, existing)) {
		return {
			success: false,
			message: "No puedes editar este artículo en su estado actual",
		};
	}

	const parsed = postAutosaveSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}
	const data = parsed.data;

	try {
		const contentHtml = sanitizePostHtml(data.contentHtml);

		const result = await db.transaction(async (tx) => {
			const trimmedSlug = data.slug?.trim() ?? "";
			const slug = trimmedSlug
				? await ensureUniquePostSlug(tx, slugifyName(trimmedSlug), postId)
				: existing.slug;

			const [row] = await tx
				.update(posts)
				.set({
					title: data.title,
					slug,
					excerpt: data.excerpt || null,
					coverImageUrl: data.coverImageUrl || null,
					content: data.content,
					contentHtml,
					seoTitle: data.seoTitle || null,
					seoDescription: data.seoDescription || null,
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId))
				.returning({ updatedAt: posts.updatedAt });

			if (!row) throw new Error("No se pudo guardar el artículo");

			await syncPostCategories(tx, postId, data.categoryIds);
			await syncPostTags(tx, postId, data.tagInputs);
			return row;
		});

		return { success: true, updatedAt: result.updatedAt.toISOString() };
	} catch (error) {
		console.error("autosaveDraft", error);
		return { success: false, message: "Error al guardar automáticamente" };
	}
}

export async function submitForReview(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.authorId !== profile.id) {
		return { success: false, message: "Solo el autor puede enviar a revisión" };
	}
	if (existing.status !== "draft") {
		return {
			success: false,
			message: "Solo se pueden enviar borradores a revisión",
		};
	}

	const precheck = transitionPrecondition(existing);
	if (!precheck.ok) return { success: false, message: precheck.message };

	try {
		await db.transaction(async (tx) => {
			const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
				? await ensureUniquePostSlug(
						tx,
						slugifyName(existing.title),
						postId,
					)
				: existing.slug;
			await tx
				.update(posts)
				.set({
					status: "submitted",
					slug,
					submittedAt: new Date(),
					reviewerNotes: null,
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId));
		});
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("submitForReview", error);
		return { success: false, message: "Error al enviar a revisión" };
	}
}

export async function approveAndPublish(
	postId: number,
): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "submitted") {
		return {
			success: false,
			message: "Solo se pueden aprobar artículos en revisión",
		};
	}

	const precheck = transitionPrecondition(existing);
	if (!precheck.ok) return { success: false, message: precheck.message };

	try {
		const finalSlug = await db.transaction(async (tx) => {
			const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
				? await ensureUniquePostSlug(
						tx,
						slugifyName(existing.title),
						postId,
					)
				: existing.slug;
			await tx
				.update(posts)
				.set({
					status: "published",
					slug,
					publishedAt: existing.publishedAt ?? new Date(),
					reviewerId: profile.id,
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId));
			return slug;
		});
		invalidatePosts({ slugs: [existing.slug, finalSlug] });
		return { success: true };
	} catch (error) {
		console.error("approveAndPublish", error);
		return { success: false, message: "Error al aprobar y publicar" };
	}
}

export async function directPublish(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };

	const allowed: PostStatus[] = ["draft", "approved", "archived"];
	if (!allowed.includes(existing.status)) {
		return {
			success: false,
			message: "El artículo no se puede publicar en su estado actual",
		};
	}

	const precheck = transitionPrecondition(existing);
	if (!precheck.ok) return { success: false, message: precheck.message };

	try {
		const finalSlug = await db.transaction(async (tx) => {
			const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
				? await ensureUniquePostSlug(
						tx,
						slugifyName(existing.title),
						postId,
					)
				: existing.slug;
			await tx
				.update(posts)
				.set({
					status: "published",
					slug,
					publishedAt: existing.publishedAt ?? new Date(),
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId));
			return slug;
		});
		invalidatePosts({ slugs: [existing.slug, finalSlug] });
		return { success: true };
	} catch (error) {
		console.error("directPublish", error);
		return { success: false, message: "Error al publicar" };
	}
}

export async function requestChanges(
	postId: number,
	notesInput: unknown,
): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const parsed = reviewNotesSchema.safeParse(notesInput);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "submitted") {
		return {
			success: false,
			message: "Solo se pueden solicitar cambios sobre artículos en revisión",
		};
	}

	try {
		await db
			.update(posts)
			.set({
				status: "draft",
				reviewerId: profile.id,
				reviewerNotes: parsed.data.notes,
				updatedAt: new Date(),
			})
			.where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("requestChanges", error);
		return { success: false, message: "Error al solicitar cambios" };
	}
}

export async function rejectPost(
	postId: number,
	notesInput: unknown,
): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const parsed = reviewNotesSchema.safeParse(notesInput);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "submitted") {
		return {
			success: false,
			message: "Solo se pueden rechazar artículos en revisión",
		};
	}

	try {
		await db
			.update(posts)
			.set({
				status: "rejected",
				reviewerId: profile.id,
				reviewerNotes: parsed.data.notes,
				updatedAt: new Date(),
			})
			.where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("rejectPost", error);
		return { success: false, message: "Error al rechazar el artículo" };
	}
}

export async function archivePost(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "published") {
		return {
			success: false,
			message: "Solo se pueden archivar artículos publicados",
		};
	}
	try {
		await db
			.update(posts)
			.set({ status: "archived", updatedAt: new Date() })
			.where(eq(posts.id, postId));
		invalidatePosts({ slugs: [existing.slug] });
		return { success: true };
	} catch (error) {
		console.error("archivePost", error);
		return { success: false, message: "Error al archivar el artículo" };
	}
}

export async function restorePost(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "archived") {
		return {
			success: false,
			message: "Solo se pueden restaurar artículos archivados",
		};
	}
	try {
		await db
			.update(posts)
			.set({
				status: "published",
				publishedAt: existing.publishedAt ?? new Date(),
				updatedAt: new Date(),
			})
			.where(eq(posts.id, postId));
		invalidatePosts({ slugs: [existing.slug] });
		return { success: true };
	} catch (error) {
		console.error("restorePost", error);
		return { success: false, message: "Error al restaurar el artículo" };
	}
}

export async function deleteDraft(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (existing.status !== "draft") {
		return {
			success: false,
			message: "Solo se pueden eliminar borradores",
		};
	}
	if (!canPublishPosts(profile.role) && existing.authorId !== profile.id) {
		return { success: false, message: "No puedes eliminar este artículo" };
	}

	try {
		await db.delete(posts).where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("deleteDraft", error);
		return { success: false, message: "Error al eliminar el borrador" };
	}
}

export async function createPostCategory(
	input: unknown,
): Promise<ActionResult<{ id: number; slug: string }>> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const parsed = postCategoryFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}
	try {
		const result = await db.transaction(async (tx) => {
			const slug = await ensureUniquePostCategorySlug(
				tx,
				slugifyName(parsed.data.name),
			);
			const [row] = await tx
				.insert(postCategories)
				.values({
					name: parsed.data.name,
					slug,
					description: parsed.data.description || null,
				})
				.returning({ id: postCategories.id, slug: postCategories.slug });
			if (!row) throw new Error("No se pudo crear la categoría");
			return row;
		});
		invalidateCategories();
		return { success: true, id: result.id, slug: result.slug };
	} catch (error) {
		console.error("createPostCategory", error);
		return { success: false, message: "Error al crear la categoría" };
	}
}

export async function updatePostCategory(
	id: number,
	input: unknown,
): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}
	const parsed = postCategoryFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			message: parsed.error.issues[0]?.message ?? "Datos inválidos",
		};
	}
	try {
		await db.transaction(async (tx) => {
			const slug = await ensureUniquePostCategorySlug(
				tx,
				slugifyName(parsed.data.name),
				id,
			);
			await tx
				.update(postCategories)
				.set({
					name: parsed.data.name,
					slug,
					description: parsed.data.description || null,
					updatedAt: new Date(),
				})
				.where(eq(postCategories.id, id));
		});
		invalidateCategories();
		return { success: true };
	} catch (error) {
		console.error("updatePostCategory", error);
		return { success: false, message: "Error al actualizar la categoría" };
	}
}

export async function deletePostCategory(id: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}

	const [link] = await db
		.select({ postId: postCategoriesToPosts.postId })
		.from(postCategoriesToPosts)
		.where(eq(postCategoriesToPosts.categoryId, id))
		.limit(1);
	if (link) {
		return {
			success: false,
			message: "No se puede eliminar: hay artículos asociados a esta categoría",
		};
	}

	try {
		await db.delete(postCategories).where(eq(postCategories.id, id));
		invalidateCategories();
		return { success: true };
	} catch (error) {
		console.error("deletePostCategory", error);
		return { success: false, message: "Error al eliminar la categoría" };
	}
}

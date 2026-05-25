"use server";

import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createBlankDraft } from "@/app/lib/posts/create-draft";
import { type PostStatus } from "@/app/lib/posts/definitions";
import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import {
	canArchivePost,
	canDeletePost,
	canEditPost,
	canPublishPosts,
	hasMeaningfulContent,
	usesWorkingCopy,
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

const CLEAR_WORKING = {
	workingTitle: null,
	workingSlug: null,
	workingExcerpt: null,
	workingCoverImageUrl: null,
	workingContent: null,
	workingContentHtml: null,
	workingSeoTitle: null,
	workingSeoDescription: null,
	workingCategoryIds: null,
	workingTagInputs: null,
	workingUpdatedAt: null,
	workingSubmittedAt: null,
	workingReviewerNotes: null,
	workingReviewerId: null,
} as const;

async function applyWorkingToMain(
	tx: Tx,
	existing: typeof posts.$inferSelect,
): Promise<{ slug: string }> {
	const desiredSlugInput =
		existing.workingSlug?.trim() || existing.workingTitle;
	const slugBase =
		desiredSlugInput && desiredSlugInput.trim().length > 0
			? slugifyName(desiredSlugInput)
			: existing.slug;
	const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
		? await ensureUniquePostSlug(tx, slugBase, existing.id)
		: existing.workingSlug && existing.workingSlug.trim().length > 0
			? await ensureUniquePostSlug(tx, slugBase, existing.id)
			: existing.slug;

	await tx
		.update(posts)
		.set({
			title: existing.workingTitle ?? existing.title,
			slug,
			excerpt: existing.workingExcerpt,
			coverImageUrl: existing.workingCoverImageUrl,
			content: existing.workingContent ?? existing.content,
			contentHtml: existing.workingContentHtml ?? existing.contentHtml,
			seoTitle: existing.workingSeoTitle,
			seoDescription: existing.workingSeoDescription,
			updatedAt: new Date(),
			...CLEAR_WORKING,
		})
		.where(eq(posts.id, existing.id));

	if (existing.workingCategoryIds) {
		await syncPostCategories(tx, existing.id, existing.workingCategoryIds);
	}
	if (existing.workingTagInputs) {
		await syncPostTags(tx, existing.id, existing.workingTagInputs);
	}

	return { slug };
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
		const stage = usesWorkingCopy(existing);

		const result = await db.transaction(async (tx) => {
			if (stage) {
				const now = new Date();
				const [row] = await tx
					.update(posts)
					.set({
						workingTitle: data.title,
						workingSlug: data.slug?.trim() || null,
						workingExcerpt: data.excerpt || null,
						workingCoverImageUrl: data.coverImageUrl || null,
						workingContent: data.content,
						workingContentHtml: contentHtml,
						workingSeoTitle: data.seoTitle || null,
						workingSeoDescription: data.seoDescription || null,
						workingCategoryIds: data.categoryIds,
						workingTagInputs: data.tagInputs,
						workingUpdatedAt: now,
						workingSubmittedAt: null,
						workingReviewerNotes: null,
						workingReviewerId: null,
					})
					.where(eq(posts.id, postId))
					.returning({ updatedAt: posts.workingUpdatedAt });
				if (!row) throw new Error("No se pudo guardar el artículo");
				return { updatedAt: row.updatedAt ?? now };
			}

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

	if (existing.status === "draft") {
		if (existing.authorId !== profile.id) {
			return {
				success: false,
				message: "Solo el autor puede enviar a revisión",
			};
		}

		const precheck = transitionPrecondition(existing);
		if (!precheck.ok) return { success: false, message: precheck.message };

		try {
			await db.transaction(async (tx) => {
				const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
					? await ensureUniquePostSlug(tx, slugifyName(existing.title), postId)
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

	if (!canEditPost(profile, existing)) {
		return {
			success: false,
			message: "No puedes enviar este artículo a revisión",
		};
	}
	if (existing.workingUpdatedAt === null) {
		return {
			success: false,
			message: "No hay cambios pendientes para enviar a revisión",
		};
	}

	const stagedPrecheck = transitionPrecondition({
		title: existing.workingTitle ?? existing.title,
		content: existing.workingContent ?? existing.content,
	});
	if (!stagedPrecheck.ok) {
		return { success: false, message: stagedPrecheck.message };
	}

	try {
		await db
			.update(posts)
			.set({
				workingSubmittedAt: new Date(),
				workingReviewerNotes: null,
				workingReviewerId: null,
			})
			.where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("submitForReview (working)", error);
		return { success: false, message: "Error al enviar a revisión" };
	}
}

export async function approveAndPublish(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile || !canPublishPosts(profile.role)) {
		return { success: false, message: "No tienes permisos" };
	}

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };

	const hasStaged = existing.workingUpdatedAt !== null;
	if (!hasStaged && existing.status !== "submitted") {
		return {
			success: false,
			message: "Solo se pueden aprobar artículos en revisión",
		};
	}

	const effectiveTitle = existing.workingTitle ?? existing.title;
	const effectiveContent = existing.workingContent ?? existing.content;
	const precheck = transitionPrecondition({
		title: effectiveTitle,
		content: effectiveContent,
	});
	if (!precheck.ok) return { success: false, message: precheck.message };

	try {
		const finalSlug = await db.transaction(async (tx) => {
			if (hasStaged) {
				const { slug } = await applyWorkingToMain(tx, existing);
				await tx
					.update(posts)
					.set({
						status: "published",
						publishedAt: existing.publishedAt ?? new Date(),
						reviewerId: profile.id,
						updatedAt: new Date(),
					})
					.where(eq(posts.id, postId));
				return slug;
			}

			const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
				? await ensureUniquePostSlug(tx, slugifyName(existing.title), postId)
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

	const hasStaged = existing.workingUpdatedAt !== null;
	const allowed: PostStatus[] = ["draft", "approved", "archived"];
	if (!hasStaged && !allowed.includes(existing.status)) {
		return {
			success: false,
			message: "El artículo no se puede publicar en su estado actual",
		};
	}

	const effectiveTitle = existing.workingTitle ?? existing.title;
	const effectiveContent = existing.workingContent ?? existing.content;
	const precheck = transitionPrecondition({
		title: effectiveTitle,
		content: effectiveContent,
	});
	if (!precheck.ok) return { success: false, message: precheck.message };

	try {
		const finalSlug = await db.transaction(async (tx) => {
			if (hasStaged) {
				const { slug } = await applyWorkingToMain(tx, existing);
				await tx
					.update(posts)
					.set({
						status: "published",
						publishedAt: existing.publishedAt ?? new Date(),
						updatedAt: new Date(),
					})
					.where(eq(posts.id, postId));
				return slug;
			}

			const slug = PLACEHOLDER_SLUG_RE.test(existing.slug)
				? await ensureUniquePostSlug(tx, slugifyName(existing.title), postId)
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

	const stagedPendingReview =
		existing.workingUpdatedAt !== null &&
		existing.workingSubmittedAt !== null &&
		existing.workingReviewerNotes === null;

	if (!stagedPendingReview && existing.status !== "submitted") {
		return {
			success: false,
			message: "Solo se pueden solicitar cambios sobre artículos en revisión",
		};
	}

	try {
		if (stagedPendingReview) {
			await db
				.update(posts)
				.set({
					workingReviewerId: profile.id,
					workingReviewerNotes: parsed.data.notes,
				})
				.where(eq(posts.id, postId));
		} else {
			await db
				.update(posts)
				.set({
					status: "draft",
					reviewerId: profile.id,
					reviewerNotes: parsed.data.notes,
					updatedAt: new Date(),
				})
				.where(eq(posts.id, postId));
		}
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
	if (!profile) return { success: false, message: "Debes iniciar sesión" };
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
	if (!canArchivePost(profile, existing)) {
		return { success: false, message: "No puedes archivar este artículo" };
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

export async function discardWorkingCopy(
	postId: number,
): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (!canEditPost(profile, existing)) {
		return { success: false, message: "No puedes descartar estos cambios" };
	}
	if (existing.workingUpdatedAt === null) {
		return { success: true };
	}

	try {
		await db.update(posts).set(CLEAR_WORKING).where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("discardWorkingCopy", error);
		return { success: false, message: "Error al descartar los cambios" };
	}
}

export async function deletePost(postId: number): Promise<ActionResult> {
	const profile = await getCurrentUserProfile();
	if (!profile) return { success: false, message: "Debes iniciar sesión" };

	const existing = await db.query.posts.findFirst({
		where: eq(posts.id, postId),
	});
	if (!existing) return { success: false, message: "Artículo no encontrado" };
	if (!canDeletePost(profile, existing)) {
		return {
			success: false,
			message: "No puedes eliminar un artículo que ya fue publicado",
		};
	}

	try {
		await db.delete(posts).where(eq(posts.id, postId));
		invalidatePosts();
		return { success: true };
	} catch (error) {
		console.error("deletePost", error);
		return { success: false, message: "Error al eliminar el artículo" };
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
			const [row] = await tx
				.update(postCategories)
				.set({
					name: parsed.data.name,
					slug,
					description: parsed.data.description || null,
					updatedAt: new Date(),
				})
				.where(eq(postCategories.id, id))
				.returning({ id: postCategories.id });
			if (!row) {
				throw new Error("Categoría no encontrada");
			}
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

	try {
		// Atomic conditional delete: only removes the category row when no
		// post still links to it. Avoids the TOCTOU race between the prior
		// "any links?" select and the delete, which the ON DELETE CASCADE
		// FK on post_categories_to_posts.category_id would otherwise hide
		// by silently stripping the category from any post that raced in.
		const deleted = await db
			.delete(postCategories)
			.where(
				and(
					eq(postCategories.id, id),
					notExists(
						db
							.select({ one: sql`1` })
							.from(postCategoriesToPosts)
							.where(eq(postCategoriesToPosts.categoryId, id)),
					),
				),
			)
			.returning({ id: postCategories.id });
		if (deleted.length === 0) {
			return {
				success: false,
				message:
					"No se puede eliminar: hay artículos asociados a esta categoría",
			};
		}
		invalidateCategories();
		return { success: true };
	} catch (error) {
		console.error("deletePostCategory", error);
		return { success: false, message: "Error al eliminar la categoría" };
	}
}

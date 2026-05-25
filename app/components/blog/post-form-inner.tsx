"use client";

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { es as esDictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import CoverImageToggle from "@/app/components/blog/cover-image-toggle";
import EditorTopToolbar from "@/app/components/blog/editor-top-toolbar";
import PostEditor from "@/app/components/blog/post-editor";
import PostSettingsSheet from "@/app/components/blog/post-settings-sheet";
import PostStatusBadge from "@/app/components/blog/post-status-badge";
import RequestChangesDialog from "@/app/components/blog/request-changes-dialog";
import ReviewerNotesBanner from "@/app/components/blog/reviewer-notes-banner";
import SaveIndicator, {
	type SaveStatus,
} from "@/app/components/blog/save-indicator";
import TitleTextarea from "@/app/components/blog/title-textarea";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import {
	approveAndPublish,
	autosaveDraft,
	directPublish,
	discardWorkingCopy,
	submitForReview,
} from "@/app/lib/posts/actions";
import type {
	PostCategoryRow,
	PostStatus,
	PostWithRelations,
} from "@/app/lib/posts/definitions";
import { hasMeaningfulContent, usesWorkingCopy } from "@/app/lib/posts/helpers";
import { slugifyName } from "@/app/lib/posts/slug";
import { postFormSchema } from "@/app/lib/posts/validate";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Surface = "dashboard" | "portal";

export type PostFormProps = {
	surface: Surface;
	post: PostWithRelations;
	categoryOptions: PostCategoryRow[];
	canPublish: boolean;
};

const EMPTY_DOC = [{ type: "paragraph", content: [] }];

// Hide upload-only blocks we don't yet support (no UploadThing endpoints for
// video/audio/generic files). Removes them from the slash menu, side menu,
// and HTML parser automatically.
const {
	audio: _bnAudio,
	video: _bnVideo,
	file: _bnFile,
	...allowedBlockSpecs
} = defaultBlockSpecs;
const blogEditorSchema = BlockNoteSchema.create({
	blockSpecs: allowedBlockSpecs,
});

export default function PostFormInner({
	surface,
	post,
	categoryOptions,
	canPublish,
}: PostFormProps) {
	const [submitting, setSubmitting] = useState(false);

	const propHasWork = post.workingUpdatedAt !== null;
	const [localHasWork, setLocalHasWork] = useState(propHasWork);
	const hasWork = propHasWork || localHasWork;
	const workingInReview =
		post.workingSubmittedAt !== null && post.workingReviewerNotes === null;
	const workingHasRejection = post.workingReviewerNotes !== null;

	const effectiveTitle = propHasWork
		? (post.workingTitle ?? post.title)
		: post.title;
	const effectiveSlug = propHasWork
		? (post.workingSlug ?? post.slug)
		: post.slug;
	const effectiveExcerpt = propHasWork
		? (post.workingExcerpt ?? "")
		: (post.excerpt ?? "");
	const effectiveCoverImageUrl = propHasWork
		? post.workingCoverImageUrl
		: post.coverImageUrl;
	const effectiveContent = propHasWork
		? ((post.workingContent ?? post.content) as unknown)
		: (post.content as unknown);
	const effectiveContentHtml = propHasWork
		? (post.workingContentHtml ?? post.contentHtml ?? "")
		: (post.contentHtml ?? "");
	const effectiveSeoTitle = propHasWork
		? (post.workingSeoTitle ?? "")
		: (post.seoTitle ?? "");
	const effectiveSeoDescription = propHasWork
		? (post.workingSeoDescription ?? "")
		: (post.seoDescription ?? "");
	const effectiveCategoryIds =
		propHasWork && post.workingCategoryIds
			? post.workingCategoryIds
			: post.categories.map((c) => c.id);
	const effectiveTagInputs =
		propHasWork && post.workingTagInputs
			? post.workingTagInputs
			: post.tags.map((t) => t.name);

	const [coverUrl, setCoverUrl] = useState<string | null>(
		effectiveCoverImageUrl ?? null,
	);
	const [content, setContent] = useState<unknown>(
		effectiveContent ?? EMPTY_DOC,
	);
	const [contentHtml, setContentHtml] = useState<string>(effectiveContentHtml);
	const [categoryIds, setCategoryIds] =
		useState<number[]>(effectiveCategoryIds);
	const [tagInputs, setTagInputs] = useState<string[]>(effectiveTagInputs);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [saveError, setSaveError] = useState<string | undefined>();

	const { startUpload } = useUploadThing("blogImage");
	const uploadFile = useCallback(
		async (file: File): Promise<string> => {
			const result = await startUpload([file]);
			const url = result?.[0]?.serverData?.imageUrl;
			if (!url) throw new Error("No se pudo subir la imagen");
			return url;
		},
		[startUpload],
	);

	const editor = useCreateBlockNote({
		schema: blogEditorSchema,
		// biome-ignore lint/suspicious/noExplicitAny: BlockNote initial content is loosely typed
		initialContent: (effectiveContent as any) ?? undefined,
		dictionary: esDictionary,
		uploadFile,
	});

	const lastSerializedRef = useRef<string>("");

	const form = useForm({
		resolver: zodResolver(postFormSchema),
		defaultValues: {
			title: effectiveTitle,
			slug: effectiveSlug,
			excerpt: effectiveExcerpt,
			coverImageUrl: effectiveCoverImageUrl ?? "",
			seoTitle: effectiveSeoTitle,
			seoDescription: effectiveSeoDescription,
			content: effectiveContent ?? EMPTY_DOC,
			categoryIds: effectiveCategoryIds,
			tagInputs: effectiveTagInputs,
		},
	});

	const watchedValues = useWatch({ control: form.control });

	const status: PostStatus = post.status;
	const editorReadOnly = workingInReview && !canPublish;
	const autosaveEligible = !editorReadOnly;

	const titleValue: string = watchedValues?.title ?? effectiveTitle;
	const canTransition =
		titleValue.trim().length >= 3 && hasMeaningfulContent(content);
	const transitionDisabledTitle = canTransition
		? undefined
		: "Agrega un título y contenido para continuar";

	const buildPayload = useCallback(() => {
		const v = form.getValues();
		return {
			title: v.title,
			slug: v.slug || slugifyName(v.title || "borrador"),
			excerpt: v.excerpt,
			coverImageUrl: coverUrl ?? "",
			seoTitle: v.seoTitle,
			seoDescription: v.seoDescription,
			content,
			contentHtml,
			categoryIds,
			tagInputs,
		};
	}, [form, coverUrl, content, contentHtml, categoryIds, tagInputs]);

	const lastSavedRef = useRef<string>("");
	const versionRef = useRef(0);
	const userInteractedRef = useRef(false);

	useEffect(() => {
		const flag = () => {
			userInteractedRef.current = true;
		};
		// Defer attaching so the editor's mount-time DOM mutations (BlockNote
		// regenerating its tree, focus syncs, etc.) don't count as interactions.
		const t = window.setTimeout(() => {
			window.addEventListener("keydown", flag, true);
			window.addEventListener("input", flag, true);
			window.addEventListener("paste", flag, true);
			window.addEventListener("pointerdown", flag, true);
		}, 250);
		return () => {
			window.clearTimeout(t);
			window.removeEventListener("keydown", flag, true);
			window.removeEventListener("input", flag, true);
			window.removeEventListener("paste", flag, true);
			window.removeEventListener("pointerdown", flag, true);
		};
	}, []);

	useEffect(() => {
		lastSavedRef.current = JSON.stringify({
			title: effectiveTitle,
			slug: effectiveSlug,
			excerpt: effectiveExcerpt,
			coverImageUrl: effectiveCoverImageUrl ?? "",
			seoTitle: effectiveSeoTitle,
			seoDescription: effectiveSeoDescription,
			content: effectiveContent ?? EMPTY_DOC,
			contentHtml: effectiveContentHtml,
			categoryIds: effectiveCategoryIds,
			tagInputs: effectiveTagInputs,
		});
	}, [
		effectiveTitle,
		effectiveSlug,
		effectiveExcerpt,
		effectiveCoverImageUrl,
		effectiveSeoTitle,
		effectiveSeoDescription,
		effectiveContent,
		effectiveContentHtml,
		effectiveCategoryIds,
		effectiveTagInputs,
	]);

	useEffect(() => {
		if (!autosaveEligible) return;
		if (!userInteractedRef.current) return;
		const payload = buildPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedRef.current) return;

		const version = ++versionRef.current;
		setSaveStatus("saving");

		const timeout = setTimeout(async () => {
			if (versionRef.current !== version) return;
			try {
				const result = await autosaveDraft(post.id, payload);
				if (versionRef.current !== version) return;
				if (result.success) {
					lastSavedRef.current = serialized;
					setSaveStatus("saved");
					setSaveError(undefined);
					if (usesWorkingCopy(post)) setLocalHasWork(true);
				} else {
					setSaveStatus("error");
					setSaveError(result.message);
				}
			} catch (error) {
				if (versionRef.current !== version) return;
				console.error("autosaveDraft", error);
				setSaveStatus("error");
				setSaveError(error instanceof Error ? error.message : String(error));
			}
		}, 1500);

		return () => clearTimeout(timeout);
	}, [
		autosaveEligible,
		post.id,
		buildPayload,
		watchedValues,
		content,
		contentHtml,
		coverUrl,
		categoryIds,
		tagInputs,
	]);

	async function persistLatest(): Promise<boolean> {
		const payload = buildPayload();
		const res = await autosaveDraft(post.id, payload);
		if (!res.success) {
			toast.error(res.message);
			return false;
		}
		lastSavedRef.current = JSON.stringify(payload);
		setSaveStatus("saved");
		if (usesWorkingCopy(post)) setLocalHasWork(true);
		return true;
	}

	async function handleSubmitForReview() {
		setSubmitting(true);
		try {
			if (!(await persistLatest())) return;
			const res = await submitForReview(post.id);
			if (res.success) {
				toast.success(
					hasWork
						? "Cambios enviados a revisión"
						: "Artículo enviado a revisión",
				);
				window.location.reload();
			} else {
				toast.error(res.message);
			}
		} finally {
			setSubmitting(false);
		}
	}

	async function handlePublish() {
		setSubmitting(true);
		try {
			if (!(await persistLatest())) return;
			const res =
				post.status === "submitted" || workingInReview
					? await approveAndPublish(post.id)
					: await directPublish(post.id);
			if (res.success) {
				toast.success("Artículo publicado");
				window.location.reload();
			} else {
				toast.error(res.message);
			}
		} finally {
			setSubmitting(false);
		}
	}

	async function handleDiscard() {
		setSubmitting(true);
		try {
			const res = await discardWorkingCopy(post.id);
			if (res.success) {
				toast.success("Cambios descartados");
				window.location.reload();
			} else {
				toast.error(res.message);
			}
		} finally {
			setSubmitting(false);
		}
	}

	const initialEmitSyncedRef = useRef(false);

	useEffect(() => {
		const emit = async () => {
			const blocks = editor.document;
			const serialized = JSON.stringify(blocks);
			if (serialized === lastSerializedRef.current) return;
			lastSerializedRef.current = serialized;
			const html = await editor.blocksToFullHTML(blocks);
			setContent(blocks);
			setContentHtml(html);

			if (!initialEmitSyncedRef.current) {
				initialEmitSyncedRef.current = true;
				// BlockNote may regenerate contentHtml/blocks slightly differently
				// from what was persisted. Re-baseline lastSavedRef so the autosave
				// effect doesn't treat this regen as a user edit (which would
				// spuriously flip the working-copy badge on every page load).
				const v = form.getValues();
				lastSavedRef.current = JSON.stringify({
					title: v.title,
					slug: v.slug || slugifyName(v.title || "borrador"),
					excerpt: v.excerpt,
					coverImageUrl: coverUrl ?? "",
					seoTitle: v.seoTitle,
					seoDescription: v.seoDescription,
					content: blocks,
					contentHtml: html,
					categoryIds,
					tagInputs,
				});
			}
		};
		void emit();
		const off = editor.onChange(() => {
			void emit();
		});
		return () => {
			if (typeof off === "function") off();
		};
		// `coverUrl` / `categoryIds` / `tagInputs` are captured from the initial mount
		// for the baseline-sync above; we intentionally don't rerun on their changes.
		// biome-ignore lint/correctness/useExhaustiveDependencies: see comment
	}, [editor]);

	const showSubmitForReview =
		surface === "portal" &&
		!workingInReview &&
		((status === "draft" && !hasWork) || hasWork);

	const showApproveAndPublish =
		canPublish && ((status === "submitted" && !hasWork) || workingInReview);

	const showDirectPublish =
		canPublish &&
		!showApproveAndPublish &&
		(status === "draft" ||
			status === "approved" ||
			status === "archived" ||
			(hasWork && !workingInReview));

	const showRequestChanges =
		canPublish && (workingInReview || (status === "submitted" && !hasWork));

	const showDiscard = hasWork && !workingInReview;
	const showPreview = hasWork && post.slug;

	const submitLabel = hasWork
		? workingHasRejection
			? "Re-enviar a revisión"
			: "Enviar cambios a revisión"
		: "Enviar a revisión";

	const publishLabel = showApproveAndPublish
		? "Aprobar y publicar"
		: hasWork
			? "Publicar cambios"
			: "Publicar";

	const workingBadgeLabel = workingInReview
		? "Cambios en revisión"
		: workingHasRejection
			? "Cambios con observaciones"
			: "Cambios sin publicar";

	const workingBadgeClass = workingInReview
		? "border-sky-200 bg-sky-50 text-sky-700"
		: workingHasRejection
			? "border-amber-200 bg-amber-50 text-amber-700"
			: "border-slate-200 bg-slate-50 text-slate-700";

	return (
		<Form {...form}>
			<form
				onSubmit={(e) => e.preventDefault()}
				className="flex flex-col gap-4 pb-24"
			>
				<div className="sticky top-16 md:top-20 z-40 -mx-4 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
					<div className="px-4 py-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Button asChild variant="ghost" size="icon" aria-label="Volver">
									<Link
										href={
											surface === "dashboard"
												? "/dashboard/blog"
												: "/portal/blog"
										}
									>
										<ArrowLeft className="h-4 w-4" />
									</Link>
								</Button>
								<PostStatusBadge status={status} />
								{(workingInReview || workingHasRejection) && (
									<span
										className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${workingBadgeClass}`}
									>
										{workingBadgeLabel}
									</span>
								)}
								{autosaveEligible && (
									<SaveIndicator status={saveStatus} errorMessage={saveError} />
								)}
							</div>
							<div className="flex flex-wrap gap-2">
								{showPreview && (
									<Button asChild variant="outline">
										<Link
											href={`/blog/${post.slug}?preview=working`}
											target="_blank"
										>
											<Eye className="mr-1 h-4 w-4" />
											Vista previa
										</Link>
									</Button>
								)}
								{showDiscard && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												type="button"
												variant="outline"
												disabled={submitting}
											>
												<Trash2 className="mr-1 h-4 w-4" />
												Descartar cambios
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													¿Descartar los cambios sin publicar?
												</AlertDialogTitle>
												<AlertDialogDescription>
													El artículo volverá a su versión actual publicada.
													Esta acción no se puede deshacer.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel disabled={submitting}>
													Cancelar
												</AlertDialogCancel>
												<AlertDialogAction
													onClick={handleDiscard}
													disabled={submitting}
													className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												>
													Descartar
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
								{showRequestChanges && (
									<RequestChangesDialog
										postId={post.id}
										disabled={submitting}
										onDone={() => window.location.reload()}
									/>
								)}
								{showSubmitForReview && (
									<Button
										type="button"
										className="bg-amber-600 hover:bg-amber-700"
										onClick={handleSubmitForReview}
										disabled={submitting || editorReadOnly || !canTransition}
										title={transitionDisabledTitle}
									>
										{submitLabel}
									</Button>
								)}
								{(showApproveAndPublish || showDirectPublish) && (
									<Button
										type="button"
										className="bg-primary hover:bg-primary/90"
										onClick={handlePublish}
										disabled={submitting || !canTransition}
										title={transitionDisabledTitle}
									>
										{publishLabel}
									</Button>
								)}
							</div>
						</div>
					</div>
					<EditorTopToolbar editor={editor} readOnly={editorReadOnly} />
				</div>

				{workingHasRejection ? (
					<ReviewerNotesBanner
						status={post.status}
						notes={post.workingReviewerNotes}
						scope="working"
					/>
				) : (
					<ReviewerNotesBanner
						status={post.status}
						notes={post.reviewerNotes}
					/>
				)}

				<div className="mx-auto w-full max-w-3xl space-y-4 pt-2">
					<CoverImageToggle
						value={coverUrl}
						onChange={setCoverUrl}
						disabled={editorReadOnly}
					/>

					<TitleTextarea
						register={form.register("title")}
						value={titleValue}
						disabled={editorReadOnly}
					/>
					{form.formState.errors.title && (
						<p className="px-[54px] text-sm text-destructive">
							{form.formState.errors.title.message as string}
						</p>
					)}

					<PostEditor editor={editor} readOnly={editorReadOnly} />
				</div>

				<PostSettingsSheet
					formControl={form.control}
					categoryOptions={categoryOptions}
					categoryIds={categoryIds}
					onCategoryIdsChange={setCategoryIds}
					tagInputs={tagInputs}
					onTagInputsChange={setTagInputs}
				/>
			</form>
		</Form>
	);
}

"use client";

import { es as esDictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import CoverImageToggle from "@/app/components/blog/cover-image-toggle";
import EditorTopToolbar from "@/app/components/blog/editor-top-toolbar";
import PostEditor from "@/app/components/blog/post-editor";
import PostSettingsSheet from "@/app/components/blog/post-settings-sheet";
import PostStatusBadge from "@/app/components/blog/post-status-badge";
import ReviewerNotesBanner from "@/app/components/blog/reviewer-notes-banner";
import SaveIndicator, {
	type SaveStatus,
} from "@/app/components/blog/save-indicator";
import TitleTextarea from "@/app/components/blog/title-textarea";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import {
	approveAndPublish,
	autosaveDraft,
	directPublish,
	submitForReview,
} from "@/app/lib/posts/actions";
import type {
	PostCategoryRow,
	PostStatus,
	PostWithRelations,
} from "@/app/lib/posts/definitions";
import { hasMeaningfulContent } from "@/app/lib/posts/helpers";
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

export default function PostFormInner({
	surface,
	post,
	categoryOptions,
	canPublish,
}: PostFormProps) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [coverUrl, setCoverUrl] = useState<string | null>(
		post.coverImageUrl ?? null,
	);
	const [content, setContent] = useState<unknown>(post.content ?? EMPTY_DOC);
	const [contentHtml, setContentHtml] = useState<string>(
		post.contentHtml ?? "",
	);
	const [categoryIds, setCategoryIds] = useState<number[]>(
		post.categories.map((c) => c.id),
	);
	const [tagInputs, setTagInputs] = useState<string[]>(
		post.tags.map((t) => t.name),
	);
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
		// biome-ignore lint/suspicious/noExplicitAny: BlockNote initial content is loosely typed
		initialContent: (post.content as any) ?? undefined,
		dictionary: esDictionary,
		uploadFile,
	});

	const lastSerializedRef = useRef<string>("");

	const form = useForm({
		resolver: zodResolver(postFormSchema),
		defaultValues: {
			title: post.title,
			slug: post.slug,
			excerpt: post.excerpt ?? "",
			coverImageUrl: post.coverImageUrl ?? "",
			seoTitle: post.seoTitle ?? "",
			seoDescription: post.seoDescription ?? "",
			content: post.content ?? EMPTY_DOC,
			categoryIds: post.categories.map((c) => c.id),
			tagInputs: post.tags.map((t) => t.name),
		},
	});

	const watchedValues = useWatch({ control: form.control });

	const status: PostStatus = post.status;
	const editorReadOnly = status === "submitted" || status === "approved";
	const autosaveEligible =
		!editorReadOnly && (status === "draft" || status === "rejected");

	const titleValue: string = watchedValues?.title ?? post.title;
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

	useEffect(() => {
		lastSavedRef.current = JSON.stringify({
			title: post.title,
			slug: post.slug,
			excerpt: post.excerpt ?? "",
			coverImageUrl: post.coverImageUrl ?? "",
			seoTitle: post.seoTitle ?? "",
			seoDescription: post.seoDescription ?? "",
			content: post.content ?? EMPTY_DOC,
			contentHtml: post.contentHtml ?? "",
			categoryIds: post.categories.map((c) => c.id),
			tagInputs: post.tags.map((t) => t.name),
		});
	}, [post]);

	useEffect(() => {
		if (!autosaveEligible) return;
		const payload = buildPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedRef.current) return;

		const version = ++versionRef.current;
		setSaveStatus("saving");

		const timeout = setTimeout(async () => {
			if (versionRef.current !== version) return;
			const result = await autosaveDraft(post.id, payload);
			if (versionRef.current !== version) return;
			if (result.success) {
				lastSavedRef.current = serialized;
				setSaveStatus("saved");
				setSaveError(undefined);
			} else {
				setSaveStatus("error");
				setSaveError(result.message);
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
		return true;
	}

	async function handleSubmitForReview() {
		setSubmitting(true);
		try {
			if (!(await persistLatest())) return;
			const res = await submitForReview(post.id);
			if (res.success) {
				toast.success("Artículo enviado a revisión");
				router.push("/portal/blog");
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
				post.status === "submitted"
					? await approveAndPublish(post.id)
					: await directPublish(post.id);
			if (res.success) {
				toast.success("Artículo publicado");
				router.push(
					surface === "dashboard" ? "/dashboard/blog" : "/portal/blog",
				);
			} else {
				toast.error(res.message);
			}
		} finally {
			setSubmitting(false);
		}
	}

	useEffect(() => {
		const emit = async () => {
			const blocks = editor.document;
			const serialized = JSON.stringify(blocks);
			if (serialized === lastSerializedRef.current) return;
			lastSerializedRef.current = serialized;
			const html = await editor.blocksToFullHTML(blocks);
			setContent(blocks);
			setContentHtml(html);
		};
		void emit();
		const off = editor.onChange(() => {
			void emit();
		});
		return () => {
			if (typeof off === "function") off();
		};
	}, [editor]);

	return (
		<Form {...form}>
			<form
				onSubmit={(e) => e.preventDefault()}
				className="flex flex-col gap-4 pb-24"
			>
				<div className="sticky top-0 z-40 -mx-4 bg-background/95 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/70">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Button asChild variant="ghost" size="icon" aria-label="Volver">
								<Link
									href={
										surface === "dashboard" ? "/dashboard/blog" : "/portal/blog"
									}
								>
									<ArrowLeft className="h-4 w-4" />
								</Link>
							</Button>
							<PostStatusBadge status={status} />
							{autosaveEligible && (
								<SaveIndicator status={saveStatus} errorMessage={saveError} />
							)}
						</div>
						<div className="flex flex-wrap gap-2">
							{surface === "portal" && (
								<Button
									type="button"
									className="bg-amber-600 hover:bg-amber-700"
									onClick={handleSubmitForReview}
									disabled={submitting || editorReadOnly || !canTransition}
									title={transitionDisabledTitle}
								>
									Enviar a revisión
								</Button>
							)}
							{canPublish && (
								<Button
									type="button"
									className="bg-emerald-600 hover:bg-emerald-700"
									onClick={handlePublish}
									disabled={submitting || !canTransition}
									title={transitionDisabledTitle}
								>
									{post.status === "submitted"
										? "Aprobar y publicar"
										: "Publicar"}
								</Button>
							)}
						</div>
					</div>
				</div>

				<EditorTopToolbar editor={editor} readOnly={editorReadOnly} />

				<ReviewerNotesBanner status={post.status} notes={post.reviewerNotes} />

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

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import CategoryMultiselect from "@/app/components/blog/category-multiselect";
import CoverImageUploader from "@/app/components/blog/cover-image-uploader";
import PostStatusBadge from "@/app/components/blog/post-status-badge";
import ReviewerNotesBanner from "@/app/components/blog/reviewer-notes-banner";
import TagInput from "@/app/components/blog/tag-input";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import { Form, FormDescription } from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";
import {
	approveAndPublish,
	createPost,
	deleteDraft,
	directPublish,
	submitForReview,
	updatePost,
} from "@/app/lib/posts/actions";
import type {
	PostCategoryRow,
	PostStatus,
	PostWithRelations,
} from "@/app/lib/posts/definitions";
import { slugifyName } from "@/app/lib/posts/slug";
import { postFormSchema } from "@/app/lib/posts/validate";

const PostEditor = dynamic(
	() => import("@/app/components/blog/post-editor"),
	{ ssr: false, loading: () => <EditorPlaceholder /> },
);

function EditorPlaceholder() {
	return (
		<div className="border rounded-md min-h-[400px] flex items-center justify-center text-sm text-muted-foreground">
			Cargando editor…
		</div>
	);
}

type Surface = "dashboard" | "portal";

type Props = {
	mode: "create" | "edit";
	surface: Surface;
	post?: PostWithRelations | null;
	categoryOptions: PostCategoryRow[];
	canPublish: boolean;
};

const EMPTY_DOC = [
	{ type: "paragraph", content: [] },
];

export default function PostForm({
	mode,
	surface,
	post,
	categoryOptions,
	canPublish,
}: Props) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [coverUrl, setCoverUrl] = useState<string | null>(
		post?.coverImageUrl ?? null,
	);
	const [content, setContent] = useState<unknown>(
		post?.content ?? EMPTY_DOC,
	);
	const [contentHtml, setContentHtml] = useState<string>(
		post?.contentHtml ?? "",
	);
	const [categoryIds, setCategoryIds] = useState<number[]>(
		post?.categories.map((c) => c.id) ?? [],
	);
	const [tagInputs, setTagInputs] = useState<string[]>(
		post?.tags.map((t) => t.name) ?? [],
	);

	const form = useForm({
		resolver: zodResolver(postFormSchema),
		defaultValues: {
			title: post?.title ?? "",
			slug: post?.slug ?? "",
			excerpt: post?.excerpt ?? "",
			coverImageUrl: post?.coverImageUrl ?? "",
			seoTitle: post?.seoTitle ?? "",
			seoDescription: post?.seoDescription ?? "",
			content: post?.content ?? EMPTY_DOC,
			categoryIds: post?.categories.map((c) => c.id) ?? [],
			tagInputs: post?.tags.map((t) => t.name) ?? [],
		},
	});

	function buildPayload() {
		const v = form.getValues();
		return {
			title: v.title,
			slug: v.slug || slugifyName(v.title),
			excerpt: v.excerpt,
			coverImageUrl: coverUrl ?? "",
			seoTitle: v.seoTitle,
			seoDescription: v.seoDescription,
			content,
			contentHtml,
			categoryIds,
			tagInputs,
		};
	}

	async function persist(): Promise<{ id: number; slug: string } | null> {
		const payload = buildPayload();
		const parsed = postFormSchema.safeParse(payload);
		if (!parsed.success) {
			const message = parsed.error.issues[0]?.message ?? "Datos inválidos";
			toast.error(message);
			return null;
		}

		const res =
			mode === "edit" && post
				? await updatePost(post.id, payload)
				: await createPost(payload);

		if (!res.success) {
			toast.error(res.message);
			return null;
		}
		return { id: res.id, slug: res.slug };
	}

	async function handleSaveDraft() {
		setSubmitting(true);
		try {
			const r = await persist();
			if (r) {
				toast.success("Borrador guardado");
				if (mode === "create") {
					const target =
						surface === "dashboard"
							? `/dashboard/blog/${r.id}/edit`
							: `/portal/blog/${r.id}/edit`;
					router.push(target);
				} else {
					router.refresh();
				}
			}
		} finally {
			setSubmitting(false);
		}
	}

	async function handleSubmitForReview() {
		setSubmitting(true);
		try {
			const r = await persist();
			if (!r) return;
			const res = await submitForReview(r.id);
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
			const r = await persist();
			if (!r) return;
			const res =
				post?.status === "submitted"
					? await approveAndPublish(r.id)
					: await directPublish(r.id);
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

	async function handleDelete() {
		if (!post || post.status !== "draft") return;
		if (!confirm("¿Eliminar este borrador? Esta acción no se puede deshacer."))
			return;
		setSubmitting(true);
		try {
			const res = await deleteDraft(post.id);
			if (res.success) {
				toast.success("Borrador eliminado");
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

	const status: PostStatus = post?.status ?? "draft";
	const editorReadOnly = status === "submitted" || status === "approved";

	return (
		<Form {...form}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					handleSaveDraft();
				}}
				className="flex flex-col gap-6 pb-24 md:pb-6"
			>
				<div className="flex items-center gap-3">
					<PostStatusBadge status={status} />
					{post && (
						<span className="text-xs text-muted-foreground">
							ID #{post.id}
						</span>
					)}
				</div>

				{post && (
					<ReviewerNotesBanner
						status={post.status}
						notes={post.reviewerNotes}
					/>
				)}

				<TextInput
					name="title"
					label="Título"
					placeholder="Un título claro y descriptivo"
					required
					maxLength={200}
				/>

				<TextInput
					name="slug"
					label="Slug (URL)"
					placeholder="se-genera-automaticamente"
					description="Deja en blanco para generarlo desde el título"
				/>

				<TextareaInput
					formControl={form.control}
					name="excerpt"
					label="Extracto"
					placeholder="Breve resumen para la lista pública (máx. 280 caracteres)"
					maxLength={280}
				/>

				<div className="grid gap-2">
					<Label>Portada</Label>
					<CoverImageUploader value={coverUrl} onChange={setCoverUrl} />
				</div>

				<div className="grid gap-2">
					<Label>Contenido</Label>
					{editorReadOnly && (
						<FormDescription>
							El artículo está en revisión. No se puede editar hasta que un
							admin lo regrese.
						</FormDescription>
					)}
					<PostEditor
						initialContent={post?.content}
						onChange={(blocks, html) => {
							setContent(blocks);
							setContentHtml(html);
						}}
					/>
				</div>

				<Separator />

				<div className="grid gap-2">
					<Label>Categorías</Label>
					<CategoryMultiselect
						value={categoryIds}
						onChange={setCategoryIds}
						options={categoryOptions}
					/>
				</div>

				<div className="grid gap-2">
					<Label>Etiquetas</Label>
					<TagInput value={tagInputs} onChange={setTagInputs} />
				</div>

				<Separator />

				<div className="grid gap-4">
					<Label className="text-base">SEO</Label>
					<TextInput
						name="seoTitle"
						label="Título SEO"
						placeholder="Opcional — se usará el título principal si se deja vacío"
						maxLength={70}
					/>
					<TextareaInput
						formControl={form.control}
						name="seoDescription"
						label="Descripción SEO"
						placeholder="Resumen para buscadores y redes (máx. 200 caracteres)"
						maxLength={200}
					/>
				</div>

				<Separator />

				<div className="flex flex-wrap gap-3 sticky bottom-0 bg-background py-3">
					<Button
						type="submit"
						disabled={submitting || editorReadOnly}
					>
						Guardar borrador
					</Button>

					{surface === "portal" && (
						<Button
							type="button"
							variant="default"
							className="bg-amber-600 hover:bg-amber-700"
							onClick={handleSubmitForReview}
							disabled={submitting || editorReadOnly}
						>
							Enviar a revisión
						</Button>
					)}

					{canPublish && (
						<Button
							type="button"
							variant="default"
							className="bg-emerald-600 hover:bg-emerald-700"
							onClick={handlePublish}
							disabled={submitting}
						>
							{post?.status === "submitted"
								? "Aprobar y publicar"
								: "Publicar"}
						</Button>
					)}

					{post && post.status === "draft" && (
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={submitting}
						>
							Eliminar borrador
						</Button>
					)}
				</div>
			</form>
		</Form>
	);
}

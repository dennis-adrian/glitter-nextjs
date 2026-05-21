import "@blocknote/core/fonts/inter.css";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";

import { CalendarIcon, UserIcon } from "lucide-react";
import Image from "next/image";

import CategoryPill from "@/app/components/blog/category-pill";
import TagPill from "@/app/components/blog/tag-pill";
import type { PostWithRelations } from "@/app/lib/posts/definitions";
import { formatFullDate } from "@/app/lib/formatters";

function authorName(author: PostWithRelations["author"]): string {
	return (
		(author.displayName ??
			[author.firstName, author.lastName].filter(Boolean).join(" ")) ||
		"Equipo Glitter"
	);
}

export default function PostDetail({ post }: { post: PostWithRelations }) {
	return (
		<article className="mx-auto max-w-3xl px-4 py-8">
			<header className="space-y-4 mb-8">
				{post.categories.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{post.categories.map((c) => (
							<CategoryPill key={c.id} category={c} />
						))}
					</div>
				)}
				<h1 className="text-3xl md:text-4xl font-bold leading-tight">
					{post.title}
				</h1>
				{post.excerpt && (
					<p className="text-lg text-muted-foreground">{post.excerpt}</p>
				)}
				<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<UserIcon className="h-4 w-4" />
						{authorName(post.author)}
					</span>
					{post.publishedAt && (
						<span className="inline-flex items-center gap-1.5">
							<CalendarIcon className="h-4 w-4" />
							{formatFullDate(post.publishedAt)}
						</span>
					)}
				</div>
			</header>

			{post.coverImageUrl && (
				<div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg mb-8 bg-muted">
					<Image
						src={post.coverImageUrl}
						alt={post.title}
						fill
						priority
						className="object-cover"
						sizes="(max-width: 768px) 100vw, 768px"
					/>
				</div>
			)}

			<div className="bn-mantine">
				<div
					className="bn-editor bn-default-styles ProseMirror"
					style={{ paddingInline: 0 }}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized server-side via DOMPurify in app/lib/posts/render.ts
					dangerouslySetInnerHTML={{ __html: post.contentHtml }}
				/>
			</div>

			{post.tags.length > 0 && (
				<footer className="mt-12 pt-6 border-t flex flex-wrap gap-2">
					{post.tags.map((t) => (
						<TagPill key={t.id} tag={t} />
					))}
				</footer>
			)}
		</article>
	);
}

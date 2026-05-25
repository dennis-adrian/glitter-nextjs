import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostDetail from "@/app/components/blog/post-detail";
import {
	fetchPostBySlug,
	fetchPostBySlugForWorkingPreview,
} from "@/app/lib/posts/data";
import { canEditPost } from "@/app/lib/posts/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type PageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({
	params,
	searchParams,
}: PageProps): Promise<Metadata> {
	const [{ slug }, sp] = await Promise.all([params, searchParams]);
	const isPreview = sp.preview === "working";
	const post = await (isPreview
		? fetchPostBySlugForWorkingPreview(slug)
		: fetchPostBySlug(slug));
	if (!post) {
		return { title: "Artículo no encontrado | Productora Glitter" };
	}

	const effectiveTitle = isPreview
		? (post.workingTitle ?? post.title)
		: post.title;
	const title = post.seoTitle ?? `${effectiveTitle} | Productora Glitter`;
	const description =
		(isPreview ? (post.workingSeoDescription ?? post.workingExcerpt) : null) ??
		post.seoDescription ??
		post.excerpt ??
		"Artículo del blog de Glitter";
	const authorName =
		(post.author.displayName ??
			[post.author.firstName, post.author.lastName]
				.filter(Boolean)
				.join(" ")) ||
		"Productora Glitter";

	return {
		title,
		description,
		robots: isPreview ? { index: false, follow: false } : undefined,
		openGraph: {
			title,
			description,
			type: "article",
			url: `/blog/${post.slug}`,
			images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
			publishedTime: post.publishedAt
				? new Date(post.publishedAt).toISOString()
				: undefined,
			authors: [authorName],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
		},
	};
}

export default async function BlogPostPage({
	params,
	searchParams,
}: PageProps) {
	const [{ slug }, sp] = await Promise.all([params, searchParams]);
	const isPreview = sp.preview === "working";

	if (isPreview) {
		const profile = await getCurrentUserProfile();
		if (!profile) notFound();
		const post = await fetchPostBySlugForWorkingPreview(slug);
		if (!post) notFound();
		if (!canEditPost(profile, post)) notFound();
		const previewPost = {
			...post,
			title: post.workingTitle ?? post.title,
			excerpt: post.workingExcerpt ?? post.excerpt,
			coverImageUrl: post.workingCoverImageUrl ?? post.coverImageUrl,
			content: post.workingContent ?? post.content,
			contentHtml: post.workingContentHtml ?? post.contentHtml,
			seoTitle: post.workingSeoTitle ?? post.seoTitle,
			seoDescription: post.workingSeoDescription ?? post.seoDescription,
		};
		return <PostDetail post={previewPost} previewBanner />;
	}

	const post = await fetchPostBySlug(slug);
	if (!post) notFound();
	return <PostDetail post={post} />;
}

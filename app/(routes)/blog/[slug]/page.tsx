import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostDetail from "@/app/components/blog/post-detail";
import { fetchPostBySlug } from "@/app/lib/posts/data";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const post = await fetchPostBySlug(slug);
	if (!post) {
		return { title: "Artículo no encontrado | Productora Glitter" };
	}

	const title = post.seoTitle ?? `${post.title} | Productora Glitter`;
	const description =
		post.seoDescription ?? post.excerpt ?? "Artículo del blog de Glitter";
	const authorName =
		(post.author.displayName ??
			[post.author.firstName, post.author.lastName]
				.filter(Boolean)
				.join(" ")) ||
		"Productora Glitter";

	return {
		title,
		description,
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

export default async function BlogPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = await fetchPostBySlug(slug);
	if (!post) notFound();
	return <PostDetail post={post} />;
}

import type { Metadata } from "next";

import PostList from "@/app/components/blog/post-list";
import PostPagination from "@/app/components/blog/post-pagination";
import { Input } from "@/app/components/ui/input";
import {
	countPublishedPosts,
	fetchPublishedPosts,
} from "@/app/lib/posts/data";

const PER_PAGE = 12;

export const metadata: Metadata = {
	title: "Blog | Productora Glitter",
	description:
		"Tutoriales, tips y novedades para festivales y participantes de Glitter.",
};

export default async function BlogIndexPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; q?: string }>;
}) {
	const sp = await searchParams;
	const page = Math.max(1, Number(sp.page ?? "1") || 1);
	const q = (sp.q ?? "").trim();

	const [posts, total] = await Promise.all([
		fetchPublishedPosts({ page, perPage: PER_PAGE, q: q || undefined }),
		countPublishedPosts({ q: q || undefined }),
	]);
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

	return (
		<div className="container mx-auto px-4 py-8 max-w-6xl">
			<header className="mb-8 space-y-2">
				<h1 className="text-3xl md:text-4xl font-bold">Blog</h1>
				<p className="text-muted-foreground">
					Tutoriales, tips y novedades de la comunidad Glitter.
				</p>
			</header>

			<form className="mb-6" action="/blog" method="get">
				<Input
					name="q"
					defaultValue={q}
					placeholder="Buscar artículos…"
					className="max-w-md"
				/>
			</form>

			<PostList posts={posts} />

			<PostPagination
				currentPage={page}
				totalPages={totalPages}
				buildHref={(p) => {
					const params = new URLSearchParams();
					if (p > 1) params.set("page", String(p));
					if (q) params.set("q", q);
					const qs = params.toString();
					return qs ? `/blog?${qs}` : "/blog";
				}}
			/>
		</div>
	);
}

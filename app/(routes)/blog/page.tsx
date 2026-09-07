import type { Metadata } from "next";

import BlogFilters from "@/app/components/blog/blog-filters";
import PostList from "@/app/components/blog/post-list";
import PostPagination from "@/app/components/blog/post-pagination";
import {
  countPublishedPosts,
  fetchPostCategories,
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
  searchParams: Promise<{
    page?: string;
    q?: string;
    category?: string;
    tag?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const categorySlug = (sp.category ?? "").trim() || undefined;
  const tagSlug = (sp.tag ?? "").trim() || undefined;

  const filters = { q: q || undefined, categorySlug, tagSlug };

  const [posts, total, categories] = await Promise.all([
    fetchPublishedPosts({ ...filters, page, perPage: PER_PAGE }),
    countPublishedPosts(filters),
    fetchPostCategories(),
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

      <BlogFilters
        categories={categories}
        activeCategory={categorySlug}
        activeTag={tagSlug}
        q={q}
      />

      {posts.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No encontramos artículos con esos filtros.
        </p>
      ) : (
        <PostList posts={posts} />
      )}

      <PostPagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) => {
          const params = new URLSearchParams();
          if (p > 1) params.set("page", String(p));
          if (q) params.set("q", q);
          if (categorySlug) params.set("category", categorySlug);
          if (tagSlug) params.set("tag", tagSlug);
          const qs = params.toString();
          return qs ? `/blog?${qs}` : "/blog";
        }}
      />
    </div>
  );
}

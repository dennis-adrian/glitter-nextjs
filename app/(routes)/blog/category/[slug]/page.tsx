import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostList from "@/app/components/blog/post-list";
import PostPagination from "@/app/components/blog/post-pagination";
import {
  countPublishedPosts,
  fetchPostCategoryBySlug,
  fetchPublishedPosts,
} from "@/app/lib/posts/data";

const PER_PAGE = 12;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await fetchPostCategoryBySlug(slug);
  if (!category) return { title: "Categoría no encontrada | Glitter" };
  return {
    title: `${category.name} | Blog Glitter`,
    description:
      category.description ?? `Artículos en la categoría ${category.name}`,
  };
}

export default async function BlogCategoryPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const category = await fetchPostCategoryBySlug(slug);
  if (!category) notFound();

  const [posts, total] = await Promise.all([
    fetchPublishedPosts({ page, perPage: PER_PAGE, categorySlug: slug }),
    countPublishedPosts({ categorySlug: slug }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <header className="mb-8 space-y-2">
        <p className="text-sm text-muted-foreground uppercase tracking-wide">
          Categoría
        </p>
        <h1 className="text-3xl md:text-4xl font-bold">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground">{category.description}</p>
        )}
      </header>

      <PostList posts={posts} />

      <PostPagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) =>
          p > 1 ? `/blog/category/${slug}?page=${p}` : `/blog/category/${slug}`
        }
      />
    </div>
  );
}

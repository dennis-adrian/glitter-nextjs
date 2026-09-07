import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import PostList from "@/app/components/blog/post-list";
import PostPagination from "@/app/components/blog/post-pagination";
import {
  countPublishedPosts,
  fetchPostTagBySlug,
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
  const tag = await fetchPostTagBySlug(slug);
  if (!tag) return { title: "Etiqueta no encontrada | Glitter" };
  return {
    title: `#${tag.name} | Blog Glitter`,
    description: `Artículos etiquetados con #${tag.name}`,
  };
}

export default async function BlogTagPage({ params, searchParams }: PageProps) {
  // Phase one ships the blog dark: the routes exist but answer 404 until the
  // flag is public. `admin_only` lets staff walk the real thing in production
  // before it is announced.
  if (!(await isFeatureEnabled("blog"))) notFound();

  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const tag = await fetchPostTagBySlug(slug);
  if (!tag) notFound();

  const [posts, total] = await Promise.all([
    fetchPublishedPosts({ page, perPage: PER_PAGE, tagSlug: slug }),
    countPublishedPosts({ tagSlug: slug }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <header className="mb-8 space-y-2">
        <p className="text-sm text-muted-foreground uppercase tracking-wide">
          Etiqueta
        </p>
        <h1 className="text-3xl md:text-4xl font-bold">#{tag.name}</h1>
      </header>

      <PostList posts={posts} />

      <PostPagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) =>
          p > 1 ? `/blog/tag/${slug}?page=${p}` : `/blog/tag/${slug}`
        }
      />
    </div>
  );
}

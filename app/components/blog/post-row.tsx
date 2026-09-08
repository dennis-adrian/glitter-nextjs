import Image from "next/image";
import Link from "next/link";

import AudienceBadge from "@/app/components/blog/audience-badge";
import CategoryPill from "@/app/components/blog/category-pill";
import { formatFullDate } from "@/app/lib/formatters";
import type { PublicPostListItem } from "@/app/lib/posts/definitions";
import { postBylineName } from "@/app/lib/posts/helpers";

/**
 * One article in the public listing: text first, cover as a small thumbnail.
 *
 * The previous card led with a 16:9 cover and fell back to a "Sin portada"
 * box. Covers are optional, so that box was the most prominent thing on most
 * cards — a grid of grey rectangles announcing what the articles lack.
 *
 * Substack, Digg, Buffer and Ghost's secondary lists all solve this the same
 * way: the thumbnail is an accent beside the text rather than the card's
 * spine, so an article without one simply has no thumbnail. Canny goes
 * further and runs an entirely text-only list that still reads as finished.
 * Nobody reserves empty space for an image that is not there.
 */
export default function PostRow({ post }: { post: PublicPostListItem }) {
  const hasTags = post.categories.length > 0 || post.audience !== "public";

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex items-start gap-4 rounded-lg px-3 py-5 transition-colors hover:bg-muted/40 sm:gap-6 sm:px-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {hasTags && (
          <div className="flex flex-wrap items-center gap-1">
            <AudienceBadge audience={post.audience} />
            {post.categories.slice(0, 2).map((c) => (
              <CategoryPill key={c.id} category={c} asLink={false} />
            ))}
          </div>
        )}

        <h3 className="text-lg font-semibold leading-snug transition-colors group-hover:text-pink-600 sm:text-xl">
          {post.title}
        </h3>

        {post.excerpt && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {post.excerpt}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{postBylineName(post.author)}</span>
          {post.publishedAt && (
            <>
              <span aria-hidden>·</span>
              <span>{formatFullDate(post.publishedAt)}</span>
            </>
          )}
        </div>
      </div>

      {/*
        Rendered only when there is something to show. No placeholder, no
        reserved box — an article without a cover is a shorter row, not a
        broken one.
      */}
      {post.coverImageUrl && (
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted sm:h-28 sm:w-40">
          <Image
            src={post.coverImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 112px, 160px"
          />
        </div>
      )}
    </Link>
  );
}

import { CalendarIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import CategoryPill from "@/app/components/blog/category-pill";
import type { PublicPostListItem } from "@/app/lib/posts/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { postAuthorName } from "@/app/lib/posts/helpers";
import AudienceBadge from "@/app/components/blog/audience-badge";

export default function PostCard({ post }: { post: PublicPostListItem }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col gap-3 rounded-lg overflow-hidden border bg-white hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-[16/9] w-full bg-muted">
        {post.coverImageUrl ? (
          <Image
            src={post.coverImageUrl}
            alt={post.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground">
            Sin portada
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {(post.categories.length > 0 || post.audience !== "public") && (
          <div className="flex flex-wrap items-center gap-1">
            <AudienceBadge audience={post.audience} />
            {post.categories.slice(0, 2).map((c) => (
              <CategoryPill key={c.id} category={c} asLink={false} />
            ))}
          </div>
        )}
        <h3 className="text-lg font-semibold line-clamp-2 group-hover:text-pink-600 transition-colors">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {post.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>{postAuthorName(post.author)}</span>
          {post.publishedAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {formatFullDate(post.publishedAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";

/**
 * A category, optionally linking to its browse page.
 *
 * `asLink` exists because `PostRow` wraps the entire row in an anchor, and
 * an anchor inside an anchor is invalid HTML — React refuses to hydrate it and
 * the whole list page falls back to a client render. Inside a card the pill is
 * a label; the card itself is what navigates.
 */
export default function CategoryPill({
  category,
  asLink = true,
}: {
  category: PostCategoryRow;
  asLink?: boolean;
}) {
  const badge = (
    <Badge
      variant="secondary"
      className={asLink ? "hover:bg-pink-100 transition-colors" : undefined}
    >
      {category.name}
    </Badge>
  );

  if (!asLink) return badge;

  return <Link href={`/blog/category/${category.slug}`}>{badge}</Link>;
}

import PostRow from "@/app/components/blog/post-row";
import type { PublicPostListItem } from "@/app/lib/posts/definitions";

/**
 * A divided list rather than a card grid.
 *
 * A three-column grid needs every tile to carry roughly the same weight, and
 * with optional covers they do not: some tiles led with an image and the rest
 * led with a placeholder. Dividers let rows differ in height without looking
 * ragged, which is why reading surfaces with mixed content — Substack, Digg,
 * Ghost — use them.
 */
export default function PostList({ posts }: { posts: PublicPostListItem[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        Aún no hay artículos publicados.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
    </div>
  );
}

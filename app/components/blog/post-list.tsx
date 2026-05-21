import PostCard from "@/app/components/blog/post-card";
import type { PublicPostListItem } from "@/app/lib/posts/definitions";

export default function PostList({ posts }: { posts: PublicPostListItem[] }) {
	if (posts.length === 0) {
		return (
			<div className="text-center py-16 text-muted-foreground">
				Aún no hay artículos publicados.
			</div>
		);
	}
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{posts.map((p) => (
				<PostCard key={p.id} post={p} />
			))}
		</div>
	);
}

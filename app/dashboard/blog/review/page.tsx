import Link from "next/link";

import PostStatusBadge from "@/app/components/blog/post-status-badge";
import ReviewActions from "@/app/components/blog/review-actions";
import { Button } from "@/app/components/ui/button";
import { fetchSubmittedPostsForReview } from "@/app/lib/posts/data";
import { formatFullDate } from "@/app/lib/formatters";

export default async function DashboardBlogReviewPage() {
	const posts = await fetchSubmittedPostsForReview();

	return (
		<div className="container mx-auto px-4 py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Cola de revisión</h1>
				<p className="text-sm text-muted-foreground">
					Artículos enviados por autores eligibles, pendientes de revisión.
				</p>
			</div>

			{posts.length === 0 ? (
				<div className="text-center py-16 text-muted-foreground border rounded-md bg-white">
					No hay artículos en revisión.
				</div>
			) : (
				<ul className="space-y-4">
					{posts.map((p) => (
						<li
							key={p.id}
							className="border rounded-md bg-white p-5 space-y-3"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<PostStatusBadge status={p.status} />
										<span className="text-xs text-muted-foreground">
											Enviado {formatFullDate(p.updatedAt)}
										</span>
									</div>
									<h3 className="text-lg font-semibold">{p.title}</h3>
									{p.excerpt && (
										<p className="text-sm text-muted-foreground mt-1">
											{p.excerpt}
										</p>
									)}
									<p className="text-xs text-muted-foreground mt-2">
										Autor: {p.author.displayName ?? "—"}
									</p>
								</div>
								<Button asChild variant="outline" size="sm">
									<Link href={`/dashboard/blog/${p.id}/edit`}>
										Ver borrador
									</Link>
								</Button>
							</div>
							<ReviewActions postId={p.id} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

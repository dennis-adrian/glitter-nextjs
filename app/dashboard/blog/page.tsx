import Link from "next/link";
import { redirect } from "next/navigation";

import PostsTable from "@/app/components/blog/posts-table";
import { Button } from "@/app/components/ui/button";
import { startNewDashboardDraft } from "@/app/lib/posts/actions";
import { fetchAllPostsForAdmin } from "@/app/lib/posts/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function DashboardBlogPage() {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");

	const posts = await fetchAllPostsForAdmin({});

	return (
		<div className="container mx-auto px-4 py-8 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Blog</h1>
					<p className="text-sm text-muted-foreground">
						Gestiona los artículos del blog.
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link href="/dashboard/blog/categories">Categorías</Link>
					</Button>
					<Button asChild variant="outline">
						<Link href="/dashboard/blog/review">Cola de revisión</Link>
					</Button>
					<form action={startNewDashboardDraft}>
						<Button type="submit">Nuevo artículo</Button>
					</form>
				</div>
			</div>

			<PostsTable
				posts={posts}
				surface="dashboard"
				viewer={{ id: profile.id, role: profile.role }}
			/>
		</div>
	);
}

import Link from "next/link";
import { redirect } from "next/navigation";

import PostsTable from "@/app/components/blog/posts-table";
import { Button } from "@/app/components/ui/button";
import { fetchAuthoredPostsForUser } from "@/app/lib/posts/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function PortalBlogPage() {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");

	const posts = await fetchAuthoredPostsForUser(profile.id);

	return (
		<div className="container mx-auto px-4 py-8 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Mis artículos</h1>
					<p className="text-sm text-muted-foreground">
						Escribe artículos para el blog y envíalos a revisión.
					</p>
				</div>
				<Button asChild>
					<Link href="/portal/blog/new">Nuevo artículo</Link>
				</Button>
			</div>

			<PostsTable
				posts={posts}
				surface="portal"
				viewer={{ id: profile.id, role: profile.role }}
			/>
		</div>
	);
}

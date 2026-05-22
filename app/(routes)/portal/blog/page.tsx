import { redirect } from "next/navigation";

import NewDraftSubmitButton from "@/app/components/blog/new-draft-submit-button";
import PostsTable from "@/app/components/blog/posts-table";
import { startNewPortalDraft } from "@/app/lib/posts/actions";
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
				<form action={startNewPortalDraft}>
					<NewDraftSubmitButton />
				</form>
			</div>

			<PostsTable
				posts={posts}
				surface="portal"
				viewer={{ id: profile.id, role: profile.role }}
			/>
		</div>
	);
}

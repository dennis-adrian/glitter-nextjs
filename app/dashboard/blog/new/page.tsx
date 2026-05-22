import { redirect } from "next/navigation";

import { createBlankDraft } from "@/app/lib/posts/create-draft";
import { canPublishPosts } from "@/app/lib/posts/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function DashboardBlogNewPage() {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");
	if (!canPublishPosts(profile.role)) redirect("/dashboard/blog");

	const draft = await createBlankDraft(profile);
	redirect(`/dashboard/blog/${draft.id}/edit`);
}

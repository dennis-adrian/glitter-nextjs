import { redirect } from "next/navigation";

import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import { createBlankDraft } from "@/app/lib/posts/create-draft";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function PortalBlogNewPage() {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");
	if (!(await canAuthorPosts(profile))) redirect("/portal/blog");

	const draft = await createBlankDraft(profile);
	redirect(`/portal/blog/${draft.id}/edit`);
}

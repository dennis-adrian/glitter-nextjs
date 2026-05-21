import type { BaseProfile } from "@/app/api/users/definitions";
import type { PostRow, PostStatus } from "@/app/lib/posts/definitions";

export function isStaff(role: string | null | undefined): boolean {
	return role === "admin" || role === "festival_admin";
}

export function canPublishPosts(role: string | null | undefined): boolean {
	return isStaff(role);
}

export function canEditPost(
	profile: Pick<BaseProfile, "id" | "role">,
	post: Pick<PostRow, "authorId" | "status">,
): boolean {
	if (isStaff(profile.role)) return true;
	const editableStatuses: PostStatus[] = ["draft", "rejected"];
	return (
		post.authorId === profile.id && editableStatuses.includes(post.status)
	);
}

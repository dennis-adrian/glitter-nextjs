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

export function hasMeaningfulContent(content: unknown): boolean {
	if (!Array.isArray(content) || content.length === 0) return false;
	for (const block of content) {
		const inline = (block as { content?: unknown }).content;
		if (!Array.isArray(inline)) continue;
		for (const node of inline) {
			const text = (node as { text?: unknown }).text;
			if (typeof text === "string" && text.trim().length > 0) return true;
		}
	}
	return false;
}

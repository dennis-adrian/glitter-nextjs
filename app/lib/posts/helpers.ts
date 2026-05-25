import type { BaseProfile } from "@/app/api/users/definitions";
import type { PostRow, PostStatus } from "@/app/lib/posts/definitions";

export function isStaff(role: string | null | undefined): boolean {
	return role === "admin" || role === "festival_admin";
}

export function canPublishPosts(role: string | null | undefined): boolean {
	return isStaff(role);
}

const WORKING_COPY_STATUSES: PostStatus[] = [
	"submitted",
	"approved",
	"scheduled",
	"published",
	"rejected",
];

const AUTHOR_EDITABLE_STATUSES: PostStatus[] = [
	"draft",
	...WORKING_COPY_STATUSES,
];

export function canEditPost(
	profile: Pick<BaseProfile, "id" | "role">,
	post: Pick<PostRow, "authorId" | "status">,
): boolean {
	if (post.status === "archived") return false;
	if (isStaff(profile.role)) return true;
	return (
		post.authorId === profile.id &&
		AUTHOR_EDITABLE_STATUSES.includes(post.status)
	);
}

export function usesWorkingCopy(post: Pick<PostRow, "status">): boolean {
	return WORKING_COPY_STATUSES.includes(post.status);
}

export function hasWorking(post: Pick<PostRow, "workingUpdatedAt">): boolean {
	return post.workingUpdatedAt !== null;
}

export function workingPendingReview(
	post: Pick<PostRow, "workingSubmittedAt" | "workingReviewerNotes">,
): boolean {
	return post.workingSubmittedAt !== null && post.workingReviewerNotes === null;
}

export function workingRejected(
	post: Pick<PostRow, "workingReviewerNotes">,
): boolean {
	return post.workingReviewerNotes !== null;
}

export function canDeletePost(
	profile: Pick<BaseProfile, "id" | "role">,
	post: Pick<PostRow, "authorId" | "publishedAt">,
): boolean {
	if (post.publishedAt !== null) return false;
	return isStaff(profile.role) || post.authorId === profile.id;
}

export function canArchivePost(
	profile: Pick<BaseProfile, "id" | "role">,
	post: Pick<PostRow, "authorId" | "status">,
): boolean {
	if (post.status !== "published") return false;
	return isStaff(profile.role) || post.authorId === profile.id;
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

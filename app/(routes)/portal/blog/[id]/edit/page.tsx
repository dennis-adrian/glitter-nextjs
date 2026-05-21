import { notFound, redirect } from "next/navigation";

import PostForm from "@/app/components/blog/post-form";
import {
	fetchPostByIdForEditor,
	fetchPostCategories,
} from "@/app/lib/posts/data";
import { canEditPost } from "@/app/lib/posts/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function PortalBlogEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const profile = await getCurrentUserProfile();
	if (!profile) redirect("/sign_in");

	const { id } = await params;
	const postId = Number(id);
	if (Number.isNaN(postId)) notFound();

	const [post, categories] = await Promise.all([
		fetchPostByIdForEditor(postId),
		fetchPostCategories(),
	]);
	if (!post) notFound();
	if (!canEditPost(profile, post)) redirect("/portal/blog");

	return (
		<div className="container mx-auto px-4 py-8 max-w-4xl">
			<h1 className="text-2xl font-bold mb-6">Editar artículo</h1>
			<PostForm
				mode="edit"
				surface="portal"
				post={post}
				categoryOptions={categories}
				canPublish={false}
			/>
		</div>
	);
}

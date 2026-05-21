import { notFound } from "next/navigation";

import PostForm from "@/app/components/blog/post-form";
import {
	fetchPostByIdForEditor,
	fetchPostCategories,
} from "@/app/lib/posts/data";

export default async function DashboardBlogEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const postId = Number(id);
	if (Number.isNaN(postId)) notFound();

	const [post, categories] = await Promise.all([
		fetchPostByIdForEditor(postId),
		fetchPostCategories(),
	]);
	if (!post) notFound();

	return (
		<div className="container mx-auto px-4 py-8 max-w-4xl">
			<h1 className="text-2xl font-bold mb-6">Editar artículo</h1>
			<PostForm
				mode="edit"
				surface="dashboard"
				post={post}
				categoryOptions={categories}
				canPublish
			/>
		</div>
	);
}

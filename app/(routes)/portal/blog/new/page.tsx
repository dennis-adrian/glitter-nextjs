import PostForm from "@/app/components/blog/post-form";
import { fetchPostCategories } from "@/app/lib/posts/data";

export default async function PortalBlogNewPage() {
	const categories = await fetchPostCategories();
	return (
		<div className="container mx-auto px-4 py-8 max-w-4xl">
			<h1 className="text-2xl font-bold mb-6">Nuevo artículo</h1>
			<PostForm
				mode="create"
				surface="portal"
				categoryOptions={categories}
				canPublish={false}
			/>
		</div>
	);
}

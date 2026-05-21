import CategoriesTable from "@/app/components/blog/categories-table";
import CategoryForm from "@/app/components/blog/category-form";
import { fetchPostCategories } from "@/app/lib/posts/data";

export default async function DashboardBlogCategoriesPage() {
	const categories = await fetchPostCategories();

	return (
		<div className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
			<div>
				<h1 className="text-2xl font-bold">Categorías del blog</h1>
				<p className="text-sm text-muted-foreground">
					Crea y administra las categorías que se usan al etiquetar artículos.
				</p>
			</div>

			<section className="border rounded-md bg-white p-5">
				<h2 className="text-lg font-semibold mb-4">Nueva categoría</h2>
				<CategoryForm />
			</section>

			<section>
				<h2 className="text-lg font-semibold mb-4">Categorías existentes</h2>
				<CategoriesTable categories={categories} />
			</section>
		</div>
	);
}

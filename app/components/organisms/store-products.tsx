import StoreItemCard from "@/app/components/molecules/store-item-card";
import { fetchProducts } from "@/app/lib/products/actions";

export default async function StoreProducts() {
	const products = await fetchProducts();

	if (products.length === 0) {
		return (
			<div className="text-center py-12">
				<h3 className="text-lg font-medium mb-2">
					No hay productos disponibles
				</h3>
				<p className="text-muted-foreground">
					No hay productos disponibles en este momento. ¡Vuelve pronto!
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
			{products.map((product) => (
				<StoreItemCard key={product.id} product={product} />
			))}
		</div>
	);
}

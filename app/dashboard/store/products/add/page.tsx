import ProductForm from "@/app/components/organisms/products/product-form";

export default function AddProductPage() {
	return (
		<div className="max-w-2xl">
			<h2 className="text-xl font-semibold mb-6">Agregar producto</h2>
			<ProductForm />
		</div>
	);
}

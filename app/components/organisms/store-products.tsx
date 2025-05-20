import StoreItemCard from "@/app/components/molecules/store-item-card";
import { fetchProducts } from "@/app/lib/products/actions";

export default async function StoreProducts({ userId }: { userId?: number }) {
  const products = await fetchProducts();

  return (
    <div className="flex flex-wrap gap-4 justify-center items-center">
      {products.map((product) => (
        <StoreItemCard key={product.id} product={product} userId={userId} />
      ))}
    </div>
  );
}

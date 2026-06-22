import StoreItemCard from "@/app/components/molecules/store-item-card";
import { fetchProducts } from "@/app/lib/products/actions";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";

export default async function StoreProducts() {
  const [products, rentalEligibility] = await Promise.all([
    fetchProducts("default", { visibleOnly: true }),
    getRentalEligibilityForCurrentUser(),
  ]);
  const rentalEligible = rentalEligibility.eligible;
  const rentalContexts = rentalEligible ? rentalEligibility.contexts : [];

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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 items-start">
      {products.map((product) => (
        <StoreItemCard
          key={product.id}
          product={product}
          rentalEligible={rentalEligible}
          rentalContexts={rentalContexts}
        />
      ))}
    </div>
  );
}

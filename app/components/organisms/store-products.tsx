import StoreItemCard from "@/app/components/molecules/store-item-card";
import { fetchProducts } from "@/app/lib/products/actions";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";
import type { RentalEligibilityResult } from "@/app/lib/rentals/types";

const RENTAL_ELIGIBILITY_FALLBACK: RentalEligibilityResult = {
  eligible: false,
  error: "not_active_participant",
  message: "No se pudo verificar la elegibilidad de alquiler.",
};

export default async function StoreProducts() {
  const [productsResult, rentalEligibilityResult] = await Promise.allSettled([
    fetchProducts("default", { visibleOnly: true }),
    getRentalEligibilityForCurrentUser(),
  ]);

  if (productsResult.status === "rejected") {
    throw productsResult.reason;
  }

  const products = productsResult.value;
  const rentalEligibility: RentalEligibilityResult =
    rentalEligibilityResult.status === "fulfilled"
      ? rentalEligibilityResult.value
      : RENTAL_ELIGIBILITY_FALLBACK;
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

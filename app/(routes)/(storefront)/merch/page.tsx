import StoreProducts from "@/app/components/organisms/store-products";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";

export default function MerchPage() {
  return (
    <StoreSectionGate section="merch">
      <div className="container px-3 py-6">
        <StoreProducts storeCategory="merch" />
      </div>
    </StoreSectionGate>
  );
}

import StoreProducts from "@/app/components/organisms/store-products";

export default function MerchPage() {
  return (
    <div className="container px-3 py-6">
      <StoreProducts storeCategory="merch" />
    </div>
  );
}

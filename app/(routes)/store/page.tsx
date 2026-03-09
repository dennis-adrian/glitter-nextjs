import StoreProducts from "@/app/components/organisms/store-products";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function StorePage() {
  const currentProfile = await getCurrentUserProfile();

  if (!currentProfile) {
    notFound();
  }

  return (
		<div className="container px-3 py-6">
			<StoreProducts />
		</div>
	);
}

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
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
				<div>
					<h1 className="text-2xl md:text-4xl font-bold tracking-tight">
						Tiendita Glitter
					</h1>
					<p className="text-muted-foreground mt-2">
						Consigue mercha oficial de nuestros festivales
					</p>
				</div>
			</div>
			<StoreProducts user={currentProfile} />
		</div>
	);
}

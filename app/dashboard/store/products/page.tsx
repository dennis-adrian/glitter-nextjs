import ResponsiveProductsView from "@/app/components/organisms/products/responsive-products-view";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { Button } from "@/app/components/ui/button";
import { fetchProducts } from "@/app/lib/products/actions";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default function StoreProductsPage() {
	const productsPromise = fetchProducts("updatedAt");

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button asChild size="sm">
					<Link href="/dashboard/store/products/add">
						<PlusIcon className="h-4 w-4 mr-1" />
						Agregar producto
					</Link>
				</Button>
			</div>

			<Suspense fallback={<TableSkeleton />}>
				<ResponsiveProductsView productsPromise={productsPromise} />
			</Suspense>
		</div>
	);
}

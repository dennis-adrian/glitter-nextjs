import ProductsCardGrid from "@/app/components/organisms/products/products-card-grid";
import ProductsTable from "@/app/components/organisms/products/products-table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { Button } from "@/app/components/ui/button";
import { fetchProducts } from "@/app/lib/products/actions";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default function StoreProductsPage() {
	const productsPromise = fetchProducts();

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

			<div className="block md:hidden">
				<Suspense
					fallback={
						<div className="grid grid-cols-2 gap-3">
							{Array.from({ length: 4 }).map((_, i) => (
								<div
									key={i}
									className="rounded-lg border bg-muted animate-pulse aspect-square"
								/>
							))}
						</div>
					}
				>
					<ProductsCardGrid productsPromise={productsPromise} />
				</Suspense>
			</div>

			<div className="hidden md:block">
				<Suspense fallback={<TableSkeleton />}>
					<ProductsTable productsPromise={productsPromise} />
				</Suspense>
			</div>
		</div>
	);
}

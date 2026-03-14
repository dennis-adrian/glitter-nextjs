"use client";

import ProductsCardGrid from "@/app/components/organisms/products/products-card-grid";
import ProductsTable from "@/app/components/organisms/products/products-table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { Suspense } from "react";

type ResponsiveProductsViewProps = {
	productsPromise: Promise<BaseProductWithImages[]>;
};

const cardGridFallback = (
	<div className="grid grid-cols-2 gap-3">
		{Array.from({ length: 4 }).map((_, i) => (
			<div
				key={i}
				className="rounded-lg border bg-muted animate-pulse aspect-square"
			/>
		))}
	</div>
);

export default function ResponsiveProductsView({
	productsPromise,
}: ResponsiveProductsViewProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");

	return (
		<Suspense fallback={isDesktop ? <TableSkeleton /> : cardGridFallback}>
			{isDesktop ? (
				<ProductsTable productsPromise={productsPromise} />
			) : (
				<ProductsCardGrid productsPromise={productsPromise} />
			)}
		</Suspense>
	);
}

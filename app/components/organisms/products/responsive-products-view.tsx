"use client";

import ProductsCardGrid from "@/app/components/organisms/products/products-card-grid";
import ProductsTable from "@/app/components/organisms/products/products-table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import type { StoreCategoryScope } from "@/app/lib/store/category";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { Suspense, use } from "react";

type ResponsiveProductsViewProps = {
  productsPromise: Promise<BaseProductWithImages[]>;
  categoryScope: StoreCategoryScope;
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

function ProductsContent({
  productsPromise,
  categoryScope,
  isDesktop,
}: ResponsiveProductsViewProps & { isDesktop: boolean }) {
  const products = use(productsPromise);

  return isDesktop ? (
    <ProductsTable products={products} />
  ) : (
    <ProductsCardGrid products={products} categoryScope={categoryScope} />
  );
}

export default function ResponsiveProductsView({
  productsPromise,
  categoryScope,
}: ResponsiveProductsViewProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Suspense fallback={isDesktop ? <TableSkeleton /> : cardGridFallback}>
      <ProductsContent
        productsPromise={productsPromise}
        categoryScope={categoryScope}
        isDesktop={isDesktop}
      />
    </Suspense>
  );
}

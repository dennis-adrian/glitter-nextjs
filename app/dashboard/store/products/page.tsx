import ResponsiveProductsView from "@/app/components/organisms/products/responsive-products-view";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { Button } from "@/app/components/ui/button";
import { fetchProducts } from "@/app/lib/products/actions";
import {
  isLowStockFilter,
  isProductLowStock,
  LOW_STOCK_FILTER_PARAM,
} from "@/app/lib/products/low-stock";
import {
  normalizeStoreCategoryScope,
  storeCategoryScopeHref,
  STORE_CATEGORY_SCOPE_PARAM,
  toConcreteStoreCategory,
} from "@/app/lib/store/category";
import { PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default async function StoreProductsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const scope = normalizeStoreCategoryScope(
    searchParams[STORE_CATEGORY_SCOPE_PARAM],
  );
  const lowStockOnly = isLowStockFilter(searchParams[LOW_STOCK_FILTER_PARAM]);
  const storeCategory = toConcreteStoreCategory(scope) ?? undefined;
  const productsPromise = fetchProducts("updatedAt", { storeCategory }).then(
    (products) =>
      lowStockOnly ? products.filter(isProductLowStock) : products,
  );
  const allProductsHref = storeCategoryScopeHref(
    "/dashboard/store/products",
    scope,
  );

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

      {lowStockOnly && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            Mostrando solo productos con alertas de stock.
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href={allProductsHref}>
              <XIcon aria-hidden="true" className="mr-1 h-4 w-4" />
              Quitar filtro
            </Link>
          </Button>
        </div>
      )}

      <Suspense
        key={`${scope}:${lowStockOnly ? "low" : "all"}`}
        fallback={<TableSkeleton />}
      >
        {/* Remounting by scope drops TanStack row selection from the old set. */}
        <ResponsiveProductsView
          key={`${scope}:${lowStockOnly ? "low" : "all"}`}
          productsPromise={productsPromise}
          categoryScope={scope}
        />
      </Suspense>
    </div>
  );
}

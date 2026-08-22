import LowStockAlert from "@/app/components/organisms/orders/low-stock-alert";
import ResponsiveProductsView from "@/app/components/organisms/products/responsive-products-view";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  fetchLowStockProducts,
  fetchProducts,
} from "@/app/lib/products/actions";
import {
  normalizeStoreCategoryScope,
  STORE_CATEGORY_SCOPE_PARAM,
  toConcreteStoreCategory,
} from "@/app/lib/store/category";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function LowStockSkeleton() {
  return (
    <div className="rounded-lg border border-amber-200/50 bg-card p-4">
      <div className="flex items-center gap-2 pb-2">
        <Skeleton className="h-5 w-5 shrink-0" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default async function StoreProductsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const scope = normalizeStoreCategoryScope(
    searchParams[STORE_CATEGORY_SCOPE_PARAM],
  );
  const storeCategory = toConcreteStoreCategory(scope) ?? undefined;
  const productsPromise = fetchProducts("updatedAt", { storeCategory });
  const lowStockPromise = fetchLowStockProducts({ storeCategory });

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

      <Suspense fallback={<LowStockSkeleton />}>
        <LowStockAlert lowStockPromise={lowStockPromise} />
      </Suspense>

      <Suspense key={scope} fallback={<TableSkeleton />}>
        {/* Remounting by scope drops TanStack row selection from the old set. */}
        <ResponsiveProductsView
          key={scope}
          productsPromise={productsPromise}
          categoryScope={scope}
        />
      </Suspense>
    </div>
  );
}

"use client";

import {
  normalizeStoreCategoryScope,
  STORE_CATEGORY_SCOPE_LABELS,
  STORE_CATEGORY_SCOPE_PARAM,
  STORE_CATEGORY_SCOPES,
  withStoreCategoryScope,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Pages whose data is category-scoped; other Store sections stay global. */
const SCOPED_PATHNAMES = [
  "/dashboard/store/products",
  "/dashboard/store/orders",
  "/dashboard/store/analytics",
];

export default function StoreCategoryScopeSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Layouts keep stale search params on client navigation, so the active
  // scope is read here rather than passed down from the server layout.
  const active = normalizeStoreCategoryScope(
    searchParams.get(STORE_CATEGORY_SCOPE_PARAM),
  );

  if (!SCOPED_PATHNAMES.includes(pathname)) return null;

  function select(scope: StoreCategoryScope) {
    if (scope === active) return;
    const params = withStoreCategoryScope(searchParams.toString(), scope);
    // Pagination, when added, resets here alongside the scope.
    params.delete("page");
    startTransition(() => {
      router.push(params.size ? `${pathname}?${params}` : pathname);
    });
  }

  return (
    <div
      role="group"
      aria-label="Categoría de tienda"
      className={cn(
        "-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 transition-opacity md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden",
        isPending && "opacity-60",
      )}
    >
      {STORE_CATEGORY_SCOPES.map((scope) => {
        const isActive = scope === active;
        return (
          <button
            key={scope}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(scope)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {STORE_CATEGORY_SCOPE_LABELS[scope]}
          </button>
        );
      })}
    </div>
  );
}

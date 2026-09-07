"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PackageIcon,
  SearchIcon,
} from "lucide-react";
import { use, useMemo, useState } from "react";

type OrdersTotalsProps = {
  ordersTotalsPromise: Promise<
    {
      productId: number;
      productVariantId: number | null;
      productVariantLabel: string | null;
      productName: string;
      status: OrderStatus;
      totalQuantity: number;
    }[]
  >;
};

type ProductTotal = {
  groupKey: string;
  productName: string;
  totals: Partial<Record<OrderStatus, number>>;
  allTotalsSum: number;
};

const PAGE_SIZE = 10;
const STATUS_ORDER: OrderStatus[] = [
  "pending",
  "payment_verification",
  "processing",
  "paid",
  "delivered",
  "cancelled",
];
const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-violet-400",
  payment_verification: "bg-sky-400",
  processing: "bg-blue-500",
  paid: "bg-amber-400",
  delivered: "bg-emerald-400",
  cancelled: "bg-red-400",
};

export default function OrdersTotals({
  ordersTotalsPromise,
}: OrdersTotalsProps) {
  const ordersTotals = use(ordersTotalsPromise);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const groupedProducts = useMemo(
    () =>
      Object.values(
        ordersTotals.reduce(
          (acc, current) => {
            const key = `${current.productId}:${current.productVariantId ?? "base"}`;
            const existing = acc[key];
            acc[key] = {
              groupKey: key,
              productName:
                existing?.productName ??
                (current.productVariantLabel
                  ? `${current.productName} (${current.productVariantLabel})`
                  : current.productName),
              totals: {
                ...existing?.totals,
                [current.status]: current.totalQuantity,
              },
              allTotalsSum:
                (existing?.allTotalsSum ?? 0) + current.totalQuantity,
            };
            return acc;
          },
          {} as Record<string, ProductTotal>,
        ),
      ).sort((a, b) => b.allTotalsSum - a.allTotalsSum),
    [ordersTotals],
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    if (!normalizedQuery) return groupedProducts;
    return groupedProducts.filter((product) =>
      product.productName.toLocaleLowerCase("es").includes(normalizedQuery),
    );
  }, [groupedProducts, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rendimiento por producto</h2>
          <p className="text-xs text-muted-foreground">
            {filteredProducts.length} productos y variantes · ordenados por
            unidades
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar producto o variante"
            aria-label="Buscar producto o variante"
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="divide-y">
        {visibleProducts.map((product) => (
          <ProductRow key={product.groupKey} product={product} />
        ))}
        {visibleProducts.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No hay productos que coincidan con la búsqueda.
          </div>
        )}
      </div>

      {filteredProducts.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredProducts.length)} de{" "}
            {filteredProducts.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="min-w-16 text-center">
              {safePage} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={safePage === totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              aria-label="Página siguiente"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProductRow({ product }: { product: ProductTotal }) {
  const activeStatuses = STATUS_ORDER.filter(
    (status) => (product.totals[status] ?? 0) > 0,
  );

  return (
    <div className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1.35fr)_5rem_minmax(16rem,1fr)] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <PackageIcon className="h-4 w-4" />
        </span>
        <p className="truncate text-sm font-medium" title={product.productName}>
          {product.productName}
        </p>
      </div>

      <div className="flex items-baseline justify-between sm:block">
        <span className="text-xs text-muted-foreground sm:hidden">
          Unidades
        </span>
        <span className="font-mono text-base font-semibold tabular-nums">
          {product.allTotalsSum}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          {activeStatuses.map((status) => (
            <span
              key={status}
              className={STATUS_COLORS[status]}
              style={{
                width: `${((product.totals[status] ?? 0) / product.allTotalsSum) * 100}%`,
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {activeStatuses.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status]}`}
              />
              {getOrderStatusLabel(status)}
              <span className="font-medium tabular-nums text-foreground">
                {product.totals[status]}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

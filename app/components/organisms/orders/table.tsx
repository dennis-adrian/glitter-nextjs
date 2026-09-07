"use client";

import {
  columns,
  columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import OrdersBulkActions from "@/app/components/organisms/orders/orders-bulk-actions";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { DataTableDensityToggle } from "@/app/components/ui/data_table/density-toggle";
import { AdminOrderListRow, OrderStatus } from "@/app/lib/orders/definitions";
import {
  storeOrdersQueryToSearchParams,
  type StoreOrdersQuery,
} from "@/app/lib/orders/query-schema";
import type { OrderStatusCounts } from "@/app/lib/orders/actions";
import { BULK_ORDER_STATUS_LIMIT } from "@/app/lib/orders/status-transitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import {
  getRentalOrderFilterLabel,
  type RentalOrderFilter,
} from "@/app/lib/rentals/order-filters";
import { cn } from "@/lib/utils";
import { DownloadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useOptimistic, useTransition } from "react";

type ActiveStatus = OrderStatus | "all" | "needs_attention";

type OrdersTableProps = {
  ordersPromise: Promise<AdminOrderListRow[]>;
  countsPromise: Promise<OrderStatusCounts>;
  query: StoreOrdersQuery;
};

const RENTAL_FILTER_OPTIONS: { value: RentalOrderFilter; label: string }[] = [
  { value: "all", label: getRentalOrderFilterLabel("all") },
  { value: "has_rental", label: getRentalOrderFilterLabel("has_rental") },
  { value: "out", label: getRentalOrderFilterLabel("out") },
  {
    value: "partially_returned",
    label: getRentalOrderFilterLabel("partially_returned"),
  },
  { value: "returned", label: getRentalOrderFilterLabel("returned") },
];

const STATUS_OPTIONS: { value: ActiveStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "needs_attention", label: "Requieren atención" },
  { value: "pending", label: getOrderStatusLabel("pending") },
  {
    value: "payment_verification",
    label: getOrderStatusLabel("payment_verification"),
  },
  { value: "processing", label: getOrderStatusLabel("processing") },
  { value: "paid", label: getOrderStatusLabel("paid") },
  { value: "delivered", label: getOrderStatusLabel("delivered") },
  { value: "cancelled", label: getOrderStatusLabel("cancelled") },
];

function OrdersExportButton({ query }: { query: StoreOrdersQuery }) {
  const params = storeOrdersQueryToSearchParams(query);
  const href = (format: "summary" | "line_items") => {
    const exportParams = new URLSearchParams(params);
    exportParams.set("format", format);
    return `/api/store/orders/export?${exportParams}`;
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" asChild>
        <a href={href("summary")}>
          <DownloadIcon className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:block">Exportar CSV</span>
        </a>
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={href("line_items")}>
          <DownloadIcon className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:block">Exportar líneas</span>
        </a>
      </Button>
    </div>
  );
}

export default function OrdersTable({
  ordersPromise,
  countsPromise,
  query,
}: OrdersTableProps) {
  const orders = use(ordersPromise);
  const counts = use(countsPromise);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const selectedStatuses = (
    query.statuses || (query.status === "all" ? "" : query.status)
  )
    .split(",")
    .filter(Boolean);
  const [optimisticStatuses, setOptimisticStatuses] =
    useOptimistic(selectedStatuses);
  const [optimisticRentalFilter, setOptimisticRentalFilter] = useOptimistic(
    query.rental,
  );

  function navigate(next: StoreOrdersQuery) {
    router.push(
      `/dashboard/store/orders?${storeOrdersQueryToSearchParams(next)}`,
    );
  }

  function handleStatusChange(value: ActiveStatus) {
    if (value === "all") {
      startTransition(() => {
        setOptimisticStatuses([]);
        navigate({ ...query, status: "all", statuses: "" });
      });
      return;
    }
    const currentStatuses = optimisticStatuses.filter(
      (status) => status !== "all",
    );
    const next = currentStatuses.includes(value)
      ? currentStatuses.filter((status) => status !== value)
      : [...currentStatuses, value];
    startTransition(() => {
      setOptimisticStatuses(next);
      navigate({
        ...query,
        status: (next[0] as ActiveStatus | undefined) ?? "all",
        statuses: next.join(","),
        rental: optimisticRentalFilter,
      });
    });
  }

  function handleRentalFilterChange(value: RentalOrderFilter) {
    startTransition(() => {
      setOptimisticRentalFilter(value);
      navigate({
        ...query,
        status: (optimisticStatuses[0] as ActiveStatus | undefined) ?? "all",
        statuses: optimisticStatuses.join(","),
        rental: value,
      });
    });
  }

  return (
    <div
      className={cn(
        "transition-opacity",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Composable filters: each status chip toggles independently. */}
      <div className="mb-4 rounded-xl border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filtros de estado
          </span>
          <span className="text-xs text-muted-foreground">
            {optimisticStatuses.length
              ? `${optimisticStatuses.length} activos`
              : "Todos"}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {STATUS_OPTIONS.map((opt) => {
            const isActive =
              opt.value === "all"
                ? optimisticStatuses.length === 0
                : optimisticStatuses.includes(opt.value);
            const count =
              opt.value === "all"
                ? counts.all
                : counts[opt.value as keyof OrderStatusCounts];
            return (
              <button
                key={opt.value}
                aria-pressed={isActive}
                disabled={count === 0 && !isActive}
                onClick={() => handleStatusChange(opt.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                  count === 0 && !isActive && "opacity-50",
                )}
              >
                {opt.label}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isActive
                      ? "text-primary-foreground/70"
                      : "text-foreground/50",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-4 [&::-webkit-scrollbar]:hidden">
        {RENTAL_FILTER_OPTIONS.map((opt) => {
          const isActive = optimisticRentalFilter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleRentalFilterChange(opt.value)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Date filter */}
      <div className="mb-3">
        <OrdersDateFilter
          period={query.period}
          dateFrom={query.from ?? ""}
          dateTo={query.to ?? ""}
          hasCustomRange={Boolean(query.from || query.to)}
          onPeriodChange={(period) =>
            navigate({ ...query, period, from: undefined, to: undefined })
          }
          onFromChange={(from) =>
            navigate({ ...query, period: "custom", from: from || undefined })
          }
          onToChange={(to) =>
            navigate({ ...query, period: "custom", to: to || undefined })
          }
        />
      </div>

      <DataTable
        key={[
          optimisticStatuses.join(",") || "all",
          optimisticRentalFilter,
          query.period,
          query.from ?? "",
          query.to ?? "",
          query.q,
          query.category,
        ].join("|")}
        columns={columns}
        data={orders}
        columnTitles={columnTitles}
        density={query.view}
        initialState={
          optimisticStatuses.length === 1 &&
          optimisticStatuses[0] !== "needs_attention"
            ? { columnVisibility: { status: false } }
            : undefined
        }
        selectable
        maxSelectable={BULK_ORDER_STATUS_LIMIT}
        getRowId={(order) => String(order.id)}
        actions={(table) => (
          <div className="flex items-center gap-2">
            <OrdersBulkActions
              orders={table
                .getSelectedRowModel()
                .rows.map((row) => row.original)}
              onDone={() => table.resetRowSelection()}
            />
            <OrdersExportButton query={query} />
            <DataTableDensityToggle
              value={query.view}
              onChange={(view) => navigate({ ...query, view })}
            />
          </div>
        )}
      />
    </div>
  );
}

"use client";

import {
  columns,
  columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  storeOrdersQueryToSearchParams,
  type StoreOrdersQuery,
} from "@/app/lib/orders/query-schema";
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
  ordersPromise: Promise<OrderWithRelations[]>;
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
  query,
}: OrdersTableProps) {
  const orders = use(ordersPromise);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(query.status);
  const [optimisticRentalFilter, setOptimisticRentalFilter] = useOptimistic(
    query.rental,
  );

  function navigate(next: StoreOrdersQuery) {
    router.push(
      `/dashboard/store/orders?${storeOrdersQueryToSearchParams(next)}`,
    );
  }

  function handleStatusChange(value: ActiveStatus) {
    startTransition(() => {
      setOptimisticStatus(value);
      navigate({ ...query, status: value, rental: optimisticRentalFilter });
    });
  }

  function handleRentalFilterChange(value: RentalOrderFilter) {
    startTransition(() => {
      setOptimisticRentalFilter(value);
      navigate({ ...query, status: optimisticStatus, rental: value });
    });
  }

  return (
    <div
      className={cn(
        "transition-opacity",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto border-b mb-4 [&::-webkit-scrollbar]:hidden">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = optimisticStatus === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={cn(
                "shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300",
              )}
            >
              {opt.label}
            </button>
          );
        })}
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
        key={optimisticStatus}
        columns={columns}
        data={orders}
        columnTitles={columnTitles}
        initialState={
          optimisticStatus !== "all"
            ? { columnVisibility: { status: false } }
            : undefined
        }
        actions={() => <OrdersExportButton query={query} />}
      />
    </div>
  );
}

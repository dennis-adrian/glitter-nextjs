"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  storeOrdersQueryToSearchParams,
  type StoreOrdersQuery,
} from "@/app/lib/orders/query-schema";
import {
  getOrderItemDisplayName,
  getOrderStatusLabel,
} from "@/app/lib/orders/utils";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { getRentalOrderFilterLabel } from "@/app/lib/rentals/order-filters";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  DownloadIcon,
  ReceiptIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useOptimistic, useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

type ActiveStatus = OrderStatus | "all" | "needs_attention";

type OrdersCardListProps = {
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

const STATUS_OPTIONS: {
  value: "" | OrderStatus | "needs_attention";
  label: string;
}[] = [
  { value: "", label: "Todos" },
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

function OrderCard({
  order,
  selectedStatuses,
}: {
  order: OrderWithRelations;
  selectedStatuses: string[];
}) {
  const router = useRouter();
  const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);
  const goToOrder = () => router.push(`/dashboard/store/orders/${order.id}`);

  const isOverdue =
    !!order.paymentDueDate &&
    formatDate(order.paymentDueDate) < nowInStore &&
    (order.status === "pending" || order.status === "payment_verification");

  const hasPendingVoucher =
    !!order.paymentVoucherUrl && order.status === "payment_verification";

  const isSingleConcreteStatus =
    selectedStatuses.length === 1 && selectedStatuses[0] !== "needs_attention";
  const showStatusBadge = !isSingleConcreteStatus;
  const showOverdueBadge =
    isOverdue &&
    (!isSingleConcreteStatus ||
      selectedStatuses[0] === "pending" ||
      selectedStatuses[0] === "payment_verification");

  const itemsPreview = order.orderItems
    .slice(0, 2)
    .map((item) => `${item.quantity}× ${getOrderItemDisplayName(item)}`)
    .join(", ");
  const extraItems =
    order.orderItems.length > 2 ? ` +${order.orderItems.length - 2} más` : "";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/40",
        isOverdue && "border-red-200 bg-red-50/30",
      )}
      role="button"
      tabIndex={0}
      onClick={goToOrder}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goToOrder();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">#{order.id}</span>
              {showStatusBadge && <OrderStatusBadge status={order.status} />}
              {showOverdueBadge && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  <AlertTriangleIcon className="h-3 w-3" />
                  Vencido
                </span>
              )}
              {hasPendingVoucher && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  <ReceiptIcon className="h-3 w-3" />
                  Comprobante
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate">
              {order.customer?.displayName ?? order.guestName ?? "Invitado"}
            </p>
            {!order.customer && order.guestPhone && (
              <div onClick={(e) => e.stopPropagation()}>
                <SocialMediaBadge
                  socialMediaType="whatsapp"
                  username={order.guestPhone}
                />
              </div>
            )}

            {order.orderItems.length > 0 && (
              <p className="text-xs text-muted-foreground truncate">
                {itemsPreview}
                {extraItems}
              </p>
            )}

            <p className="text-xs text-muted-foreground capitalize">
              {formatDate(order.createdAt).toLocaleString(DateTime.DATE_MED)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm">
                Bs {order.totalAmount.toFixed(2)}
              </span>
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <OrdersActionsCell order={order} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersCardList({
  ordersPromise,
  query,
}: OrdersCardListProps) {
  const orders = use(ordersPromise);
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
  const [search, setSearch] = useState(query.q);
  const [previousQuerySearch, setPreviousQuerySearch] = useState(query.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (query.q !== previousQuerySearch) {
    setPreviousQuerySearch(query.q);
    setSearch(query.q);
  }

  function navigate(next: StoreOrdersQuery) {
    router.push(
      `/dashboard/store/orders?${storeOrdersQueryToSearchParams(next)}`,
    );
  }

  const updateSearch = useDebouncedCallback((q: string) => {
    startTransition(() => navigate({ ...query, q }));
  }, 300);

  function handleStatusChange(value: "" | OrderStatus | "needs_attention") {
    if (value === "") {
      startTransition(() => {
        setOptimisticStatuses([]);
        navigate({ ...query, status: "all", statuses: "" });
      });
      return;
    }
    const next = selectedStatuses.includes(value)
      ? selectedStatuses.filter((status) => status !== value)
      : [...selectedStatuses, value];
    const statuses = next.join(",");
    startTransition(() => {
      setOptimisticStatuses(next);
      navigate({
        ...query,
        status: (next[0] as ActiveStatus | undefined) ?? "all",
        statuses,
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

  const exportParams = storeOrdersQueryToSearchParams(query);
  exportParams.set("format", "summary");

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Estado
          </span>
          <div className="flex items-center gap-1.5">
            <a
              href={`/api/store/orders/export?${exportParams}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              CSV
            </a>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                filtersOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <SlidersHorizontalIcon className="h-3.5 w-3.5" />
              Filtros
              {(search !== "" ||
                query.from ||
                query.to ||
                query.period !== "all") && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 [&::-webkit-scrollbar]:hidden">
          {STATUS_OPTIONS.map((opt) => {
            const isActive =
              opt.value === ""
                ? selectedStatuses.length === 0
                : selectedStatuses.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Alquiler
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 [&::-webkit-scrollbar]:hidden">
          {RENTAL_FILTER_OPTIONS.map((opt) => {
            const isActive = optimisticRentalFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleRentalFilterChange(opt.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary border-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtersOpen && (
        <>
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, ID o producto..."
              value={search}
              onChange={(e) => {
                const q = e.target.value;
                setSearch(q);
                updateSearch(q.trim());
              }}
              className="pl-9"
            />
          </div>

          {/* Date filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Fecha
            </span>
            <OrdersDateFilter
              period={query.period}
              dateFrom={query.from ?? ""}
              dateTo={query.to ?? ""}
              hasCustomRange={Boolean(query.from || query.to)}
              onPeriodChange={(period) =>
                navigate({ ...query, period, from: undefined, to: undefined })
              }
              onFromChange={(from) =>
                navigate({
                  ...query,
                  period: "custom",
                  from: from || undefined,
                })
              }
              onToChange={(to) =>
                navigate({ ...query, period: "custom", to: to || undefined })
              }
            />
          </div>
        </>
      )}

      {/* Cards */}
      <div
        className={cn(
          "flex flex-col gap-3 transition-opacity",
          isPending && "opacity-60 pointer-events-none",
        )}
      >
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay pedidos para mostrar.
          </p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              selectedStatuses={optimisticStatuses}
            />
          ))
        )}
      </div>
    </div>
  );
}

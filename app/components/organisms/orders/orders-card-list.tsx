"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import OrdersBulkActions from "@/app/components/organisms/orders/orders-bulk-actions";
import OrdersFilterSheet from "@/app/components/organisms/orders/orders-filter-sheet";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { AdminOrderListRow, OrderStatus } from "@/app/lib/orders/definitions";
import type { OrderStatusCounts } from "@/app/lib/orders/actions";
import { BULK_ORDER_STATUS_LIMIT } from "@/app/lib/orders/status-transitions";
import {
  storeOrdersQueryToSearchParams,
  type StoreOrdersQuery,
} from "@/app/lib/orders/query-schema";
import {
  getOrderItemDisplayName,
  getOrderStatusLabel,
} from "@/app/lib/orders/utils";
import {
  getStoreCategoryBadgeLabel,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { getRentalOrderFilterLabel } from "@/app/lib/rentals/order-filters";
import { Checkbox } from "@/app/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  DownloadIcon,
  ListChecksIcon,
  ReceiptIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

type ActiveStatus = OrderStatus | "all" | "needs_attention";

type OrdersCardListProps = {
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
  categoryScope,
  selectionMode,
  isSelected,
  canSelect,
  onToggleSelect,
}: {
  order: AdminOrderListRow;
  selectedStatuses: string[];
  categoryScope: StoreCategoryScope;
  selectionMode: boolean;
  isSelected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
}) {
  const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);

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

  // Category only earns a slot when the list isn't already scoped to one.
  const categoryLabel = order.isMixedCategory
    ? "Pedido mixto"
    : order.storeCategories.map(getStoreCategoryBadgeLabel).join(", ");
  const metaPrefix = [
    categoryScope === "all" && categoryLabel ? categoryLabel : null,
    order.orderItems.length > 0 ? `${itemsPreview}${extraItems}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const createdLabel = formatDate(order.createdAt).toLocaleString(
    DateTime.DATE_MED,
  );

  return (
    <Card
      className={cn(
        "relative transition-colors hover:bg-accent/40",
        selectionMode && "cursor-pointer",
        // A soft tint, not an edge stripe: the "Vencido" pill already labels
        // the state, so the card only needs to be findable in a scan.
        isOverdue && "border-red-200 bg-red-50/30",
        selectionMode && isSelected && "border-primary bg-primary/5",
      )}
      role={selectionMode ? "checkbox" : undefined}
      aria-checked={selectionMode ? isSelected : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      onClick={selectionMode ? onToggleSelect : undefined}
      onKeyDown={
        selectionMode
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleSelect();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {selectionMode && (
            /* Purely visual: the card itself carries the checkbox semantics. */
            <Checkbox
              checked={isSelected}
              disabled={!canSelect}
              onCheckedChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 shrink-0"
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* The two things scanned first: which order, and how much. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{order.id}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <span className="text-base font-semibold tabular-nums">
                  Bs {order.totalAmount.toFixed(2)}
                </span>
                {!selectionMode && (
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </div>

            {/* Routine state is a dot; pills are reserved for exceptions. */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {showStatusBadge && (
                  <OrderStatusBadge status={order.status} appearance="dot" />
                )}
                {showOverdueBadge && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-red-300 bg-red-50 text-red-600"
                  >
                    <AlertTriangleIcon className="h-3 w-3" />
                    Vencido
                  </Badge>
                )}
                {hasPendingVoucher && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-blue-300 bg-blue-50 text-blue-600"
                  >
                    <ReceiptIcon className="h-3 w-3" />
                    Comprobante
                  </Badge>
                )}
              </div>
              {!selectionMode && (
                <span className="relative z-10 shrink-0">
                  <OrdersActionsCell order={order} />
                </span>
              )}
            </div>

            <p className="truncate text-sm font-medium">
              {order.customer?.displayName ?? order.guestName ?? "Invitado"}
            </p>
            {!order.customer && order.guestPhone && (
              <div className="relative z-10">
                <SocialMediaBadge
                  socialMediaType="whatsapp"
                  username={order.guestPhone}
                />
              </div>
            )}

            {/* Category, items and date collapse into one muted line. */}
            <p className="truncate text-xs text-muted-foreground">
              {metaPrefix && `${metaPrefix} · `}
              <span className="capitalize">{createdLabel}</span>
            </p>

            {order.isMixedCategory &&
              order.scopedSubtotal !== order.totalAmount && (
                <span className="text-xs text-muted-foreground">
                  Subtotal en este filtro{" "}
                  <span className="tabular-nums">
                    Bs {order.scopedSubtotal.toFixed(2)}
                  </span>
                </span>
              )}
          </div>
        </div>
      </CardContent>
      {!selectionMode && (
        <Link
          href={`/dashboard/store/orders/${order.id}`}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Pedido #${order.id}, ${
            order.customer?.displayName ?? order.guestName ?? "Invitado"
          }, ${getOrderStatusLabel(order.status)}`}
        />
      )}
    </Card>
  );
}

export default function OrdersCardList({
  ordersPromise,
  countsPromise,
  query,
}: OrdersCardListProps) {
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
  const [search, setSearch] = useState(query.q);
  const [previousQuerySearch, setPreviousQuerySearch] = useState(query.q);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const queryScopeKey = [
    optimisticStatuses.join(",") || "all",
    optimisticRentalFilter,
    query.period,
    query.from ?? "",
    query.to ?? "",
    query.q,
    query.category,
  ].join("|");
  const [selectionScopeKey, setSelectionScopeKey] = useState(queryScopeKey);
  const scopeChanged = queryScopeKey !== selectionScopeKey;
  if (scopeChanged) {
    setSelectionScopeKey(queryScopeKey);
  }

  // Drop IDs that left the visible list so they stay unselected if they return.
  // Clear all selection when the active query scope changes.
  const visibleIds = new Set(orders.map((order) => order.id));
  const prunedSelectedIds = scopeChanged
    ? []
    : selectedIds.filter((id) => visibleIds.has(id));
  if (prunedSelectedIds.length !== selectedIds.length) {
    setSelectedIds(prunedSelectedIds);
  }

  const selectedOrders = orders.filter((order) =>
    prunedSelectedIds.includes(order.id),
  );
  const selectionCap = Math.min(orders.length, BULK_ORDER_STATUS_LIMIT);
  const allSelected =
    orders.length > 0 && selectedOrders.length === selectionCap;
  const atSelectionLimit = prunedSelectedIds.length >= BULK_ORDER_STATUS_LIMIT;

  function toggleSelected(orderId: number) {
    if (prunedSelectedIds.includes(orderId)) {
      setSelectedIds((current) => current.filter((id) => id !== orderId));
      return;
    }
    if (prunedSelectedIds.length >= BULK_ORDER_STATUS_LIMIT) {
      toast.warning(
        `Solo puedes seleccionar hasta ${BULK_ORDER_STATUS_LIMIT} pedidos a la vez.`,
      );
      return;
    }
    setSelectedIds((current) =>
      current.includes(orderId) ? current : [...current, orderId],
    );
  }

  function exitSelectionMode() {
    setSelectedIds([]);
    setSelectionMode(false);
  }

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
    const currentStatuses = optimisticStatuses.filter(
      (status) => status !== "all",
    );
    const next = currentStatuses.includes(value)
      ? currentStatuses.filter((status) => status !== value)
      : [...currentStatuses, value];
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

  function handleClearFilters() {
    startTransition(() => {
      setOptimisticStatuses([]);
      setOptimisticRentalFilter("all");
      setSearch("");
      navigate({
        ...query,
        status: "all",
        statuses: "",
        rental: "all",
        period: "all",
        from: undefined,
        to: undefined,
        q: "",
      });
    });
  }

  const exportParams = storeOrdersQueryToSearchParams(query);
  exportParams.set("format", "summary");

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Estado
          </span>
          {/* Three controls plus the label overflow a 320px viewport, so let
              them wrap instead of squeezing the chips row off screen. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <a
              href={`/api/store/orders/export?${exportParams}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              CSV
            </a>
            <button
              onClick={() =>
                selectionMode ? exitSelectionMode() : setSelectionMode(true)
              }
              aria-pressed={selectionMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                selectionMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <ListChecksIcon className="h-3.5 w-3.5" />
              {selectionMode ? "Cancelar" : "Seleccionar"}
            </button>
            <OrdersFilterSheet
              query={query}
              statusOptions={STATUS_OPTIONS}
              rentalOptions={RENTAL_FILTER_OPTIONS}
              counts={counts}
              selectedStatuses={optimisticStatuses}
              rentalFilter={optimisticRentalFilter}
              resultCount={orders.length}
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                updateSearch(value.trim());
              }}
              onStatusToggle={handleStatusChange}
              onRentalChange={handleRentalFilterChange}
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
              onClear={handleClearFilters}
            />
          </div>
        </div>
        {/* Status stays on the surface rather than moving into the sheet:
            it is the most common switch, and burying it would turn a one-tap
            action into three. The sheet still carries it, plus the rest. */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 [&::-webkit-scrollbar]:hidden">
          {STATUS_OPTIONS.map((opt) => {
            const isActive =
              opt.value === ""
                ? optimisticStatuses.length === 0
                : optimisticStatuses.includes(opt.value);
            const count =
              opt.value === ""
                ? counts.all
                : counts[opt.value as keyof OrderStatusCounts];
            return (
              <button
                key={opt.value}
                aria-pressed={isActive}
                disabled={count === 0 && !isActive}
                onClick={() => handleStatusChange(opt.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                  count === 0 && !isActive && "opacity-50",
                )}
              >
                {opt.label}
                <span
                  className={cn(
                    "tabular-nums",
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
              categoryScope={query.category}
              selectionMode={selectionMode}
              isSelected={prunedSelectedIds.includes(order.id)}
              canSelect={
                prunedSelectedIds.includes(order.id) || !atSelectionLimit
              }
              onToggleSelect={() => toggleSelected(order.id)}
            />
          ))
        )}
      </div>

      {selectionMode && (
        <div
          // Bleeds to the edges of the store layout, which is px-3 / md:px-6.
          className="sticky bottom-0 z-30 -mx-3 flex flex-col gap-2 border-t bg-background px-3 pt-3 sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6"
          // Keeps the actions clear of the iOS home indicator.
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            onClick={() => {
              if (allSelected) {
                setSelectedIds([]);
                return;
              }
              if (orders.length > BULK_ORDER_STATUS_LIMIT) {
                toast.warning(
                  `Solo puedes seleccionar hasta ${BULK_ORDER_STATUS_LIMIT} pedidos a la vez.`,
                );
              }
              setSelectedIds(
                orders
                  .slice(0, BULK_ORDER_STATUS_LIMIT)
                  .map((order) => order.id),
              );
            }}
            disabled={orders.length === 0}
            className="self-start text-xs font-medium text-primary disabled:text-muted-foreground"
          >
            {allSelected ? "Quitar todos" : "Seleccionar todos"}
          </button>
          {selectedOrders.length > 0 ? (
            <OrdersBulkActions
              orders={selectedOrders}
              onDone={exitSelectionMode}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              Elige pedidos para aplicar una acción.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import OrdersBulkActions from "@/app/components/organisms/orders/orders-bulk-actions";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { AdminOrderListRow, OrderStatus } from "@/app/lib/orders/definitions";
import { BULK_ORDER_STATUS_LIMIT } from "@/app/lib/orders/status-transitions";
import {
  storeOrdersQueryToSearchParams,
  type StoreOrdersQuery,
} from "@/app/lib/orders/query-schema";
import {
  getOrderItemDisplayName,
  getOrderStatusLabel,
} from "@/app/lib/orders/utils";
import { getStoreCategoryBadgeLabel } from "@/app/lib/store/category";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { getRentalOrderFilterLabel } from "@/app/lib/rentals/order-filters";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  DownloadIcon,
  ListChecksIcon,
  ReceiptIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

type ActiveStatus = OrderStatus | "all" | "needs_attention";

type OrdersCardListProps = {
  ordersPromise: Promise<AdminOrderListRow[]>;
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
  selectionMode,
  isSelected,
  canSelect,
  onToggleSelect,
}: {
  order: AdminOrderListRow;
  selectedStatuses: string[];
  selectionMode: boolean;
  isSelected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
}) {
  const router = useRouter();
  const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);
  // While selecting, tapping the card picks it instead of leaving the list.
  const activateCard = () =>
    selectionMode
      ? onToggleSelect()
      : router.push(`/dashboard/store/orders/${order.id}`);

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
        selectionMode && isSelected && "border-primary bg-primary/5",
      )}
      role={selectionMode ? "checkbox" : "button"}
      aria-checked={selectionMode ? isSelected : undefined}
      tabIndex={0}
      onClick={activateCard}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateCard();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
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
              {order.storeCategories.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {getStoreCategoryBadgeLabel(category)}
                </span>
              ))}
              {order.isMixedCategory && (
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                  Pedido mixto
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
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm">
                  Bs {order.totalAmount.toFixed(2)}
                </span>
                {!selectionMode && (
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Total del pedido
              </span>
              {order.isMixedCategory &&
                order.scopedSubtotal !== order.totalAmount && (
                  <span className="text-xs text-muted-foreground">
                    Subtotal en este filtro Bs {order.scopedSubtotal.toFixed(2)}
                  </span>
                )}
            </div>
            {!selectionMode && (
              <div onClick={(e) => e.stopPropagation()}>
                <OrdersActionsCell order={order} />
              </div>
            )}
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
                aria-pressed={isActive}
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

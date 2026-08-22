"use client";

import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import type { OrderStatusCounts } from "@/app/lib/orders/actions";
import type { StoreOrdersQuery } from "@/app/lib/orders/query-schema";
import type { OrderStatus } from "@/app/lib/orders/definitions";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { cn } from "@/lib/utils";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

export type StatusOption = {
  value: "" | OrderStatus | "needs_attention";
  label: string;
};

export type RentalOption = { value: RentalOrderFilter; label: string };

type OrdersFilterSheetProps = {
  query: StoreOrdersQuery;
  statusOptions: StatusOption[];
  rentalOptions: RentalOption[];
  counts: OrderStatusCounts;
  selectedStatuses: string[];
  rentalFilter: RentalOrderFilter;
  /** Rows currently on screen, so the confirm button can name the outcome. */
  resultCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  onStatusToggle: (value: StatusOption["value"]) => void;
  onRentalChange: (value: RentalOrderFilter) => void;
  onPeriodChange: (period: StoreOrdersQuery["period"]) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
};

function FacetRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  // An empty facet stays visible but disabled: a vanishing option reads as a
  // broken feature, while a zero says "nothing here" before you spend a tap.
  const empty = count === 0;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={empty && !active}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-foreground hover:bg-accent",
        empty && !active && "opacity-50",
      )}
    >
      {label}
      {count !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

export default function OrdersFilterSheet({
  query,
  statusOptions,
  rentalOptions,
  counts,
  selectedStatuses,
  rentalFilter,
  resultCount,
  search,
  onSearchChange,
  onStatusToggle,
  onRentalChange,
  onPeriodChange,
  onFromChange,
  onToChange,
  onClear,
}: OrdersFilterSheetProps) {
  const [open, setOpen] = useState(false);

  const activeCount =
    selectedStatuses.length +
    (rentalFilter !== "all" ? 1 : 0) +
    (query.period !== "all" ? 1 : 0) +
    (search.trim() !== "" ? 1 : 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-9 gap-1.5 text-xs"
          aria-label={
            activeCount > 0 ? `Filtros, ${activeCount} activos` : "Filtros"
          }
        >
          <SlidersHorizontalIcon className="h-3.5 w-3.5" />
          Filtros
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle className="text-base">Filtros</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, ID o producto..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 text-base"
            />
          </div>

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado
            </h3>
            <div className="grid gap-2">
              {statusOptions.map((option) => (
                <FacetRow
                  key={option.value || "all"}
                  label={option.label}
                  count={
                    option.value === ""
                      ? counts.all
                      : counts[option.value as keyof OrderStatusCounts]
                  }
                  active={
                    option.value === ""
                      ? selectedStatuses.length === 0
                      : selectedStatuses.includes(option.value)
                  }
                  onClick={() => onStatusToggle(option.value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Alquiler
            </h3>
            <div className="grid gap-2">
              {rentalOptions.map((option) => (
                <FacetRow
                  key={option.value}
                  label={option.label}
                  active={rentalFilter === option.value}
                  onClick={() => onRentalChange(option.value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fecha
            </h3>
            <OrdersDateFilter
              period={query.period}
              dateFrom={query.from ?? ""}
              dateTo={query.to ?? ""}
              hasCustomRange={Boolean(query.from || query.to)}
              onPeriodChange={onPeriodChange}
              onFromChange={onFromChange}
              onToChange={onToChange}
            />
          </section>
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            Limpiar
          </Button>
          <Button className="min-h-11 flex-1" onClick={() => setOpen(false)}>
            Ver {resultCount} {resultCount === 1 ? "pedido" : "pedidos"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

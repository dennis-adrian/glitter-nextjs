"use client";
"use no memo";

import { XIcon } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/app/components/ui/button";
import {
  selectedValuesFor,
  type FilterOption,
} from "@/app/components/ui/data_table/facet-filter";

export type FilterGroup = {
  columnId: string;
  label: string;
  options: FilterOption[];
};

type ActiveFiltersProps<TData> = {
  filters: FilterGroup[];
  table: Table<TData>;
  /** Rows left after filtering, shown so the effect of a filter is legible. */
  visibleCount: number;
  /** Rows before filtering; omitted when only the server knows it. */
  totalCount?: number;
};

/**
 * What is currently filtered, as removable chips.
 *
 * The previous toolbar showed a single "Filtros" button whether or not
 * anything was applied, so a table narrowed to four rows looked identical to
 * one showing everything — and clearing meant reopening the menu and
 * unchecking each option from memory.
 */
export function DataTableActiveFilters<TData>({
  filters,
  table,
  visibleCount,
  totalCount,
}: ActiveFiltersProps<TData>) {
  const active = filters.flatMap((group) => {
    const selected = selectedValuesFor(table, group.columnId);
    return selected.map((value) => ({
      columnId: group.columnId,
      groupLabel: group.label,
      value,
      label:
        group.options.find((option) => option.value === value)?.label ?? value,
    }));
  });

  if (active.length === 0) return null;

  function remove(columnId: string, value: string) {
    table.setColumnFilters((state) => {
      const filter = state.find((entry) => entry.id === columnId);
      if (!filter) return state;
      const values = (
        Array.isArray(filter.value) ? filter.value : [filter.value]
      ) as string[];
      const next = values.filter((entry) => String(entry) !== value);
      const others = state.filter((entry) => entry.id !== columnId);
      return next.length === 0
        ? others
        : [...others, { id: columnId, value: next }];
    });
  }

  function clearAll() {
    const managed = new Set(filters.map((group) => group.columnId));
    // Only the faceted groups: the search box drives its own column filter and
    // clearing it from here would empty the box without telling anyone.
    table.setColumnFilters((state) =>
      state.filter((entry) => !managed.has(entry.id)),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((chip) => (
        <span
          key={`${chip.columnId}-${chip.value}`}
          className="inline-flex items-center gap-1 rounded-md border bg-background py-0.5 pl-2 pr-0.5 text-xs"
        >
          <span className="text-muted-foreground">{chip.groupLabel}:</span>
          {chip.label}
          <button
            type="button"
            aria-label={`Quitar ${chip.groupLabel}: ${chip.label}`}
            onClick={() => remove(chip.columnId, chip.value)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        className="h-6 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Limpiar filtros
      </Button>
      <span className="text-xs text-muted-foreground">
        {totalCount == null
          ? `${visibleCount} ${visibleCount === 1 ? "resultado" : "resultados"}`
          : `${visibleCount} de ${totalCount}`}
      </span>
    </div>
  );
}

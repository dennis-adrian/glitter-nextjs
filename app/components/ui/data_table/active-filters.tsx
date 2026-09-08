"use client";
"use no memo";

import { XIcon } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Badge } from "@/app/components/ui/badge";
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
  totalCount: number;
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
    <div className="flex flex-wrap items-center gap-2 pb-2">
      {active.map((chip) => (
        <Badge
          key={`${chip.columnId}-${chip.value}`}
          variant="secondary"
          className="gap-1 rounded-full pr-1 font-normal"
        >
          <span className="text-muted-foreground">{chip.groupLabel}:</span>
          {chip.label}
          <button
            type="button"
            aria-label={`Quitar ${chip.groupLabel}: ${chip.label}`}
            onClick={() => remove(chip.columnId, chip.value)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        className="h-7 px-2 text-xs"
      >
        Limpiar todo
      </Button>

      <span className="text-xs text-muted-foreground">
        {visibleCount} de {totalCount}
      </span>
    </div>
  );
}

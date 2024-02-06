"use client";

import { ColumnFilter, Table } from "@tanstack/react-table";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DataTableTypeFilterProps<TData> {
  columnFilters: ColumnFilter[];
  table: Table<TData>;
  options?: { value: string; label: string }[];
}
export function DataTableTypeFilter<TData>({
  columnFilters,
  table,
  options,
}: DataTableTypeFilterProps<TData>) {
  if (!options) return null;

  return (
    <>
      <DropdownMenuLabel>Tipo de Solicitud</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {options.map((type) => {
        return (
          <DropdownMenuCheckboxItem
            key={type.value}
            checked={columnFilters.some(
              (filter) => filter.id === "type" && filter.value === type.value,
            )}
            onCheckedChange={(value) => {
              table.setColumnFilters([
                {
                  id: "type",
                  value: type.value,
                },
              ]);
            }}
          >
            {type.label}
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

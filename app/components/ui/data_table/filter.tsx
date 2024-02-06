"use client";

import { ColumnFilter, Table } from "@tanstack/react-table";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DataTableFilterProps<TData> {
  columnFilters: ColumnFilter[];
  columnId: string;
  table: Table<TData>;
  options: { value: string; label: string }[];
}
export function DataTableFilter<TData>({
  columnFilters,
  columnId,
  table,
  options,
}: DataTableFilterProps<TData>) {
  return (
    <>
      <DropdownMenuLabel>Tipo de Solicitud</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {options.map((option) => {
        return (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={columnFilters.some(
              (filter) =>
                filter.id === columnId && filter.value === option.value,
            )}
            onCheckedChange={(value) => {
              table.setColumnFilters([
                {
                  id: columnId,
                  value: option.value,
                },
              ]);
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

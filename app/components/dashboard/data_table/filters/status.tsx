"use client";

import { ColumnFilter, Table } from "@tanstack/react-table";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DataTableStatusFilterProps<TData> {
  columnFilters: ColumnFilter[];
  table: Table<TData>;
  statusOptions?: { value: string; label: string }[];
}
export function DataTableStatusFilter<TData>({
  columnFilters,
  table,
  statusOptions,
}: DataTableStatusFilterProps<TData>) {
  if (!statusOptions) return null;

  return (
    <>
      <DropdownMenuLabel>Estado</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {statusOptions.map((status) => {
        return (
          <DropdownMenuCheckboxItem
            key={status.value}
            checked={columnFilters.some(
              (filter) =>
                filter.id === "status" && filter.value === status.value,
            )}
            onCheckedChange={(value) => {
              table.setColumnFilters([
                {
                  id: "status",
                  value: status.value,
                },
              ]);
            }}
          >
            {status.label}
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

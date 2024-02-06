"use client";

import { ColumnFilter, Table } from "@tanstack/react-table";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { FilterIcon } from "lucide-react";

interface DataTableStatusFilterProps<TData> {
  columnFilters: ColumnFilter[];
  table: Table<TData>;
  statusOptions: { value: string; label: string }[];
}
export function DataTableStatusFilter<TData>({
  columnFilters,
  table,
  statusOptions,
}: DataTableStatusFilterProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <FilterIcon className="sm:mr-2 h-4 w-4" />
          <span className="hidden sm:block">Estado</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

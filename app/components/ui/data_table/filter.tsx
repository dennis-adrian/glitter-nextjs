"use client";

import { Table } from "@tanstack/react-table";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  buildFilterValue,
  isFilterActive,
} from "@/app/components/ui/data_table/helpers";

interface DataTableFilterProps<TData> {
  columnId: string;
  table: Table<TData>;
  options: { value: string; label: string }[];
}
export function DataTableFilter<TData>({
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
            checked={isFilterActive(
              table.getState().columnFilters,
              columnId,
              option.value,
            )}
            onCheckedChange={() => {
              table.setColumnFilters((state) => {
                const filter = state.find((f) => f.id === columnId);
                if (!filter) {
                  return [...state, { id: columnId, value: [option.value] }];
                }

                return [
                  ...state.filter((f) => f.id !== columnId),
                  {
                    id: columnId,
                    value: buildFilterValue(filter, option.value),
                  },
                ];
              });
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

"use client";

import { useState } from "react";

import { SearchIcon } from "lucide-react";

import {
  ColumnDef,
  ColumnFilter,
  ColumnFiltersState,
  SortingState,
  Table as TableType,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableViewOptions } from "@/app/components/ui/data_table/column-toggle";
import { DataTableStatusFilter } from "@/app/components/dashboard/data_table/filters/status";
import { DataTablePagination } from "@/app/components/ui/data_table/pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableFilters } from "@/app/components/ui/data_table/filters";

interface DataTableFilterProps<TData> {
  component: React.FC<{
    columnFilters: ColumnFilter[];
    table: TableType<TData>;
  }>;
  props: Record<string, unknown>;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnTitles: Record<string, string>;
  filters?: DataTableFilterProps<TData>[];
}

export function DataTable<TData, TValue>({
  columns,
  columnTitles,
  data,
  filters = [],
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
      globalFilter: searchFilter,
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="flex items-center py-4 min-w-60 sm:min-w-80">
            <span className="relative w-0 left-3 top-1/2">
              <SearchIcon className="w-4 h-4 text-gray-500" />
            </span>
            <Input
              placeholder={"Buscar..."}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="max-w-sm pl-10"
            />
          </div>
          {filters.length > 0 && (
            <DataTableFilters>
              {filters.map(({ component: FilterComponent, props }, index) => (
                <FilterComponent
                  key={index}
                  {...props}
                  columnFilters={columnFilters}
                  table={table}
                />
              ))}
            </DataTableFilters>
          )}
        </div>
        <DataTableViewOptions table={table} columnTitles={columnTitles} />
      </div>
      <div className="rounded-md border mb-4">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

"use client";

import { useState } from "react";

import { SearchIcon } from "lucide-react";

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableViewOptions } from "@/app/components/ui/data_table/column-toggle";
import { DataTableFilter } from "@/app/components/ui/data_table/filter";
import { DataTableFilters } from "@/app/components/ui/data_table/filters";
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
import { DataTableHeader } from "@/app/components/ui/data_table/data-table-header";
import { DataTableBody } from "@/app/components/ui/data_table/data-table-body";

interface DataTableFiltersProps {
  label?: string;
  options: { value: string; label: string }[];
  columnId: string;
}

export interface DataTableInitialState {
  columnVisibility?: Record<string, boolean>;
  columnPinning?: Record<string, string[]>;
  columnFilters?: ColumnFiltersState;
}

interface DataTableProps<TData, TValue> {
  aggregates?: { total: number };
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnTitles: Record<string, string>;
  filters?: DataTableFiltersProps[];
  initialState?: DataTableInitialState;
  limit: number;
  offset: number;
}

export function DataTable<TData, TValue>({
  aggregates,
  columns,
  columnTitles,
  data,
  filters = [],
  initialState,
  limit,
  offset,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialState?.columnFilters || [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    rowCount: aggregates?.total || 0,
    state: {
      sorting,
      columnFilters,
      globalFilter: searchFilter,
      pagination: { pageSize: limit, pageIndex: offset },
    },
    initialState: {
      columnPinning: {
        right: ["actions"],
      },
      ...initialState,
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex min-w-60 items-center py-2 sm:min-w-80">
            <span className="relative left-3 top-1/2 w-0">
              <SearchIcon className="h-4 w-4 text-gray-500" />
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
              {filters.map(({ columnId, options, label }, index) => (
                <DataTableFilter
                  key={index}
                  columnId={columnId}
                  label={label}
                  options={options}
                  table={table}
                />
              ))}
            </DataTableFilters>
          )}
        </div>
        <DataTableViewOptions table={table} columnTitles={columnTitles} />
      </div>
      <div className="mb-4 rounded-md border">
        <Table>
          <DataTableHeader table={table} />
          <DataTableBody table={table} columns={columns} />
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

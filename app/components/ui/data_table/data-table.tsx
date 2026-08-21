"use client";
"use no memo";

import { type ReactNode, useState } from "react";

import { SearchIcon } from "lucide-react";

import type { Table as TableInstance, Row } from "@tanstack/react-table";
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableViewOptions } from "@/app/components/ui/data_table/column-toggle";
import { DataTableBody } from "@/app/components/ui/data_table/data-table-body";
import { DataTableHeader } from "@/app/components/ui/data_table/data-table-header";
import { DataTableFilter } from "@/app/components/ui/data_table/filter";
import { DataTableFilters } from "@/app/components/ui/data_table/filters";
import { DataTablePagination } from "@/app/components/ui/data_table/pagination";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";

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
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnTitles: Record<string, string>;
  filters?: DataTableFiltersProps[];
  initialState?: DataTableInitialState;
  actions?: ReactNode | ((table: TableInstance<TData>) => ReactNode);
  selectable?: boolean;
  /** Caps how many rows can stay selected across pages. */
  maxSelectable?: number;
}

function clampRowSelection(
  prev: RowSelectionState,
  next: RowSelectionState,
  maxSelectable: number,
): RowSelectionState {
  const nextIds = Object.keys(next).filter((id) => next[id]);
  if (nextIds.length <= maxSelectable) return next;

  const previouslySelected = new Set(
    Object.keys(prev).filter((id) => prev[id]),
  );
  const kept: string[] = [];
  for (const id of nextIds) {
    if (previouslySelected.has(id)) kept.push(id);
  }
  for (const id of nextIds) {
    if (kept.length >= maxSelectable) break;
    if (!previouslySelected.has(id)) kept.push(id);
  }
  const limited: RowSelectionState = {};
  for (const id of kept.slice(0, maxSelectable)) {
    limited[id] = true;
  }
  return limited;
}

function createSelectColumn(maxSelectable?: number) {
  return {
    id: "select",
    header: ({ table }: { table: TableInstance<unknown> }) => {
      const allPageSelected = table.getIsAllPageRowsSelected();
      const somePageSelected = table.getIsSomePageRowsSelected();
      const selectedCount = table.getSelectedRowModel().rows.length;
      const atLimit = maxSelectable != null && selectedCount >= maxSelectable;
      return (
        <Checkbox
          checked={allPageSelected || (somePageSelected && "indeterminate")}
          disabled={atLimit && !allPageSelected && !somePageSelected}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      );
    },
    cell: ({
      row,
    }: {
      row: {
        getIsSelected: () => boolean;
        getCanSelect: () => boolean;
        toggleSelected: (v: boolean) => void;
      };
    }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}

export function DataTable<TData, TValue>({
  columns,
  columnTitles,
  data,
  filters = [],
  initialState,
  actions,
  selectable = false,
  maxSelectable,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialState?.columnFilters || [],
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const allColumns = selectable
    ? [
        createSelectColumn(maxSelectable) as ColumnDef<TData, TValue>,
        ...columns,
      ]
    : columns;

  // eslint-disable-next-line -- TanStack Table API incompatible with React Compiler
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    ...(selectable && {
      onRowSelectionChange: (updater) => {
        setRowSelection((prev) => {
          const next = typeof updater === "function" ? updater(prev) : updater;
          if (maxSelectable == null) return next;
          return clampRowSelection(prev, next, maxSelectable);
        });
      },
    }),
    ...(selectable &&
      maxSelectable != null && {
        enableRowSelection: (row: Row<TData>) =>
          Boolean(rowSelection[row.id]) ||
          Object.values(rowSelection).filter(Boolean).length < maxSelectable,
      }),
    state: {
      sorting,
      columnFilters,
      globalFilter: searchFilter,
      ...(selectable && { rowSelection }),
    },
    initialState: {
      columnPinning: {
        right: ["actions"],
      },
      pagination: {
        pageSize: 100,
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
        <div className="flex items-center gap-2">
          {typeof actions === "function" ? actions(table) : actions}
          <DataTableViewOptions table={table} columnTitles={columnTitles} />
        </div>
      </div>
      <div className="mb-4 rounded-md border">
        <Table wrapperClassName="max-h-[calc(100dvh-16rem)]">
          <DataTableHeader table={table} />
          <DataTableBody table={table} columns={allColumns} />
        </Table>
      </div>
      <div className="mb-4">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}

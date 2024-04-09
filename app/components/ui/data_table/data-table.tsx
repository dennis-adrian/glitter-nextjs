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

interface DataTableFiltersProps {
  label?: string;
  options: { value: string; label: string }[];
  columnId: string;
}
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnTitles: Record<string, string>;
  filters?: DataTableFiltersProps[];
}

// const getCommonPinningStyles = (column: Column<Person>): CSSProperties => {
//   const isPinned = column.getIsPinned()
//   const isLastLeftPinnedColumn =
//     isPinned === 'left' && column.getIsLastColumn('left')
//   const isFirstRightPinnedColumn =
//     isPinned === 'right' && column.getIsFirstColumn('right')

//   return {
//     boxShadow: isLastLeftPinnedColumn
//       ? '-4px 0 4px -4px gray inset'
//       : isFirstRightPinnedColumn
//         ? '4px 0 4px -4px gray inset'
//         : undefined,
//     left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
//     right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
//     opacity: isPinned ? 0.95 : 1,
//     position: isPinned ? 'sticky' : 'relative',
//     width: column.getSize(),
//     zIndex: isPinned ? 1 : 0,
//   }
// }

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
    initialState: {
      columnPinning: {
        right: ["actions"],
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex min-w-60 items-center py-4 sm:min-w-80">
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
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.getIsPinned()
                          ? "sticky right-0 z-20 bg-white shadow-inner"
                          : ""
                      }
                    >
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
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.getIsPinned()
                          ? "sticky right-0 z-20 bg-white shadow-inner"
                          : ""
                      }
                    >
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
                  Sin resultados.
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

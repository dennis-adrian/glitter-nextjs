"use no memo";

import { Table } from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { pagerButtonClass } from "@/app/components/ui/data_table/styles";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100, 200, 500] as const;

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizes?: readonly number[];
  /** Whether rows can be selected, and so whether a selection is worth counting. */
  selectable?: boolean;
}

/**
 * Where the reader is and how to move on, in one line.
 *
 * Reads the row count from the table rather than the rows it holds, so it is
 * right both when every row is loaded and when the server sends one page.
 */
export function DataTablePagination<TData>({
  table,
  pageSizes = DEFAULT_PAGE_SIZES,
  selectable = false,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const rowCount = table.getRowCount();
  const pageCount = Math.max(1, table.getPageCount());
  const first = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(rowCount, (pageIndex + 1) * pageSize);
  const selectedCount = table.getSelectedRowModel().rows.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {rowCount === 0 ? "Sin resultados" : `${first}–${last} de ${rowCount}`}
        {selectable && selectedCount > 0 && (
          <span className="text-foreground">
            {" · "}
            {selectedCount === 1
              ? "1 seleccionada"
              : `${selectedCount} seleccionadas`}
          </span>
        )}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline">Filas</span>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger
              className="h-8 w-[72px]"
              aria-label="Filas por página"
            >
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizes.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground tabular-nums">
          {pageIndex + 1} / {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(pagerButtonClass, "hidden lg:inline-flex")}
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Primera página</span>
            <ChevronsLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={pagerButtonClass}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Página anterior</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={pagerButtonClass}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Página siguiente</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(pagerButtonClass, "hidden lg:inline-flex")}
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Última página</span>
            <ChevronsRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

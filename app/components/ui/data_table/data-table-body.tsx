"use no memo";

import { SearchXIcon } from "lucide-react";

import { TableBody, TableCell, TableRow } from "@/app/components/ui/table";
import type { TableDensity } from "@/app/components/ui/data_table/density-toggle";
import { cn } from "@/lib/utils";
import { ColumnDef, flexRender, Table } from "@tanstack/react-table";

import "@/app/components/ui/data_table/column-meta";

export function DataTableBody<TData, TValue>({
  table,
  columns,
  density = "comfortable",
  emptyMessage = "Sin resultados.",
}: {
  table: Table<TData>;
  columns: ColumnDef<TData, TValue>[];
  density?: TableDensity;
  emptyMessage?: string;
}) {
  return (
    <TableBody>
      {table.getRowModel().rows?.length ? (
        table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() && "selected"}
            className="hover:bg-muted/40 data-[state=selected]:bg-muted/60"
          >
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta;
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    density === "compact" ? "px-3 py-1.5" : "px-4 py-3",
                    meta?.align === "right" && "text-right tabular-nums",
                    meta?.align === "center" && "text-center",
                    cell.column.getIsPinned() &&
                      "sticky right-0 z-20 border-l bg-background",
                    meta?.className,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))
      ) : (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columns.length} className="h-40 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <SearchXIcon className="h-8 w-8" aria-hidden />
              <span className="text-sm">{emptyMessage}</span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

"use no memo";

import { TableBody, TableCell, TableRow } from "@/app/components/ui/table";
import type { TableDensity } from "@/app/components/ui/data_table/density-toggle";
import { cn } from "@/lib/utils";
import { ColumnDef, flexRender, Table } from "@tanstack/react-table";

export function DataTableBody<TData, TValue>({
  table,
  columns,
  density = "comfortable",
}: {
  table: Table<TData>;
  columns: ColumnDef<TData, TValue>[];
  density?: TableDensity;
}) {
  return (
    <TableBody>
      {table.getRowModel().rows?.length ? (
        table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() && "selected"}
            className="hover:bg-primary-200/30 data-[state=selected]:bg-primary-200/20"
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cn(
                  // twMerge lets the compact override win over the cell's p-4.
                  density === "compact" && "px-2 py-1.5",
                  cell.column.getIsPinned() &&
                    "sticky right-0 z-20 bg-background shadow-inner",
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell colSpan={columns.length} className="h-24 text-center">
            Sin resultados.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

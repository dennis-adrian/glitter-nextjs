"use no memo";

import { TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import type { TableDensity } from "@/app/components/ui/data_table/density-toggle";
import { cn } from "@/lib/utils";
import { flexRender, Table } from "@tanstack/react-table";

export function DataTableHeader<TData>({
  table,
  density = "comfortable",
}: {
  table: Table<TData>;
  density?: TableDensity;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => {
            return (
              <TableHead
                key={header.id}
                className={cn(
                  density === "compact" && "h-9",
                  header.column.getIsPinned()
                    ? "sticky right-0 top-0 z-30 bg-background shadow-inner"
                    : "sticky top-0 z-10 bg-background",
                )}
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
  );
}

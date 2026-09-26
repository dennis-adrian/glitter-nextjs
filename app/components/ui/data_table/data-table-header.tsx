"use no memo";

import { TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import type { TableDensity } from "@/app/components/ui/data_table/density-toggle";
import { cn } from "@/lib/utils";
import { flexRender, Table } from "@tanstack/react-table";

import "@/app/components/ui/data_table/column-meta";

export function DataTableHeader<TData>({
  table,
  density = "comfortable",
}: {
  table: Table<TData>;
  density?: TableDensity;
}) {
  // With no rows the pinned actions header sits over nothing, and its divider
  // would draw an empty column beside the empty state.
  const hasRows = table.getRowModel().rows.length > 0;
  return (
    <TableHeader className="[&_tr]:border-b-0">
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            const meta = header.column.columnDef.meta;
            const sorted = header.column.getIsSorted();
            return (
              <TableHead
                key={header.id}
                aria-sort={
                  sorted === "asc"
                    ? "ascending"
                    : sorted === "desc"
                      ? "descending"
                      : undefined
                }
                className={cn(
                  // Sticky, so it needs a solid fill; the rule under it is a
                  // shadow because a border on a sticky cell scrolls away.
                  "sticky top-0 bg-muted text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
                  density === "compact" ? "h-9 px-3" : "h-10 px-4",
                  meta?.align === "right" && "text-right",
                  meta?.align === "center" && "text-center",
                  header.column.getIsPinned()
                    ? cn("right-0 z-30", hasRows && "border-l")
                    : "z-10",
                  meta?.className,
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

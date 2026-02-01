"use no memo";

import { TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { flexRender, Table } from "@tanstack/react-table";

export function DataTableHeader<TData>({ table }: { table: Table<TData> }) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => {
            return (
              <TableHead
                key={header.id}
                className={
                  header.column.getIsPinned()
                    ? "sticky right-0 top-0 z-30 bg-white shadow-inner"
                    : "sticky top-0 z-10 bg-white"
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
  );
}

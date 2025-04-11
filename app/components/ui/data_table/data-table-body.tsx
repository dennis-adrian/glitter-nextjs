import { TableBody, TableCell, TableRow } from "@/app/components/ui/table";
import { ColumnDef, flexRender, Table } from "@tanstack/react-table";

export function DataTableBody<TData, TValue>({
  table,
  columns,
}: {
  table: Table<TData>;
  columns: ColumnDef<TData, TValue>[];
}) {
  return (
    <TableBody>
      {table.getRowModel().rows?.length ? (
        table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() && "selected"}
            className="hover:bg-primary-100/30 data-[state=selected]:bg-primary-200/20"
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

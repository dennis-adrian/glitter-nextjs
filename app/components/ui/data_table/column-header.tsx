"use no memo";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

/**
 * A column title that sorts when clicked.
 *
 * It used to open a menu with Asc, Desc and Ocultar behind every title, and
 * drew a sort icon on every sortable column whether or not it was sorted — a
 * row of identical arrows that said nothing. The arrow now appears only on the
 * column the table is actually sorted by (and faintly on hover), and hiding a
 * column lives in the "Columnas" menu with the rest of the view options.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const alignRight = column.columnDef.meta?.align === "right";

  if (!column.getCanSort()) {
    return (
      <div className={cn(alignRight && "text-right", className)}>{title}</div>
    );
  }

  const sorted = column.getIsSorted();
  const nextDescending = sorted
    ? sorted === "asc"
    : column.getFirstSortDir() === "desc";

  return (
    <div className={cn("flex", alignRight && "justify-end", className)}>
      <button
        type="button"
        onClick={() => column.toggleSorting(nextDescending)}
        className={cn(
          "group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          sorted && "text-foreground",
          alignRight && "flex-row-reverse",
        )}
        title={
          nextDescending
            ? `Ordenar por ${title}, de mayor a menor`
            : `Ordenar por ${title}, de menor a mayor`
        }
      >
        <span>{title}</span>
        {sorted === "asc" ? (
          <ArrowUpIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : sorted === "desc" ? (
          <ArrowDownIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronsUpDownIcon
            className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50"
            aria-hidden
          />
        )}
      </button>
    </div>
  );
}

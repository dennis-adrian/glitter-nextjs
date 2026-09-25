import type { RowData } from "@tanstack/react-table";

/**
 * Per-column presentation the shared table understands, set through a column
 * definition's `meta`. Imported for its declaration only.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the generics must match TanStack's declaration to merge with it
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Right-align amounts and counts so their digits line up. */
    align?: "left" | "right" | "center";
    /** Extra classes for the column's header and cells, e.g. a width. */
    className?: string;
  }
}

export {};

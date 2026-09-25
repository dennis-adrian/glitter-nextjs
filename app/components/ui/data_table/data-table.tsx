"use client";
"use no memo";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";

import type {
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  Table as TableInstance,
  Row,
} from "@tanstack/react-table";
import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableViewOptions } from "@/app/components/ui/data_table/column-toggle";
import { DataTableBody } from "@/app/components/ui/data_table/data-table-body";
import { DataTableHeader } from "@/app/components/ui/data_table/data-table-header";
import { DataTableActiveFilters } from "@/app/components/ui/data_table/active-filters";
import { DataTableFacetFilter } from "@/app/components/ui/data_table/facet-filter";
import {
  DataTablePagination,
  DEFAULT_PAGE_SIZES,
} from "@/app/components/ui/data_table/pagination";
import type { TableDensity } from "@/app/components/ui/data_table/density-toggle";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import "@/app/components/ui/data_table/column-meta";

interface DataTableFiltersProps {
  label?: string;
  options: { value: string; label: string }[];
  columnId: string;
  /** False when the values exclude each other; picking one replaces the last. */
  multiple?: boolean;
  /** Server mode: the URL parameter this filter reads and writes. Defaults to `columnId`. */
  param?: string;
}

export interface DataTableInitialState {
  columnVisibility?: Record<string, boolean>;
  columnPinning?: Record<string, string[]>;
  columnFilters?: ColumnFiltersState;
}

/**
 * Hands search, filters, sorting and pagination to the server through the
 * URL, for tables too large to load whole.
 *
 * `data` is then one page, and the page re-renders with the next one when the
 * URL changes. The parameter names are the ones every server-paged list in
 * the dashboard already reads: `query`, `sort`, `direction`, `limit` and
 * `offset`, plus one per filter.
 */
export interface DataTableServerOptions {
  /** Every row matching the current search and filters, not just this page. */
  rowCount: number;
  /**
   * The order the server applies when the URL names none, so the header can
   * show it instead of implying the rows are unsorted.
   */
  defaultSorting?: { id: string; desc: boolean };
  /** The page size the server uses when the URL names none. */
  defaultPageSize?: number;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnTitles: Record<string, string>;
  filters?: DataTableFiltersProps[];
  initialState?: DataTableInitialState;
  actions?: ReactNode | ((table: TableInstance<TData>) => ReactNode);
  selectable?: boolean;
  /** Caps how many rows can stay selected across pages. */
  maxSelectable?: number;
  /** Keys row selection by a stable domain id instead of the row's position. */
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  /** Row height. Defaults to the roomier spacing every table shipped with. */
  density?: TableDensity;
  /** Server-side paging; see `DataTableServerOptions`. Omit to page in the browser. */
  server?: DataTableServerOptions;
  searchPlaceholder?: string;
  /** False to drop the search box, for a table with nothing worth searching. */
  searchable?: boolean;
  /** Extra controls after the filters, such as a date range. */
  toolbar?: ReactNode;
  /**
   * How one row reads on a phone. When set, narrow screens get a list of
   * these instead of a table that has to scroll sideways.
   */
  renderMobileRow?: (row: TData) => ReactNode;
  emptyMessage?: string;
  pageSizes?: readonly number[];
}

function clampRowSelection(
  prev: RowSelectionState,
  next: RowSelectionState,
  maxSelectable: number,
): RowSelectionState {
  const nextIds = Object.keys(next).filter((id) => next[id]);
  if (nextIds.length <= maxSelectable) return next;

  const previouslySelected = new Set(
    Object.keys(prev).filter((id) => prev[id]),
  );
  const kept: string[] = [];
  for (const id of nextIds) {
    if (previouslySelected.has(id)) kept.push(id);
  }
  for (const id of nextIds) {
    if (kept.length >= maxSelectable) break;
    if (!previouslySelected.has(id)) kept.push(id);
  }
  const limited: RowSelectionState = {};
  for (const id of kept.slice(0, maxSelectable)) {
    limited[id] = true;
  }
  return limited;
}

function createSelectColumn(maxSelectable?: number) {
  return {
    id: "select",
    header: ({ table }: { table: TableInstance<unknown> }) => {
      const pageRows = table.getRowModel().rows;
      const allPageSelected =
        pageRows.length > 0 && pageRows.every((row) => row.getIsSelected());
      const somePageSelected = pageRows.some((row) => row.getIsSelected());
      const selectedCount = table.getSelectedRowModel().rows.length;
      const atLimit = maxSelectable != null && selectedCount >= maxSelectable;
      return (
        <Checkbox
          checked={allPageSelected || (somePageSelected && "indeterminate")}
          disabled={atLimit && !allPageSelected && !somePageSelected}
          onCheckedChange={(value) => {
            if (!value) {
              table.toggleAllPageRowsSelected(false);
              return;
            }

            if (maxSelectable == null) {
              table.toggleAllPageRowsSelected(true);
              return;
            }

            const unselectedOnPage = pageRows.filter(
              (row) => !row.getIsSelected(),
            );
            const remaining = Math.max(0, maxSelectable - selectedCount);
            if (unselectedOnPage.length > remaining) {
              toast.warning(
                `Solo puedes seleccionar hasta ${maxSelectable} pedidos a la vez.`,
              );
              table.setRowSelection((prev) => {
                const next = { ...prev };
                for (const row of unselectedOnPage.slice(0, remaining)) {
                  next[row.id] = true;
                }
                return next;
              });
              return;
            }

            table.toggleAllPageRowsSelected(true);
          }}
          aria-label="Seleccionar todos"
        />
      );
    },
    cell: ({
      row,
    }: {
      row: {
        getIsSelected: () => boolean;
        getCanSelect: () => boolean;
        toggleSelected: (v: boolean) => void;
      };
    }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}

function resolve<T>(updater: T | ((old: T) => T), old: T): T {
  return typeof updater === "function"
    ? (updater as (old: T) => T)(old)
    : updater;
}

/**
 * Search, filters, sorting and pagination as URL state.
 *
 * Every change resets to the first page, except moving between pages: a
 * narrower result on page four is usually an empty page four.
 */
function useServerState(
  server: DataTableServerOptions,
  filters: DataTableFiltersProps[],
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const defaultPageSize = server.defaultPageSize ?? 25;
  const limit = Number(searchParams.get("limit")) || defaultPageSize;
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const sortId = searchParams.get("sort");
  const sorting: SortingState = sortId
    ? [{ id: sortId, desc: searchParams.get("direction") !== "asc" }]
    : server.defaultSorting
      ? [server.defaultSorting]
      : [];
  const columnFilters: ColumnFiltersState = filters.flatMap((filter) => {
    const values = searchParams.getAll(filter.param ?? filter.columnId);
    return values.length ? [{ id: filter.columnId, value: values }] : [];
  });
  const pagination: PaginationState = {
    pageIndex: Math.floor(offset / limit),
    pageSize: limit,
  };

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const [next] = resolve(updater, sorting);
    navigate((params) => {
      params.delete("offset");
      if (!next) {
        params.delete("sort");
        params.delete("direction");
        return;
      }
      params.set("sort", next.id);
      params.set("direction", next.desc ? "desc" : "asc");
    });
  };

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next = resolve(updater, columnFilters);
    navigate((params) => {
      params.delete("offset");
      for (const filter of filters) {
        const param = filter.param ?? filter.columnId;
        params.delete(param);
        const entry = next.find((item) => item.id === filter.columnId);
        const values = entry
          ? Array.isArray(entry.value)
            ? (entry.value as unknown[])
            : [entry.value]
          : [];
        for (const value of values) params.append(param, String(value));
      }
    });
  };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = resolve(updater, pagination);
    navigate((params) => {
      params.set("limit", String(next.pageSize));
      // A new page size starts over; the same size moves between pages.
      const offsetNext =
        next.pageSize === pagination.pageSize
          ? next.pageIndex * next.pageSize
          : 0;
      if (offsetNext > 0) params.set("offset", String(offsetNext));
      else params.delete("offset");
    });
  };

  const onSearch = (term: string) =>
    navigate((params) => {
      params.delete("offset");
      if (term) params.set("query", term);
      else params.delete("query");
    });

  return {
    isPending,
    query: searchParams.get("query") ?? "",
    sorting,
    columnFilters,
    pagination,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    onSearch,
  };
}

type ServerState = ReturnType<typeof useServerState>;

/** Room kept under the rows: the gap above the pager, and the page's padding. */
const BELOW_ROWS_GAP = 12 + 24;
/** Never squeeze the rows below this; past it the page scrolls instead. */
const MIN_ROWS_HEIGHT = 240;

/**
 * Caps the rows so they end where the viewport does, with the pager still on
 * screen, whatever the page stacks above the table.
 *
 * A page built to fill its height bounds the table first and this changes
 * nothing. Every other page used to get a fixed `100dvh - 16rem`, which was
 * right for none of them: a tall header pushed the pager below the fold, and
 * a short one left the rows cut off early.
 */
function useViewportFill(
  rowsRef: RefObject<HTMLElement | null>,
  pagerRef: RefObject<HTMLElement | null>,
) {
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    function update() {
      if (!rows) return;
      // Measured from the top of the document, so scrolling does not move it.
      const top = rows.getBoundingClientRect().top + window.scrollY;
      const pager = pagerRef.current?.offsetHeight ?? 0;
      const next = Math.max(
        MIN_ROWS_HEIGHT,
        Math.floor(window.innerHeight - top - pager - BELOW_ROWS_GAP),
      );
      setMaxHeight((current) => (current === next ? current : next));
    }
    update();
    window.addEventListener("resize", update);
    // Anything above the table can change height — filters wrapping, chips
    // appearing, a banner — and each of those moves where the rows start.
    // Absent in some test environments; the resize listener still applies.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(document.body);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [rowsRef, pagerRef]);

  return maxHeight;
}

/**
 * Client tables never touch the URL: subscribing every one of them to the
 * search params would re-render each on any navigation, and would demand a
 * Suspense boundary on routes that render statically.
 */
export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>) {
  return props.server ? (
    <ServerDataTable {...props} server={props.server} />
  ) : (
    <DataTableView {...props} serverState={null} />
  );
}

function ServerDataTable<TData, TValue>(
  props: DataTableProps<TData, TValue> & { server: DataTableServerOptions },
) {
  const serverState = useServerState(props.server, props.filters ?? []);
  return <DataTableView {...props} serverState={serverState} />;
}

function DataTableView<TData, TValue>({
  columns,
  columnTitles,
  data,
  filters = [],
  initialState,
  actions,
  selectable = false,
  maxSelectable,
  getRowId,
  density = "comfortable",
  server,
  searchPlaceholder = "Buscar...",
  searchable = true,
  toolbar,
  renderMobileRow,
  emptyMessage,
  pageSizes,
  serverState,
}: DataTableProps<TData, TValue> & { serverState: ServerState | null }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialState?.columnFilters || [],
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // TanStack builds its row models during render and, from inside that memo,
  // queues `resetPageIndex()` on a microtask. When the table mounts inside a
  // Suspense boundary that streams in, React can flush that microtask between
  // the render and the commit, so the update lands on a fiber that has not
  // mounted yet and React logs a warning. There is no page to reset before the
  // table is on screen, so only arm the auto-reset once it is.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // The box is typed into directly and synced to the URL after a pause, so a
  // server round trip never eats keystrokes.
  const urlQuery = serverState?.query ?? "";
  const [serverSearch, setServerSearch] = useState(urlQuery);
  const lastPushedQuery = useRef(urlQuery);
  useEffect(() => {
    // Follows the URL when it changes from outside the box, e.g. a link.
    if (urlQuery !== lastPushedQuery.current) {
      lastPushedQuery.current = urlQuery;
      setServerSearch(urlQuery);
    }
  }, [urlQuery]);
  const pushSearch = useDebouncedCallback((term: string) => {
    lastPushedQuery.current = term;
    serverState?.onSearch(term);
  }, 400);

  const allColumns = selectable
    ? [
        createSelectColumn(maxSelectable) as ColumnDef<TData, TValue>,
        ...columns,
      ]
    : columns;

  // eslint-disable-next-line -- TanStack Table API incompatible with React Compiler
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    ...(getRowId && { getRowId }),
    ...(server && serverState
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          rowCount: server.rowCount,
          onSortingChange: serverState.onSortingChange,
          onColumnFiltersChange: serverState.onColumnFiltersChange,
          onPaginationChange: serverState.onPaginationChange,
        }
      : {
          autoResetPageIndex: hasMounted,
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          onSortingChange: setSorting,
          onColumnFiltersChange: setColumnFilters,
        }),
    ...(selectable && {
      onRowSelectionChange: (updater) => {
        setRowSelection((prev) => {
          const next = typeof updater === "function" ? updater(prev) : updater;
          if (maxSelectable == null) return next;
          return clampRowSelection(prev, next, maxSelectable);
        });
      },
    }),
    ...(selectable &&
      maxSelectable != null && {
        enableRowSelection: (row: Row<TData>) =>
          Boolean(rowSelection[row.id]) ||
          Object.values(rowSelection).filter(Boolean).length < maxSelectable,
      }),
    state: serverState
      ? {
          sorting: serverState.sorting,
          columnFilters: serverState.columnFilters,
          pagination: serverState.pagination,
          ...(selectable && { rowSelection }),
        }
      : {
          sorting,
          columnFilters,
          globalFilter: searchFilter,
          ...(selectable && { rowSelection }),
        },
    initialState: {
      columnPinning: {
        right: ["actions"],
      },
      pagination: {
        pageSize: 100,
      },
      ...initialState,
    },
  });

  const rows = table.getRowModel().rows;
  const rowsRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const rowsMaxHeight = useViewportFill(rowsRef, pagerRef);

  return (
    // Fills whatever height its parent gives it, so the rows scroll inside
    // the table and the toolbar and pagination stay on screen. In a parent
    // that does not bound its height, the table caps itself instead.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative w-full sm:w-80">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={server ? serverSearch : searchFilter}
              onChange={(event) => {
                if (server) {
                  setServerSearch(event.target.value);
                  pushSearch(event.target.value.trim());
                } else {
                  setSearchFilter(event.target.value);
                }
              }}
              className="h-9 pl-9"
            />
          </div>
        )}
        {/* One control per filter group. They used to share a single
            "Filtros" dropdown, which put every option of every group into
            one scrolling list and showed nothing about what was applied. */}
        {filters.map(({ columnId, options, label, multiple }) => (
          <DataTableFacetFilter
            key={columnId}
            columnId={columnId}
            label={label ?? "Filtro"}
            options={options}
            table={table}
            multiple={multiple}
          />
        ))}
        {toolbar}
        {/* ml-auto so the view controls stay right-aligned when the filters
            wrap onto their own line on a narrow screen. */}
        <div className="ml-auto flex items-center gap-2">
          {typeof actions === "function" ? actions(table) : actions}
          <DataTableViewOptions table={table} columnTitles={columnTitles} />
        </div>
      </div>

      {filters.length > 0 && (
        <DataTableActiveFilters
          filters={filters.map(({ columnId, options, label }) => ({
            columnId,
            label: label ?? "Filtro",
            options,
          }))}
          table={table}
          visibleCount={table.getRowCount()}
          totalCount={
            server ? undefined : table.getPreFilteredRowModel().rows.length
          }
        />
      )}

      <div
        ref={rowsRef}
        className={cn(
          // The class is the first paint's guess; the measured cap replaces it.
          "min-h-0 flex-1 max-h-[calc(100dvh-14rem)] transition-opacity",
          serverState?.isPending && "opacity-60",
        )}
        style={rowsMaxHeight != null ? { maxHeight: rowsMaxHeight } : undefined}
        aria-busy={serverState ? serverState.isPending : undefined}
      >
        {renderMobileRow && (
          <ul className="flex h-full max-h-[inherit] flex-col gap-2 overflow-y-auto md:hidden">
            {rows.length === 0 ? (
              <li className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage ?? "Sin resultados."}
              </li>
            ) : (
              rows.map((row) => (
                <li key={row.id}>{renderMobileRow(row.original)}</li>
              ))
            )}
          </ul>
        )}
        <div
          className={cn(
            "h-full max-h-[inherit] overflow-hidden rounded-md border bg-background",
            renderMobileRow && "hidden md:block",
          )}
        >
          <Table wrapperClassName="h-full max-h-[inherit]">
            <DataTableHeader table={table} density={density} />
            <DataTableBody
              table={table}
              columns={allColumns}
              density={density}
              emptyMessage={emptyMessage}
            />
          </Table>
        </div>
      </div>

      <div ref={pagerRef} className="shrink-0">
        <DataTablePagination
          table={table}
          selectable={selectable}
          pageSizes={
            pageSizes ?? (server ? [25, 50, 100, 200] : DEFAULT_PAGE_SIZES)
          }
        />
      </div>
    </div>
  );
}

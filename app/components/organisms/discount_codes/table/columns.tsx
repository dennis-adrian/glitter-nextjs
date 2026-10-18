"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DateTime } from "luxon";

import StatusDot, { type StatusTone } from "@/app/components/atoms/status-dot";
import DiscountCodeActionsMenu from "@/app/components/organisms/discount_codes/table/discount-code-actions-menu";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import type {
  DiscountCodeUser,
  DiscountCodeWithRelations,
} from "@/app/lib/discount_codes/definitions";
import {
  DISCOUNT_CODE_STATUS_LABELS,
  formatDiscountValue,
  getDiscountCodeStatus,
  isExpiringSoon,
  type DiscountCodeStatus,
} from "@/app/lib/discount_codes/utils";
import { formatDisplayDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

export const columnTitles: Record<string, string> = {
  code: "Código",
  discount: "Descuento",
  festival: "Festival",
  users: "Usuarios",
  uses: "Usos",
  expiresAt: "Vence",
  status: "Estado",
  actions: "Acciones",
};

const STATUS_TONES: Record<DiscountCodeStatus, StatusTone> = {
  active: "success",
  exhausted: "warning",
  inactive: "neutral",
  expired: "danger",
};

export const DISCOUNT_CODE_STATUS_OPTIONS = (
  Object.keys(DISCOUNT_CODE_STATUS_LABELS) as DiscountCodeStatus[]
).map((value) => ({ value, label: DISCOUNT_CODE_STATUS_LABELS[value] }));

/** The festival filter's value for codes that apply to every festival. */
export const ALL_FESTIVALS_FILTER_VALUE = "all";

function userLabel(user: DiscountCodeUser) {
  return getUserName(user) || user.email;
}

export function DiscountCodeStatusDot({
  discountCode,
}: {
  discountCode: DiscountCodeWithRelations;
}) {
  const status = getDiscountCodeStatus(discountCode);
  return (
    <StatusDot
      tone={STATUS_TONES[status]}
      label={DISCOUNT_CODE_STATUS_LABELS[status]}
    />
  );
}

export function DiscountCodeUses({
  discountCode,
}: {
  discountCode: DiscountCodeWithRelations;
}) {
  const { currentUses, maxUses } = discountCode;
  return maxUses === null ? (
    <span className="tabular-nums">
      {currentUses}{" "}
      <span className="text-xs text-muted-foreground">sin límite</span>
    </span>
  ) : (
    <span
      className={cn(
        "tabular-nums",
        currentUses >= maxUses && "font-medium text-amber-700",
      )}
    >
      {currentUses} / {maxUses}
    </span>
  );
}

/** The date, and how far off it is when that is worth a glance. */
export function DiscountCodeExpiry({
  discountCode,
}: {
  discountCode: DiscountCodeWithRelations;
}) {
  const expiresAt = new Date(discountCode.expiresAt);
  const now = new Date();
  const expired = expiresAt < now;
  const soon = isExpiringSoon(expiresAt, now);
  const relative = DateTime.fromJSDate(expiresAt)
    .setLocale("es")
    .toRelative({ base: DateTime.fromJSDate(now) });

  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="text-sm">{formatDisplayDate(expiresAt)}</span>
      {(expired || soon) && relative && (
        // Relative to the moment it renders, so the server's text and the
        // browser's can differ by a tick.
        <span
          suppressHydrationWarning
          className={cn(
            "text-xs",
            expired ? "text-muted-foreground" : "text-amber-700",
          )}
        >
          {expired ? `Venció ${relative}` : `Vence ${relative}`}
        </span>
      )}
    </span>
  );
}

/** Who can redeem the code: anyone, or the people it was reserved for. */
export function DiscountCodeAudience({
  discountCode,
}: {
  discountCode: DiscountCodeWithRelations;
}) {
  if (discountCode.audience === "everyone") {
    return <span className="text-sm text-muted-foreground">Cualquiera</span>;
  }

  const [first, ...rest] = discountCode.assignedUsers;
  if (!first) {
    // Every assigned account was deleted; the code stays reserved, for no one.
    return <span className="text-sm text-amber-700">Nadie (sin usuarios)</span>;
  }

  return (
    <span className="flex min-w-0 max-w-64 items-center gap-1.5 text-sm">
      <span className="truncate" title={first.email}>
        {userLabel(first)}
      </span>
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Ver los ${discountCode.assignedUsers.length} usuarios`}
            >
              +{rest.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              {discountCode.assignedUsers.length} usuarios pueden usarlo
            </p>
            <ul className="max-h-64 divide-y overflow-y-auto">
              {discountCode.assignedUsers.map((user) => (
                <li key={user.id} className="px-3 py-2">
                  <p className="truncate text-sm">{userLabel(user)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

export const columns: ColumnDef<DiscountCodeWithRelations>[] = [
  {
    id: "code",
    accessorFn: (row) => row.code.toUpperCase(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.code!} />
    ),
    cell: ({ row }) => (
      <code className="whitespace-nowrap rounded bg-muted px-2 py-1 text-sm font-semibold">
        {row.original.code.toUpperCase()}
      </code>
    ),
    enableHiding: false,
  },
  {
    id: "discount",
    accessorFn: (row) => formatDiscountValue(row),
    header: columnTitles.discount,
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-medium tabular-nums">
        {formatDiscountValue(row.original)}
      </span>
    ),
    // Percentages and fixed amounts do not order against each other.
    enableSorting: false,
    enableGlobalFilter: false,
  },
  {
    id: "festival",
    accessorFn: (row) => row.festival?.name ?? "Todos los festivales",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.festival!} />
    ),
    cell: ({ row }) =>
      row.original.festival ? (
        <span className="block max-w-56 truncate text-sm">
          {row.original.festival.name}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Todos</span>
      ),
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (!filterValue?.length) return true;
      const festivalId = row.original.festivalId;
      return filterValue.includes(
        festivalId === null ? ALL_FESTIVALS_FILTER_VALUE : String(festivalId),
      );
    },
  },
  {
    id: "users",
    // Names and emails, so the search box finds the codes reserved for
    // someone.
    accessorFn: (row) =>
      row.audience === "everyone"
        ? ""
        : row.assignedUsers
            .map((user) => `${userLabel(user)} ${user.email}`)
            .join(" "),
    header: columnTitles.users,
    cell: ({ row }) => <DiscountCodeAudience discountCode={row.original} />,
    enableSorting: false,
  },
  {
    id: "uses",
    accessorFn: (row) => row.currentUses,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.uses!} />
    ),
    cell: ({ row }) => <DiscountCodeUses discountCode={row.original} />,
    sortDescFirst: true,
    enableGlobalFilter: false,
    meta: { align: "right" },
  },
  {
    id: "expiresAt",
    accessorFn: (row) => new Date(row.expiresAt).getTime(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.expiresAt!} />
    ),
    cell: ({ row }) => <DiscountCodeExpiry discountCode={row.original} />,
    enableGlobalFilter: false,
  },
  {
    id: "status",
    accessorFn: (row) => getDiscountCodeStatus(row),
    header: columnTitles.status,
    cell: ({ row }) => <DiscountCodeStatusDot discountCode={row.original} />,
    filterFn: (row, columnId, filterValue: string[]) => {
      if (!filterValue?.length) return true;
      return filterValue.includes(row.getValue<string>(columnId));
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">{columnTitles.actions}</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DiscountCodeActionsMenu discountCode={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { align: "right" },
  },
];

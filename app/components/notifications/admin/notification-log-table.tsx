"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { DataTableDateRangeFilter } from "@/app/components/ui/data_table/date-range-filter";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  NOTIFICATION_LOG_CHANNEL_LABELS,
  NOTIFICATION_LOG_CHANNELS,
  NOTIFICATION_LOG_OUTCOME_LABELS,
  NOTIFICATION_LOG_OUTCOMES,
  NOTIFICATION_LOG_STATUS_LABELS,
  NOTIFICATION_LOG_STATUSES,
  notificationLogKindLabel,
  notificationLogStatusLabel,
  type NotificationLogOutcome,
  type NotificationLogRow,
  type NotificationLogStatus,
} from "@/app/lib/notifications/admin-log-definitions";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<NotificationLogStatus, BadgeVariant> = {
  pending: "secondary",
  processing: "secondary",
  sent: "green",
  failed: "red",
  skipped: "amber",
};

const OUTCOME_VARIANTS: Record<NotificationLogOutcome, BadgeVariant> = {
  delivered: "green",
  delivery_delayed: "amber",
  bounced: "red",
  complained: "red",
  failed: "red",
  suppressed: "red",
};

const columnTitles: Record<string, string> = {
  recipient: "Para",
  what: "Qué",
  channel: "Canal",
  status: "Estado",
  outcome: "Entrega",
  when: "Fecha",
};

/** Who it went to: the person, linked to their account, and the address. */
export function RecipientCell({ row }: { row: NotificationLogRow }) {
  const { userId, name, email } = row.recipient;
  return (
    <div className="min-w-0 max-w-72">
      {userId !== null ? (
        <Link
          href={`/dashboard/users/${userId}`}
          className="font-medium break-words underline-offset-2 hover:underline"
        >
          {name ?? `Cuenta #${userId}`}
        </Link>
      ) : (
        <p className="font-medium">Sin cuenta</p>
      )}
      {email ? (
        <p className="text-xs text-muted-foreground wrap-anywhere">{email}</p>
      ) : null}
      {row.channel === "push" ? (
        <p className="text-xs text-muted-foreground break-words">
          {row.deviceRemoved
            ? "Dispositivo eliminado"
            : (row.deviceLabel ?? "Dispositivo sin nombre")}
        </p>
      ) : null}
    </div>
  );
}

/** What it was: its kind, its title, and where to read more. */
export function WhatCell({ row }: { row: NotificationLogRow }) {
  const label = notificationLogKindLabel(row.kind);
  return (
    <div className="min-w-0 max-w-96 space-y-1">
      <p className="font-medium break-words">{label}</p>
      {row.reserved ? (
        <p className="text-xs text-muted-foreground">
          Contenido reservado: se lee en el caso.
        </p>
      ) : row.title ? (
        <p className="text-sm break-words text-muted-foreground">{row.title}</p>
      ) : null}
      {row.links.length > 0 ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {row.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-primary underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export function StatusCell({
  row,
  fullError = false,
}: {
  row: NotificationLogRow;
  /** Phones have no hover to read a clamped error: show all of it. */
  fullError?: boolean;
}) {
  const notes: string[] = [];
  if (row.retractedAt) notes.push("Retirado");
  else if (row.channel === "in_app") {
    notes.push(row.readAt ? "Leído" : "No leído");
  }
  if (row.isResend) notes.push("Reenvío");
  if (row.lane === "bulk") notes.push("Envío masivo");
  if (row.attempts !== null && row.attempts > 1) {
    notes.push(`${row.attempts} intentos`);
  }
  if (row.delivery?.at) {
    notes.push(`Resend: ${formatDateWithTime(row.delivery.at)}`);
  }
  if (row.clickedAt) notes.push("Con clic");
  else if (row.openedAt) notes.push("Abierto");
  const variant = row.delivery
    ? OUTCOME_VARIANTS[row.delivery.outcome]
    : STATUS_VARIANTS[row.status];
  return (
    <div className="min-w-0 max-w-72 space-y-1">
      <Badge variant={variant} className="whitespace-normal">
        {notificationLogStatusLabel(row.channel, row.status, row.delivery)}
      </Badge>
      {notes.length > 0 ? (
        <p className="text-xs text-muted-foreground">{notes.join(" · ")}</p>
      ) : null}
      {row.delivery?.detail ? (
        <p
          className={cn(
            "text-xs break-words text-muted-foreground",
            !fullError && "line-clamp-3",
          )}
          title={row.delivery.detail}
        >
          {row.delivery.detail}
        </p>
      ) : null}
      {row.error && (row.status === "failed" || row.status === "skipped") ? (
        <p
          className={cn(
            "text-xs break-words text-destructive",
            row.status === "skipped" && "text-muted-foreground",
            !fullError && "line-clamp-3",
          )}
          title={row.error}
        >
          {row.error}
        </p>
      ) : null}
    </div>
  );
}

function WhenCell({ row }: { row: NotificationLogRow }) {
  const sentLater =
    row.channel !== "in_app" &&
    row.sentAt &&
    row.sentAt.getTime() - row.createdAt.getTime() >= 60_000;
  return (
    <div className="text-muted-foreground">
      <p className="whitespace-nowrap">{formatDateWithTime(row.createdAt)}</p>
      {sentLater ? (
        <p className="text-xs whitespace-nowrap">
          Enviado {formatDateWithTime(row.sentAt!)}
        </p>
      ) : null}
    </div>
  );
}

const columns: ColumnDef<NotificationLogRow>[] = [
  {
    id: "recipient",
    header: () => columnTitles.recipient,
    cell: ({ row }) => <RecipientCell row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "what",
    header: () => columnTitles.what,
    cell: ({ row }) => <WhatCell row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "channel",
    header: () => columnTitles.channel,
    cell: ({ row }) => (
      <Badge variant="outline" className="whitespace-nowrap">
        {NOTIFICATION_LOG_CHANNEL_LABELS[row.original.channel]}
      </Badge>
    ),
    enableSorting: false,
  },
  {
    id: "status",
    header: () => columnTitles.status,
    cell: ({ row }) => <StatusCell row={row.original} />,
    enableSorting: false,
  },
  {
    // Only for the "Entrega" filter: the status badge already shows it.
    id: "outcome",
    header: () => columnTitles.outcome,
    cell: ({ row }) =>
      row.original.delivery
        ? NOTIFICATION_LOG_OUTCOME_LABELS[row.original.delivery.outcome]
        : null,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "when",
    header: () => columnTitles.when,
    cell: ({ row }) => <WhenCell row={row.original} />,
    enableSorting: false,
  },
];

export default function NotificationLogTable({
  rows,
  rowCount,
  filtered,
}: {
  rows: NotificationLogRow[];
  rowCount: number;
  /** A search or filter is applied: an empty list means no match. */
  filtered: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      columnTitles={columnTitles}
      getRowId={(row) => row.key}
      server={{ rowCount }}
      searchPlaceholder="Buscar por nombre, correo o #id"
      filters={[
        {
          columnId: "channel",
          label: "Canal",
          options: NOTIFICATION_LOG_CHANNELS.map((value) => ({
            value,
            label: NOTIFICATION_LOG_CHANNEL_LABELS[value],
          })),
        },
        {
          columnId: "status",
          label: "Estado",
          options: NOTIFICATION_LOG_STATUSES.map((value) => ({
            value,
            label: NOTIFICATION_LOG_STATUS_LABELS[value],
          })),
        },
        {
          columnId: "outcome",
          label: "Entrega",
          options: NOTIFICATION_LOG_OUTCOMES.map((value) => ({
            value,
            label: NOTIFICATION_LOG_OUTCOME_LABELS[value],
          })),
        },
      ]}
      initialState={{ columnVisibility: { outcome: false } }}
      toolbar={<DataTableDateRangeFilter />}
      renderMobileRow={(row) => (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <RecipientCell row={row} />
            <Badge variant="outline" className="shrink-0">
              {NOTIFICATION_LOG_CHANNEL_LABELS[row.channel]}
            </Badge>
          </div>
          <WhatCell row={row} />
          <StatusCell row={row} fullError />
          <WhenCell row={row} />
        </div>
      )}
      emptyMessage={
        filtered
          ? "Ninguna notificación coincide con la búsqueda o los filtros."
          : "Todavía no se envió ninguna notificación."
      }
    />
  );
}

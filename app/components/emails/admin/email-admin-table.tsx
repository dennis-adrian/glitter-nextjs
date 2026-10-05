"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import EmailAdminActionButton from "@/app/components/emails/admin/email-admin-action-button";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
  removeUnsubscribe,
  unblockEmail,
} from "@/app/lib/emails/admin-actions";
import type {
  EmailAdminRow,
  EmailAdminTab,
  EmailPerson,
} from "@/app/lib/emails/admin-definitions";
import { EMAIL_TOPIC_SHORT_LABELS } from "@/app/lib/emails/topics";
import { formatDateWithTime } from "@/app/lib/formatters";

const REASON_LABELS = { bounce: "Rebote", complaint: "Spam" } as const;
const REASON_VARIANTS: Record<"bounce" | "complaint", BadgeVariant> = {
  bounce: "amber",
  complaint: "red",
};

const columnTitles: Record<string, string> = {
  email: "Correo",
  reason: "Motivo",
  when: "Fecha",
  by: "Por",
  actions: "Acciones",
};

function personLabel(person: EmailPerson) {
  const role = person.kind === "user" ? "Participante" : "Visitante";
  return person.name ? `${person.name} · ${role}` : role;
}

/** The address, and whose it is in our records. */
function EmailCell({ row }: { row: EmailAdminRow }) {
  return (
    <div className="min-w-0 max-w-80">
      <p className="break-all font-medium">{row.emailKey}</p>
      {row.people.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No está en nuestros registros
        </p>
      ) : (
        row.people.map((person, index) => (
          <p key={index} className="truncate text-xs text-muted-foreground">
            {person.kind === "user" ? (
              <Link
                href={`/dashboard/users/${person.id}`}
                className="underline-offset-2 hover:underline"
              >
                {personLabel(person)}
              </Link>
            ) : (
              personLabel(person)
            )}
          </p>
        ))
      )}
    </div>
  );
}

function ReasonCell({ row }: { row: EmailAdminRow }) {
  if (row.kind === "unsubscribed") {
    return (
      <Badge variant={row.topic === "all" ? "secondary" : "outline"}>
        {EMAIL_TOPIC_SHORT_LABELS[row.topic]}
      </Badge>
    );
  }
  return (
    <div className="min-w-0 max-w-72 space-y-1">
      <Badge variant={REASON_VARIANTS[row.reason]}>
        {REASON_LABELS[row.reason]}
      </Badge>
      {row.detail ? (
        <p
          className="line-clamp-2 text-xs text-muted-foreground"
          title={row.detail}
        >
          {row.detail}
        </p>
      ) : null}
    </div>
  );
}

function when(row: EmailAdminRow) {
  if (row.kind === "blocked") return row.blockedAt;
  if (row.kind === "unsubscribed") return row.unsubscribedAt;
  return row.liftedAt;
}

/** Who made the change: an admin, the person, Resend or a mail server. */
function byLabel(row: EmailAdminRow) {
  if (row.kind === "blocked") {
    return row.reason === "complaint"
      ? "La persona, al marcarlo como spam"
      : "El servidor de correo";
  }
  if (row.kind === "unsubscribed") {
    return row.createdBy ? row.createdBy.name : "La persona, desde el correo";
  }
  return row.liftedBy ? row.liftedBy.name : "Resend";
}

function RowAction({ row }: { row: EmailAdminRow }) {
  if (row.kind === "blocked") {
    const spam = row.reason === "complaint";
    return (
      <EmailAdminActionButton
        label="Desbloquear"
        pendingLabel="Desbloqueando…"
        title={`¿Desbloquear ${row.emailKey}?`}
        confirmLabel="Desbloquear"
        cancelLabel="Mantener bloqueado"
        destructive
        run={() => unblockEmail({ emailKey: row.emailKey })}
        description={
          <>
            <p>
              Volverá a recibir las invitaciones y demás correos masivos,
              también en Resend.
            </p>
            <p>
              {spam
                ? "Esta persona marcó uno de nuestros correos como spam. Desbloquéala solo si te pidió volver a recibirlos: otro reporte daña la reputación de nuestros envíos."
                : "Su correo rebotó. Si la dirección sigue sin existir, volverá a rebotar y se bloqueará otra vez; desbloquéala solo si la persona la corrigió."}
            </p>
          </>
        }
      />
    );
  }
  if (row.kind === "unsubscribed") {
    const label = EMAIL_TOPIC_SHORT_LABELS[row.topic].toLowerCase();
    return (
      <EmailAdminActionButton
        label="Quitar baja"
        pendingLabel="Quitando…"
        title={`¿Quitar la baja de ${row.emailKey}?`}
        confirmLabel="Quitar baja"
        cancelLabel="Mantener la baja"
        run={() =>
          removeUnsubscribe({ emailKey: row.emailKey, topic: row.topic })
        }
        description={
          <>
            <p>Volverá a recibir: {label}.</p>
            <p>
              Hazlo solo si la persona te pidió volver a recibirlos o si la baja
              se agregó por error.
            </p>
          </>
        }
      />
    );
  }
  return null;
}

function buildColumns(tab: EmailAdminTab): ColumnDef<EmailAdminRow>[] {
  const columns: ColumnDef<EmailAdminRow>[] = [
    {
      id: "email",
      accessorFn: (row) => row.emailKey,
      header: () => columnTitles.email,
      cell: ({ row }) => <EmailCell row={row.original} />,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "reason",
      header: () => (tab === "unsubscribed" ? "Qué dejó de recibir" : "Motivo"),
      cell: ({ row }) => <ReasonCell row={row.original} />,
      enableSorting: false,
    },
    {
      id: "when",
      accessorFn: (row) => when(row),
      header: () =>
        tab === "lifted"
          ? "Desbloqueado"
          : tab === "blocked"
            ? "Bloqueado"
            : "Fecha",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateWithTime(when(row.original))}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "by",
      header: () => columnTitles.by,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{byLabel(row.original)}</span>
      ),
      enableSorting: false,
    },
  ];
  if (tab !== "lifted") {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowAction row={row.original} />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    });
  }
  return columns;
}

const EMPTY_MESSAGES: Record<EmailAdminTab, string> = {
  blocked:
    "Ningún correo está bloqueado. Si un envío rebota o alguien lo marca como spam, aparecerá aquí.",
  unsubscribed: "Nadie se dio de baja todavía.",
  lifted: "Todavía no se desbloqueó ningún correo.",
};

export default function EmailAdminTable({
  tab,
  rows,
  rowCount,
  searching,
}: {
  tab: EmailAdminTab;
  rows: EmailAdminRow[];
  rowCount: number;
  /** A search is applied: an empty list means no match, not good news. */
  searching: boolean;
}) {
  return (
    <DataTable
      // Each tab is its own list, with its own page.
      key={tab}
      columns={buildColumns(tab)}
      data={rows}
      columnTitles={columnTitles}
      getRowId={(row) =>
        row.kind === "unsubscribed"
          ? `${row.emailKey}|${row.topic}`
          : row.emailKey
      }
      server={{ rowCount }}
      searchPlaceholder="Buscar por correo o nombre"
      renderMobileRow={(row) => (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <EmailCell row={row} />
          <ReasonCell row={row} />
          <p className="text-xs text-muted-foreground">
            {formatDateWithTime(when(row))} · {byLabel(row)}
          </p>
          <RowAction row={row} />
        </div>
      )}
      emptyMessage={
        searching
          ? "Ningún correo coincide con la búsqueda."
          : EMPTY_MESSAGES[tab]
      }
    />
  );
}

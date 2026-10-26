import { ChevronRightIcon, MegaphoneIcon } from "lucide-react";
import Link from "next/link";

import {
  COMUNICADO_TAB_LABELS,
  comunicadosHref,
} from "@/app/components/comunicados/admin/comunicados-tabs";
import NewComunicadoButton from "@/app/components/comunicados/admin/new-comunicado-button";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { COMUNICADO_UNTITLED } from "@/app/lib/comunicados/definitions";
import type {
  ComunicadoListRow,
  ComunicadoListStats,
  ComunicadoTab,
} from "@/app/lib/comunicados/queries";
import {
  formatAudienceCount,
  type Paged,
} from "@/app/lib/distribution_lists/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import { formatNotificationTime } from "@/app/lib/notifications/format";

/** Past a week, "hace 12 días" reads worse than the date itself. */
const RELATIVE_FOR_MS = 7 * 24 * 60 * 60_000;

const EMPTY_TAB_COPY = {
  drafts: "No hay borradores.",
  scheduled: "No hay comunicados programados.",
  sent: "Todavía no se envió ningún comunicado.",
} as const satisfies Record<ComunicadoTab, string>;

/** "sáb, 31 oct, 9:00 AM", in Bolivia time, as the bell's items say it. */
export function momentLabel(date: Date) {
  return formatDisplayDate(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "hace 5 minutos" within the week, then "el 12 oct 2026". */
function sinceLabel(date: Date, now: Date) {
  if (now.getTime() - date.getTime() < RELATIVE_FOR_MS) {
    return formatNotificationTime(date, now);
  }
  return `el ${formatDisplayDate(date)}`;
}

/**
 * The row's one state (G3). A missed schedule went back to draft, so it is
 * read before "Borrador"; a retraction overlays a sent one.
 */
export function comunicadoBadge(
  row: Pick<
    ComunicadoListRow,
    "status" | "scheduledAt" | "scheduleMissedAt" | "sending" | "retractedAt"
  >,
): { label: string; variant: BadgeVariant } {
  switch (row.status) {
    case "draft":
      return row.scheduleMissedAt
        ? { label: "No se envió", variant: "red" }
        : { label: "Borrador", variant: "outline" };
    case "scheduled":
      return {
        label: row.scheduledAt
          ? `Programado · ${momentLabel(row.scheduledAt)}`
          : "Programado",
        variant: "secondary",
      };
    case "sent":
      if (row.retractedAt) return { label: "Retirado", variant: "dark" };
      if (row.sending) return { label: "Enviando…", variant: "amber" };
      return { label: "Enviado", variant: "green" };
  }
}

/**
 * "Enviado el sáb, 24 oct, 10:12 AM · Dennis" once sent; before that, when it
 * was last touched and by whom.
 */
export function comunicadoActivityLine(
  row: Pick<
    ComunicadoListRow,
    | "status"
    | "sentAt"
    | "sentByName"
    | "updatedAt"
    | "updatedByName"
    | "createdByName"
  >,
  now: Date,
) {
  if (row.status === "sent" && row.sentAt) {
    const sent = `Enviado el ${momentLabel(row.sentAt)}`;
    return row.sentByName ? `${sent} · ${row.sentByName}` : sent;
  }
  const updated = `Actualizado ${sinceLabel(row.updatedAt, now)}`;
  const by = row.updatedByName ?? row.createdByName;
  return by ? `${updated} · ${by}` : updated;
}

/**
 * "1.240 personas · 1.180 correos · 41 % leído" once sent (G3). The correos
 * part is left out when email was not ticked, the share while nobody has it.
 */
export function comunicadoStatsLine(stats: ComunicadoListStats) {
  const parts = [
    stats.recipients === 1
      ? "1 persona"
      : `${formatAudienceCount(stats.recipients)} personas`,
  ];
  if (stats.emailsSent !== null) {
    parts.push(
      stats.emailsSent === 1
        ? "1 correo"
        : `${formatAudienceCount(stats.emailsSent)} correos`,
    );
  }
  if (stats.readPercent !== null) parts.push(`${stats.readPercent} % leído`);
  return parts.join(" · ");
}

function ComunicadoRow({ row, now }: { row: ComunicadoListRow; now: Date }) {
  const badge = comunicadoBadge(row);
  const title = row.title.trim();

  return (
    <li>
      <Link
        href={`/dashboard/communications/${row.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {title ? (
                <span className="min-w-0 break-words font-medium">{title}</span>
              ) : (
                <span className="font-medium italic text-muted-foreground">
                  {COMUNICADO_UNTITLED}
                </span>
              )}
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {row.editedAt && <Badge variant="outline">Editado</Badge>}
              {row.essential && <Badge variant="orange">Esencial</Badge>}
            </div>
            <p className="break-words text-sm text-muted-foreground">
              {row.audienceLabel ?? "Sin destinatarios todavía"}
            </p>
            {row.stats && (
              <p className="text-sm tabular-nums text-muted-foreground">
                {comunicadoStatsLine(row.stats)}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground md:max-w-64 md:shrink-0 md:text-right">
            {comunicadoActivityLine(row, now)}
          </p>
        </div>
        <ChevronRightIcon
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** Anterior / Siguiente, keeping the tab. */
function ComunicadosPagination({
  tab,
  page,
  pageCount,
}: {
  tab: ComunicadoTab;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      className="flex items-center justify-end gap-3"
      aria-label="Paginación"
    >
      {page <= 1 ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Anterior
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={comunicadosHref(tab, page - 1)}>Anterior</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        Página {page} de {pageCount}
      </span>
      {page >= pageCount ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Siguiente
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={comunicadosHref(tab, page + 1)}>Siguiente</Link>
        </Button>
      )}
    </nav>
  );
}

/** One tab's comunicados, newest activity first, 25 a page. */
export default function ComunicadosList({
  tab,
  list,
  now = new Date(),
}: {
  tab: ComunicadoTab;
  list: Paged<ComunicadoListRow>;
  /** When "hace 5 minutos" is counted from; the request's time by default. */
  now?: Date;
}) {
  if (list.rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {EMPTY_TAB_COPY[tab]}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul
        aria-label={COMUNICADO_TAB_LABELS[tab]}
        className="divide-y overflow-hidden rounded-lg border"
      >
        {list.rows.map((row) => (
          <ComunicadoRow key={row.id} row={row} now={now} />
        ))}
      </ul>
      <ComunicadosPagination
        tab={tab}
        page={list.page}
        pageCount={list.pageCount}
      />
    </div>
  );
}

/** Nothing written yet, in any tab (G3). */
export function ComunicadosEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
      <MegaphoneIcon className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div className="max-w-md space-y-1">
        <p className="font-medium">Todavía no hay comunicados.</p>
        <p className="text-sm text-muted-foreground">
          Escribí el primero para avisar algo a los participantes: llega a sus
          notificaciones y, si querés, a su correo.
        </p>
      </div>
      <NewComunicadoButton />
    </div>
  );
}

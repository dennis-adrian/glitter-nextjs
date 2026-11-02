import { HistoryIcon } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import type { StatusHistoryPage } from "@/app/lib/users/status-history";
import { getProfileStatusLabel, getUserName } from "@/app/lib/users/utils";

type StatusHistoryEvent = StatusHistoryPage["events"][number];

/** The search param that pages the history on the admin user page. */
export const STATUS_HISTORY_PARAM = "historial";

/** Who made the change: the admin, the participant themself, or unknown. */
export function statusEventActor(
  event: Pick<StatusHistoryEvent, "createdByUserId" | "createdBy">,
  userId: number,
): string {
  if (event.createdByUserId === null) return "—";
  if (event.createdByUserId === userId) return "el participante";
  if (!event.createdBy) return "—";
  return getUserName(event.createdBy) || event.createdBy.email;
}

function pageHref(basePath: string, page: number) {
  return page <= 1
    ? `${basePath}#historial`
    : `${basePath}?${STATUS_HISTORY_PARAM}=${page}#historial`;
}

/** A user's status changes, newest first, as admins audit them. */
export default function StatusHistoryList({
  userId,
  history,
  basePath,
}: {
  userId: number;
  history: StatusHistoryPage;
  /** The page this renders on, for the paging links. */
  basePath: string;
}) {
  const { events, page, hasMore } = history;

  return (
    <Card id="historial">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon className="h-5 w-5 text-muted-foreground" />
          Historial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {page > 1
              ? "No hay más cambios de estado."
              : "Sin cambios de estado registrados. Los cambios se registran desde el 21 de agosto de 2026; los anteriores no quedaron guardados."}
          </p>
        ) : (
          <ol className="divide-y">
            {events.map((event) => (
              <li key={event.id} className="space-y-0.5 py-2">
                <p className="text-sm font-medium">
                  {getProfileStatusLabel(event.fromStatus)} →{" "}
                  {getProfileStatusLabel(event.toStatus)}
                </p>
                {event.reason ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {event.reason}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  <time dateTime={event.createdAt.toISOString()}>
                    {formatDateWithTime(event.createdAt)}
                  </time>{" "}
                  · Por {statusEventActor(event, userId)}
                </p>
              </li>
            ))}
          </ol>
        )}
        {page > 1 || hasMore ? (
          <nav
            aria-label="Páginas del historial"
            className="flex justify-between text-sm"
          >
            {page > 1 ? (
              <Link className="underline" href={pageHref(basePath, page - 1)}>
                Más recientes
              </Link>
            ) : (
              <span />
            )}
            {hasMore ? (
              <Link className="underline" href={pageHref(basePath, page + 1)}>
                Anteriores
              </Link>
            ) : null}
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { DateTime } from "luxon";

import { Badge } from "@/app/components/ui/badge";
import { formatDate, formatDateWithTime } from "@/app/lib/formatters";
import { SESSION_TICKET_STATUS_LABELS } from "@/app/lib/programs/definitions";
import type { SessionTicketStatus } from "@/app/lib/programs/definitions";
import { formatMoney } from "@/app/lib/programs/pricing";

export type EnrollmentLine = {
  id: number;
  occurrenceId: number;
  sessionTitle: string;
  startsAt: Date;
  venueName: string | null;
  room: string | null;
  unitPrice: number;
  ticket: {
    code: string;
    status: SessionTicketStatus;
    checkedInAt: Date | null;
  } | null;
};

type Props = { lines: EnrollmentLine[] };

/**
 * The seats this enrollment bought, each with its ticket and whether the
 * person actually arrived.
 *
 * Stacks into labelled blocks rather than a table: on a phone a four-column
 * table either scrolls sideways or crushes the session title, and this is the
 * section an admin reads while on the phone with the attendee.
 */
export default function EnrollmentLines({ lines }: Props) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta inscripción no tiene sesiones.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {lines.map((line) => (
        <li key={line.id} className="rounded-lg border p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium break-words">{line.sessionTitle}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateWithTime(line.startsAt)}
              </p>
              {line.venueName ? (
                <p className="text-xs text-muted-foreground break-words">
                  {line.venueName}
                  {line.room ? ` · ${line.room}` : ""}
                </p>
              ) : null}
            </div>
            <span className="text-sm whitespace-nowrap">
              {formatMoney(line.unitPrice)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {line.ticket ? (
              <>
                <Badge
                  variant={line.ticket.status === "valid" ? "green" : "outline"}
                >
                  {SESSION_TICKET_STATUS_LABELS[line.ticket.status]}
                </Badge>
                {line.ticket.checkedInAt ? (
                  <Badge variant="green">
                    Ingresó{" "}
                    {formatDate(line.ticket.checkedInAt).toLocaleString(
                      DateTime.TIME_SIMPLE,
                    )}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin ingreso</Badge>
                )}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">
                  {line.ticket.code}
                </code>
              </>
            ) : (
              <Badge variant="secondary">Entrada sin emitir</Badge>
            )}

            <Link
              href={`/dashboard/programs/occurrences/${line.occurrenceId}`}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Ver horario
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

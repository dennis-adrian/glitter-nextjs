import { DateTime } from "luxon";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import {
  SESSION_TICKET_STATUS_LABELS,
  SESSION_TYPE_LABELS,
  type SessionTicketStatus,
  type SessionType,
} from "@/app/lib/programs/definitions";

type Props = {
  sessionTitle: string;
  sessionType: SessionType;
  startsAt: Date;
  endsAt: Date;
  venueName: string | null;
  room: string | null;
  ticketCode: string;
  ticketStatus: SessionTicketStatus;
  /** Pre-rendered on the server; null when the ticket is cancelled. */
  qrDataUrl: string | null;
};

/**
 * One ticket, with the QR that gets scanned at the door.
 *
 * The white backdrop and quiet-zone margin are the same defences the email
 * uses — a dark-mode browser theme can invert an unprotected QR just as a mail
 * client can.
 */
export default function PurchaseTicketCard({
  sessionTitle,
  sessionType,
  startsAt,
  endsAt,
  venueName,
  room,
  ticketCode,
  ticketStatus,
  qrDataUrl,
}: Props) {
  const isCancelled = ticketStatus === "cancelled";
  const venueLabel = [venueName, room].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{SESSION_TYPE_LABELS[sessionType]}</Badge>
          <Badge variant={isCancelled ? "red" : "green"}>
            {SESSION_TICKET_STATUS_LABELS[ticketStatus]}
          </Badge>
        </div>
        <CardTitle>{sessionTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {formatDate(startsAt).toLocaleString(DateTime.DATETIME_MED)}
            {" — "}
            {formatDate(endsAt).toLocaleString(DateTime.TIME_SIMPLE)}
          </p>
          {venueLabel ? <p>{venueLabel}</p> : null}
        </div>

        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2">
            <div className="inline-block rounded-lg bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no loader needed */}
              <img
                src={qrDataUrl}
                alt={`Código QR de tu entrada para ${sessionTitle}`}
                width={200}
                height={200}
                className="block bg-white"
              />
            </div>
            <p className="font-mono text-sm font-semibold">{ticketCode}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta entrada fue cancelada y ya no permite el ingreso.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

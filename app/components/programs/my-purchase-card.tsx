import { DateTime } from "luxon";
import Link from "next/link";

import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import {
  SESSION_PURCHASE_STATUS_LABELS,
  SESSION_TYPE_LABELS,
  type SessionPurchaseStatus,
  type SessionType,
} from "@/app/lib/programs/definitions";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import type { PurchaseForAccess } from "@/app/lib/programs/purchase-queries";

type Props = {
  purchase: PurchaseForAccess;
};

const STATUS_VARIANT: Record<
  SessionPurchaseStatus,
  "green" | "amber" | "red" | "secondary"
> = {
  approved: "green",
  pending_upload: "amber",
  under_verification: "amber",
  changes_requested: "amber",
  rejected: "red",
  cancelled: "red",
  expired: "secondary",
};

/**
 * One purchase in the participant's own area.
 *
 * Links to the same secure page a guest reaches by token — the owner just gets
 * there without one, so there is a single place where a ticket and its QR live.
 */
export default function MyPurchaseCard({ purchase }: Props) {
  const firstLine = purchase.lines[0];
  const validTickets = purchase.lines.filter(
    (line) => line.ticket?.status === "valid",
  ).length;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[purchase.status]}>
            {SESSION_PURCHASE_STATUS_LABELS[purchase.status]}
          </Badge>
          {firstLine ? (
            <Badge variant="outline">
              {SESSION_TYPE_LABELS[firstLine.session.type as SessionType]}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-lg">
          {firstLine?.session.title ?? purchase.program.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{purchase.program.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {purchase.lines.map((line) => {
            const resolved = resolveOccurrenceState({
              programStatus: purchase.program.status,
              sessionStatus: line.session.status,
              lifecycleStatus: line.occurrence.lifecycleStatus,
              salesStartAt: line.occurrence.salesStartAt,
              salesEndAt: line.occurrence.salesEndAt,
              salesClosedAt: line.occurrence.salesClosedAt,
              rescheduledAt: line.occurrence.rescheduledAt,
            });

            return (
              <li
                key={line.id}
                className="flex flex-wrap justify-between gap-2"
              >
                <span className="text-muted-foreground">
                  {formatDate(line.occurrence.startsAt).toLocaleString(
                    DateTime.DATETIME_MED,
                  )}
                  {line.occurrence.venue
                    ? ` · ${line.occurrence.venue.name}`
                    : ""}
                </span>
                {/* Surfaced here because a rescheduled session is the one thing
                    a ticket holder most needs to notice. */}
                {resolved.wasRescheduled ? (
                  <ProgramStatusBadge state={resolved.state} wasRescheduled />
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {validTickets === 1
              ? "1 entrada válida"
              : `${validTickets} entradas válidas`}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/programs/purchases/${purchase.id}`}>
              Ver entrada y QR
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

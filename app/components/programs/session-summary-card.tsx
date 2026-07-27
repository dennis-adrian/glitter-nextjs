import Link from "next/link";

import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import {
  SESSION_TYPE_LABELS,
  type SessionWithOccurrences,
} from "@/app/lib/programs/definitions";
import { resolvePrice } from "@/app/lib/programs/pricing";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import type { ProgramStatus } from "@/app/lib/programs/definitions";
import { DateTime } from "luxon";

type Props = {
  session: SessionWithOccurrences;
  programSlug: string;
  programStatus: ProgramStatus;
  programDiscountPercent: number | null;
  globalDiscountPercent: number;
};

/**
 * One session on the public program page. Shows the next occurrence's schedule
 * and state; the session page lists them all.
 */
export default function SessionSummaryCard({
  session,
  programSlug,
  programStatus,
  programDiscountPercent,
  globalDiscountPercent,
}: Props) {
  const nextOccurrence = session.occurrences[0];

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscountPercent,
    globalDiscountPercent,
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const resolvedState = nextOccurrence
    ? resolveOccurrenceState({
        programStatus,
        sessionStatus: session.status,
        lifecycleStatus: nextOccurrence.lifecycleStatus,
        salesStartAt: nextOccurrence.salesStartAt,
        salesEndAt: nextOccurrence.salesEndAt,
        salesClosedAt: nextOccurrence.salesClosedAt,
        rescheduledAt: nextOccurrence.rescheduledAt,
      })
    : null;

  const speakerNames = session.sessionSpeakers
    .map((entry) => entry.speaker.publicName)
    .join(", ");

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{SESSION_TYPE_LABELS[session.type]}</Badge>
          {resolvedState ? (
            <ProgramStatusBadge
              state={resolvedState.state}
              wasRescheduled={resolvedState.wasRescheduled}
            />
          ) : null}
        </div>
        <CardTitle>
          <Link
            href={`/programs/${programSlug}/${session.slug}`}
            className="hover:underline"
          >
            {session.title}
          </Link>
        </CardTitle>
        {speakerNames ? (
          <p className="text-sm text-muted-foreground">{speakerNames}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {nextOccurrence ? (
          <p className="text-muted-foreground">
            {formatDate(nextOccurrence.startsAt).toLocaleString(
              DateTime.DATETIME_MED,
            )}
          </p>
        ) : null}
        <p>
          <span className="font-medium">Bs {publicPrice}</span>
          {participantPrice !== publicPrice ? (
            <span className="text-muted-foreground">
              {" "}
              · Bs {participantPrice} para participantes activos
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}

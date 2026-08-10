import { DateTime } from "luxon";
import Link from "next/link";

import OccurrenceSeatSummary from "@/app/components/dashboard/programs/occurrence-seat-summary";
import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/lib/formatters";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import type { CheckInAgendaEntry } from "@/app/lib/programs/occurrence-queries";

type Props = {
  entry: CheckInAgendaEntry;
  /** Upcoming days need their date; today's only need the hour. */
  showDate: boolean;
};

/**
 * One door on the agenda, with the one action it exists for.
 *
 * The scan button is full width on a phone and sits inline from `sm` up: this
 * list is opened one-handed at a venue, where the button is the target and
 * everything above it is just enough to confirm the right session.
 */
export default function CheckInAgendaCard({ entry, showDate }: Props) {
  const starts = formatDate(entry.startsAt);
  const ends = formatDate(entry.endsAt);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium break-words">{entry.sessionTitle}</p>
          <p className="text-sm text-muted-foreground">
            {showDate
              ? starts.toLocaleString(DateTime.DATETIME_MED)
              : starts.toLocaleString(DateTime.TIME_SIMPLE)}
            {" — "}
            {ends.toLocaleString(DateTime.TIME_SIMPLE)}
          </p>
          <p className="text-xs text-muted-foreground break-words">
            {entry.programName} · {SESSION_TYPE_LABELS[entry.sessionType]}
            {entry.venueName ? ` · ${entry.venueName}` : ""}
            {entry.room ? ` · ${entry.room}` : ""}
          </p>
        </div>

        <Button asChild className="w-full sm:w-auto">
          <Link
            href={`/dashboard/programs/occurrences/${entry.occurrenceId}/check-in`}
          >
            Escanear
          </Link>
        </Button>
      </div>

      <div className="mt-3">
        <OccurrenceSeatSummary
          summary={entry.summary}
          href={`/dashboard/programs/occurrences/${entry.occurrenceId}`}
        />
      </div>
    </li>
  );
}

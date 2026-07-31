import { DateTime } from "luxon";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import OccurrenceRosterTable from "@/app/components/dashboard/programs/occurrence-roster-table";
import OccurrenceSeatSummary from "@/app/components/dashboard/programs/occurrence-seat-summary";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import {
  fetchOccurrenceForAdmin,
  fetchOccurrenceRosters,
  fetchOccurrenceSummaries,
} from "@/app/lib/programs/occurrence-queries";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ occurrenceId: string }>;
};

export default async function OccurrenceDashboardPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { occurrenceId: rawId } = await params;
  const occurrenceId = Number(rawId);
  if (!Number.isInteger(occurrenceId)) notFound();

  const occurrence = await fetchOccurrenceForAdmin(occurrenceId);
  if (!occurrence) notFound();

  const { session } = occurrence;
  const { program } = session;

  const [summaries, rosters] = await Promise.all([
    fetchOccurrenceSummaries([
      { id: occurrence.id, capacity: occurrence.capacity },
    ]),
    fetchOccurrenceRosters([occurrence.id]),
  ]);

  const summary = summaries.get(occurrence.id);
  const entries = rosters.get(occurrence.id) ?? [];

  const resolved = resolveOccurrenceState({
    programStatus: program.status,
    sessionStatus: session.status,
    lifecycleStatus: occurrence.lifecycleStatus,
    salesStartAt: occurrence.salesStartAt,
    salesEndAt: occurrence.salesEndAt,
    salesClosedAt: occurrence.salesClosedAt,
    rescheduledAt: occurrence.rescheduledAt,
  });

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/programs/${program.id}/sessions/${session.id}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← {session.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">
            {formatDate(occurrence.startsAt).toLocaleString(
              DateTime.DATETIME_MED,
            )}
            {" — "}
            {formatDate(occurrence.endsAt).toLocaleString(DateTime.TIME_SIMPLE)}
          </h1>
          <ProgramStatusBadge
            state={resolved.state}
            wasRescheduled={resolved.wasRescheduled}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {program.name} · {SESSION_TYPE_LABELS[session.type]}
          {occurrence.venue ? ` · ${occurrence.venue.name}` : ""}
          {occurrence.room ? ` · ${occurrence.room}` : ""}
        </p>
        {summary ? <OccurrenceSeatSummary summary={summary} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inscritos</CardTitle>
        </CardHeader>
        <CardContent>
          <OccurrenceRosterTable entries={entries} />
        </CardContent>
      </Card>
    </div>
  );
}

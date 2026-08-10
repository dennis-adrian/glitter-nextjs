import { DateTime } from "luxon";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CheckInPanel from "@/app/components/dashboard/programs/checkin/checkin-panel";
import { formatDate } from "@/app/lib/formatters";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import { fetchOccurrenceForAdmin } from "@/app/lib/programs/occurrence-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ occurrenceId: string }>;
};

/**
 * The door screen for one occurrence.
 *
 * A route of its own rather than a panel on the occurrence dashboard: this is
 * held in one hand, at a door, and everything on it has to be the scan. The
 * roster is a click away for the moments when it is actually needed.
 *
 * Renders no roster data at all, which is what keeps `revalidatePath` on a
 * successful check-in from re-rendering the scanner the operator is using.
 */
export default async function OccurrenceCheckInPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { occurrenceId: rawId } = await params;
  const occurrenceId = Number(rawId);
  if (!Number.isInteger(occurrenceId)) notFound();

  const occurrence = await fetchOccurrenceForAdmin(occurrenceId);
  if (!occurrence) notFound();

  const { session } = occurrence;
  const { program } = session;
  const isCancelled = occurrence.lifecycleStatus === "cancelled";

  return (
    <div className="container mx-auto space-y-6 p-3 md:p-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/programs/occurrences/${occurrence.id}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Inscritos
        </Link>
        <h1 className="text-2xl font-bold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(occurrence.startsAt).toLocaleString(
            DateTime.DATETIME_MED,
          )}
          {" — "}
          {formatDate(occurrence.endsAt).toLocaleString(DateTime.TIME_SIMPLE)}
          {" · "}
          {program.name} · {SESSION_TYPE_LABELS[session.type]}
          {occurrence.venue ? ` · ${occurrence.venue.name}` : ""}
          {occurrence.room ? ` · ${occurrence.room}` : ""}
        </p>
      </div>

      {isCancelled ? (
        <div className="rounded-lg border border-red-300 bg-red-100 px-4 py-3 text-red-900">
          <p className="font-semibold">Esta sesión fue cancelada</p>
          <p className="text-sm">
            No se puede registrar el ingreso de nadie a un horario cancelado.
          </p>
        </div>
      ) : (
        <CheckInPanel occurrenceId={occurrence.id} />
      )}
    </div>
  );
}

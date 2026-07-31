import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import OccurrenceForm from "@/app/components/dashboard/programs/occurrence-form";
import OccurrenceRow from "@/app/components/dashboard/programs/occurrence-row";
import PublicUrlField from "@/app/components/dashboard/programs/public-url-field";
import PublicationButtons from "@/app/components/dashboard/programs/publication-buttons";
import SessionForm from "@/app/components/dashboard/programs/session-form";
import SessionSpeakersPanel from "@/app/components/dashboard/programs/session-speakers-panel";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  fetchProgramSettings,
  fetchSessionForAdmin,
  fetchSessionTopics,
  fetchSpeakers,
  fetchVenues,
} from "@/app/lib/programs/data";
import {
  SESSION_AUDIENCE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/app/lib/programs/definitions";
import {
  SESSION_PUBLISH_BLOCKER_LABELS,
  resolveSessionPublishability,
} from "@/app/lib/programs/state";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ id: string; sessionId: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { id, sessionId: rawSessionId } = await params;
  const programId = Number(id);
  const sessionId = Number(rawSessionId);
  if (!Number.isInteger(programId) || !Number.isInteger(sessionId)) notFound();

  const [session, venues, speakers, settings, topics] = await Promise.all([
    fetchSessionForAdmin(sessionId),
    fetchVenues(),
    fetchSpeakers(),
    fetchProgramSettings(),
    fetchSessionTopics(),
  ]);

  if (!session || session.programId !== programId) notFound();

  const publishability = resolveSessionPublishability({
    status: session.status,
    venueId: session.venueId,
    programDefaultVenueId: session.program.defaultVenueId,
    speakerCount: session.sessionSpeakers.length,
    occurrences: session.occurrences,
  });

  const blocker = publishability.publishable ? null : publishability.blocker;

  return (
    <div className="container p-3 md:p-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href={`/dashboard/programs/${programId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {session.program.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={session.status === "published" ? "green" : "outline"}
            >
              {session.status === "published" ? "Publicada" : "Borrador"}
            </Badge>
            <Badge variant="outline">{SESSION_TYPE_LABELS[session.type]}</Badge>
            <Badge variant="secondary">
              {SESSION_AUDIENCE_LABELS[session.audience]}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold">{session.title}</h1>
          {/* A session is the thing people actually share, so its own URL
              matters more than the program's. Draft either way hides it. */}
          <PublicUrlField
            path={`/programs/${session.program.slug}/${session.slug}`}
            isDraft={
              session.status !== "published" ||
              session.program.status !== "published"
            }
          />
        </div>
        <div className="space-y-2">
          <PublicationButtons
            scope="session"
            sessionId={session.id}
            status={session.status}
          />
          {blocker && blocker !== "already_published" ? (
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              No se puede publicar: {SESSION_PUBLISH_BLOCKER_LABELS[blocker]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {session.occurrences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin horarios. Una sesión necesita al menos uno para publicarse.
              </p>
            ) : (
              <ul className="space-y-3">
                {session.occurrences.map((occurrence) => (
                  <OccurrenceRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    venues={venues}
                    defaultCapacity={settings.defaultOccurrenceCapacity}
                    programStatus={session.program.status}
                    sessionStatus={session.status}
                  />
                ))}
              </ul>
            )}

            <div className="border-t border-border/70 pt-4">
              <h3 className="mb-3 text-sm font-medium">Agregar horario</h3>
              <OccurrenceForm
                sessionId={session.id}
                venues={venues}
                defaultCapacity={settings.defaultOccurrenceCapacity}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expositores</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionSpeakersPanel
              sessionId={session.id}
              assigned={session.sessionSpeakers}
              speakers={speakers}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contenido</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionForm
            programId={programId}
            session={session}
            venues={venues}
            topics={topics}
          />
        </CardContent>
      </Card>
    </div>
  );
}

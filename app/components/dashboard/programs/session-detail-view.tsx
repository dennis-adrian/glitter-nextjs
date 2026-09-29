import Link from "next/link";

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
import { fetchFestivals } from "@/app/lib/festivals/actions";
import {
  fetchProgramSettings,
  fetchSessionTopics,
  fetchSpeakers,
  fetchVenues,
  type fetchSessionForAdmin,
} from "@/app/lib/programs/data";
import {
  SESSION_AUDIENCE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/app/lib/programs/definitions";
import { fetchOccurrenceSummaries } from "@/app/lib/programs/occurrence-queries";
import { sessionPath } from "@/app/lib/programs/paths";
import {
  SESSION_PUBLISH_BLOCKER_LABELS,
  resolveSessionPublishability,
} from "@/app/lib/programs/state";

type SessionForAdmin = NonNullable<
  Awaited<ReturnType<typeof fetchSessionForAdmin>>
>;

type FestivalOption = { id: number; name: string };

type Props = {
  session: SessionForAdmin;
  /** Whether this viewer may upload images; see `SessionForm`. */
  canUploadImages: boolean;
};

/**
 * The admin page for one session, program or standalone. Both routes render
 * this, so the two can only differ where the session itself does: the back
 * link, the public URL, and the festival picker a standalone session carries.
 *
 * Loads its own lists once the route has resolved the session, so an unknown
 * or misrouted id costs no roster query.
 */
export default async function SessionDetailView({
  session,
  canUploadImages,
}: Props) {
  const { program } = session;

  // Only a standalone session picks a festival; a program session has the
  // program's, edited on the program.
  const festivalOptions: Promise<FestivalOption[]> = program
    ? Promise.resolve([])
    : fetchFestivals().then((festivals) =>
        festivals.map((festival) => ({ id: festival.id, name: festival.name })),
      );

  const [venues, speakers, settings, topics, summaries, festivals] =
    await Promise.all([
      fetchVenues(),
      fetchSpeakers(),
      fetchProgramSettings(),
      fetchSessionTopics(),
      fetchOccurrenceSummaries(session.occurrences),
      festivalOptions,
    ]);

  const publishability = resolveSessionPublishability({
    status: session.status,
    venueId: session.venueId,
    programDefaultVenueId: program?.defaultVenueId ?? null,
    speakerCount: session.sessionSpeakers.length,
    occurrences: session.occurrences,
  });

  const blocker = publishability.publishable ? null : publishability.blocker;

  return (
    <div className="container p-3 md:p-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href={
              program
                ? `/dashboard/programs/${program.id}`
                : "/dashboard/programs"
            }
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {program ? program.name : "Programas"}
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
            {session.festival ? (
              <Badge variant="secondary">{session.festival.name}</Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold">{session.title}</h1>
          {/* A session is the thing people actually share, so its own URL
              matters more than the program's. Draft either way hides it. */}
          <PublicUrlField
            path={sessionPath(session)}
            isDraft={
              session.status !== "published" ||
              (program !== null && program.status !== "published")
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
                    programStatus={program?.status ?? null}
                    sessionStatus={session.status}
                    summary={summaries.get(occurrence.id)}
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
            programId={session.programId}
            session={session}
            venues={venues}
            topics={topics}
            festivals={festivals}
            canUploadImages={canUploadImages}
          />
        </CardContent>
      </Card>
    </div>
  );
}

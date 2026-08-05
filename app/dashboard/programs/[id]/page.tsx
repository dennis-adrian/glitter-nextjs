import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ProgramForm from "@/app/components/dashboard/programs/program-form";
import PublicUrlField from "@/app/components/dashboard/programs/public-url-field";
import PublicationButtons from "@/app/components/dashboard/programs/publication-buttons";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { fetchProgramForAdmin, fetchVenues } from "@/app/lib/programs/data";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProgramDetailPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId)) notFound();

  const [program, venues, festivals] = await Promise.all([
    fetchProgramForAdmin(programId),
    fetchVenues(),
    fetchFestivals(),
  ]);

  if (!program) notFound();

  return (
    <div className="container p-3 md:p-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={program.status === "published" ? "green" : "outline"}
            >
              {program.status === "published" ? "Publicado" : "Borrador"}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold">{program.name}</h1>
          <PublicUrlField
            path={`/programs/${program.slug}`}
            isDraft={program.status !== "published"}
          />
        </div>
        <PublicationButtons
          scope="program"
          programId={program.id}
          status={program.status}
        />
      </div>

      <div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/dashboard/programs/promo-codes/new?programId=${program.id}`}
          >
            Crear código promocional
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Sesiones</CardTitle>
          <Button asChild size="sm">
            <Link href={`/dashboard/programs/${program.id}/sessions/new`}>
              Nueva sesión
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {program.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay sesiones en este programa.
            </p>
          ) : (
            <ul className="space-y-2">
              {program.sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/dashboard/programs/${program.id}/sessions/${session.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {session.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {SESSION_TYPE_LABELS[session.type]} ·{" "}
                      {session.occurrences.length} horario(s) ·{" "}
                      {session.sessionSpeakers.length} expositor(es)
                    </p>
                  </div>
                  <Badge
                    variant={
                      session.status === "published" ? "green" : "outline"
                    }
                  >
                    {session.status === "published" ? "Publicada" : "Borrador"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos del programa</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgramForm
            program={program}
            venues={venues}
            festivals={festivals.map((festival) => ({
              id: festival.id,
              name: festival.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

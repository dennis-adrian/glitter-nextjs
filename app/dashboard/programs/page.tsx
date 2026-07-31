import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { fetchProgramsForAdmin } from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
import { redirect } from "next/navigation";

export default async function ProgramsDashboardPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const programs = await fetchProgramsForAdmin();

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Programas</h1>
          <p className="text-sm text-muted-foreground">
            Charlas y talleres agrupados en programas como Glitter Week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/programs/venues">Lugares</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/programs/speakers">Expositores</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/programs/new">Nuevo programa</Link>
          </Button>
        </div>
      </div>

      {programs.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay programas. Crea el primero para empezar.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => {
            const publishedSessions = program.sessions.filter(
              (session) => session.status === "published",
            ).length;

            return (
              <Card key={program.id}>
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        program.status === "published" ? "green" : "outline"
                      }
                    >
                      {program.status === "published"
                        ? "Publicado"
                        : "Borrador"}
                    </Badge>
                    {program.festival ? (
                      <Badge variant="secondary">{program.festival.name}</Badge>
                    ) : null}
                  </div>
                  <CardTitle>
                    <Link
                      href={`/dashboard/programs/${program.id}`}
                      className="hover:underline"
                    >
                      {program.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {program.startDate ? (
                    <p>
                      {formatDate(program.startDate).toLocaleString(
                        DateTime.DATE_MED,
                      )}
                    </p>
                  ) : null}
                  <p>
                    {program.sessions.length} sesión(es) · {publishedSessions}{" "}
                    publicada(s)
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

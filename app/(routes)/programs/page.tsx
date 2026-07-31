import type { Metadata } from "next";
import Link from "next/link";

import ProgramViewTracker from "@/app/components/programs/program-view-tracker";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { formatDate } from "@/app/lib/formatters";
import { fetchPublishedPrograms } from "@/app/lib/programs/data";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";

export const metadata: Metadata = {
  title: "Programas",
  description: "Charlas y talleres de Glitter.",
};

export default async function ProgramsIndexPage() {
  await requireFeatureEnabled("paid_programs");

  const [programs, profile] = await Promise.all([
    fetchPublishedPrograms(),
    getCurrentBaseProfile(),
  ]);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <ProgramViewTracker
        event={POSTHOG_EVENTS.PROGRAM_INDEX_VIEWED}
        properties={{
          program_count: programs.length,
          is_signed_in: profile !== null,
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Programas</h1>
          <p className="text-muted-foreground">
            Charlas y talleres para aprender, practicar y conocer gente.
          </p>
        </div>
        {/* Contextual entry point: this page already resolves the flag and the
            profile, so the link costs nothing extra here. */}
        {profile ? (
          <Button asChild variant="outline">
            <Link href="/my_programs">Mis inscripciones</Link>
          </Button>
        ) : null}
      </header>

      {programs.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay programas publicados.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => {
            const dateRange = [program.startDate, program.endDate]
              .filter((date): date is Date => date !== null)
              .map((date) => formatDate(date).toLocaleString(DateTime.DATE_MED))
              .join(" — ");

            return (
              <Card key={program.id}>
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={`/programs/${program.slug}`}
                      className="hover:underline"
                    >
                      {program.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {dateRange ? (
                    <p className="text-muted-foreground">{dateRange}</p>
                  ) : null}
                  {program.summary ? <p>{program.summary}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

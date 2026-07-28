import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDate } from "@/app/lib/formatters";
import { fetchPublishedPrograms } from "@/app/lib/programs/data";
import { DateTime } from "luxon";

export const metadata: Metadata = {
  title: "Programas",
  description: "Charlas y talleres de Glitter.",
};

export default async function ProgramsIndexPage() {
  await requireFeatureEnabled("paid_programs");

  const programs = await fetchPublishedPrograms();

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Programas</h1>
        <p className="text-muted-foreground">
          Charlas y talleres para aprender, practicar y conocer gente.
        </p>
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

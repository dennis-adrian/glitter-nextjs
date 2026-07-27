import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SessionSummaryCard from "@/app/components/programs/session-summary-card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDate } from "@/app/lib/formatters";
import {
  fetchProgramSettings,
  fetchPublishedProgramBySlug,
} from "@/app/lib/programs/data";
import { DateTime } from "luxon";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const program = await fetchPublishedProgramBySlug(slug);

  if (!program) return { title: "Programa" };

  return {
    title: program.name,
    description: program.summary ?? undefined,
    openGraph: {
      title: program.name,
      description: program.summary ?? undefined,
      images: program.bannerUrl ? [program.bannerUrl] : undefined,
    },
  };
}

export default async function ProgramPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs");

  const { slug } = await params;
  const [program, settings] = await Promise.all([
    fetchPublishedProgramBySlug(slug),
    fetchProgramSettings(),
  ]);

  if (!program) notFound();

  const dateRange = [program.startDate, program.endDate]
    .filter((date): date is Date => date !== null)
    .map((date) => formatDate(date).toLocaleString(DateTime.DATE_MED))
    .join(" — ");

  return (
    <div className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{program.name}</h1>
        {dateRange ? (
          <p className="text-sm text-muted-foreground">{dateRange}</p>
        ) : null}
        {program.summary ? (
          <p className="text-lg text-muted-foreground">{program.summary}</p>
        ) : null}
        {program.description ? (
          <p className="whitespace-pre-line">{program.description}</p>
        ) : null}
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sesiones</h2>
        {program.sessions.length === 0 ? (
          <p className="text-muted-foreground">
            Todavía no hay sesiones publicadas.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {program.sessions.map((session) => (
              <SessionSummaryCard
                key={session.id}
                session={session}
                programSlug={program.slug}
                programStatus={program.status}
                programDiscountPercent={program.participantDiscountPercent}
                globalDiscountPercent={
                  settings.defaultParticipantDiscountPercent
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

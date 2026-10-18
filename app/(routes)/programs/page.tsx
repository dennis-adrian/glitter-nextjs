import type { Metadata } from "next";
import Link from "next/link";

import CataloguePastPrograms from "@/app/components/programs/catalogue-past-programs";
import CatalogueProgramCard from "@/app/components/programs/catalogue-program-card";
import CatalogueSection from "@/app/components/programs/catalogue-section";
import CatalogueSessionCard from "@/app/components/programs/catalogue-session-card";
import ProgramViewTracker from "@/app/components/programs/program-view-tracker";
import { Button } from "@/app/components/ui/button";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { buildCatalogue } from "@/app/lib/programs/catalogue";
import { countUpcomingByProgram } from "@/app/lib/programs/catalogue-view";
import { fetchCatalogue, fetchProgramSettings } from "@/app/lib/programs/data";
import { globalDiscountFrom } from "@/app/lib/programs/pricing";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Charlas y Talleres",
  description: "Charlas y talleres de Glitter.",
};

export default async function ProgramsIndexPage() {
  await requireFeatureEnabled("paid_programs");

  const [catalogue, settings, profile] = await Promise.all([
    fetchCatalogue(),
    fetchProgramSettings(),
    getCurrentBaseProfile(),
  ]);

  // Rendered per request (the viewer decides the flag and the header link), so
  // this instant is the request's: a session drops off the moment it ends.
  const now = new Date();
  const { upcomingSessions, currentPrograms, pastPrograms } = buildCatalogue({
    sessions: catalogue.sessions,
    programs: catalogue.programs,
    now,
  });
  const upcomingByProgram = countUpcomingByProgram(upcomingSessions);
  const globalDiscount = globalDiscountFrom(settings);

  return (
    <div className="bg-brand-elevated text-brand-ink">
      <div className="container mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 sm:py-14">
        <ProgramViewTracker
          event={POSTHOG_EVENTS.PROGRAM_INDEX_VIEWED}
          properties={{
            program_count: catalogue.programs.length,
            upcoming_session_count: upcomingSessions.length,
            is_signed_in: profile !== null,
          }}
        />
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <h1 className="max-w-[18ch] text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-[-1px] sm:text-5xl">
              Charlas y Talleres
            </h1>
            <p className="text-lg leading-8 text-brand-ink/75">
              Espacios para aprender, practicar y conocer gente.
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

        {currentPrograms.length > 0 ? (
          <section aria-label="Programas en curso" className="space-y-5">
            {currentPrograms.map((program) => (
              <CatalogueProgramCard
                key={program.id}
                program={program}
                upcomingCount={upcomingByProgram.get(program.id) ?? 0}
              />
            ))}
          </section>
        ) : null}

        <CatalogueSection id="proximas-sesiones" title="Próximas sesiones">
          {upcomingSessions.length === 0 ? (
            <p className="rounded-2xl bg-brand-lavender/60 px-6 py-8 text-lg font-medium">
              Pronto anunciaremos nuevas charlas y talleres.
            </p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingSessions.map(({ session, nextOccurrence }) => (
                <li key={session.id}>
                  <CatalogueSessionCard
                    session={session}
                    nextOccurrence={nextOccurrence}
                    globalDiscount={globalDiscount}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          )}
        </CatalogueSection>

        {pastPrograms.length > 0 ? (
          <CatalogueSection
            id="programas-anteriores"
            title="Programas anteriores"
          >
            <CataloguePastPrograms programs={pastPrograms} />
          </CatalogueSection>
        ) : null}
      </div>
    </div>
  );
}

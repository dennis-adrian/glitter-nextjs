import { VOLUNTEER_COPY } from "@/app/lib/volunteers/definitions";

/**
 * Placeholder hero for /voluntarios. Expected to be replaced by the mockup
 * components; it only takes plain strings.
 */
export default function VolunteersHero({
  festivalName,
  datesLabel,
  venueLabel,
}: {
  festivalName: string;
  /** "19 y 20 de diciembre de 2026"; null when the festival has no dates. */
  datesLabel: string | null;
  venueLabel: string | null;
}) {
  return (
    <section className="grid gap-3">
      <h1 className="text-3xl font-bold break-words md:text-4xl">
        {VOLUNTEER_COPY.heroTitle}
      </h1>
      <p className="text-lg text-muted-foreground break-words">
        {[festivalName, datesLabel, venueLabel].filter(Boolean).join(" · ")}
      </p>
      <p className="break-words">{VOLUNTEER_COPY.heroLead}</p>
    </section>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import OccurrenceScheduleList from "@/app/components/programs/occurrence-schedule-list";
import { Badge } from "@/app/components/ui/badge";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  fetchProgramSettings,
  fetchPublishedSession,
  fetchVenues,
} from "@/app/lib/programs/data";
import {
  SESSION_SKILL_LEVEL_LABELS,
  SESSION_TYPE_LABELS,
} from "@/app/lib/programs/definitions";
import {
  formatMoney,
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";

type Props = {
  params: Promise<{ slug: string; sessionSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sessionSlug } = await params;
  const session = await fetchPublishedSession(slug, sessionSlug);

  if (!session) return { title: "Sesión" };

  return {
    title: session.title,
    description: session.description ?? undefined,
    openGraph: {
      title: session.title,
      description: session.description ?? undefined,
      images: session.imageUrl ? [session.imageUrl] : undefined,
    },
  };
}

export default async function SessionPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs");

  const { slug, sessionSlug } = await params;
  const [session, settings, venues] = await Promise.all([
    fetchPublishedSession(slug, sessionSlug),
    fetchProgramSettings(),
    fetchVenues(),
  ]);

  if (!session) notFound();

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscount: programDiscountFrom(session.program),
    globalDiscount: globalDiscountFrom(settings),
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const outcomes = session.learningOutcomes ?? [];

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{SESSION_TYPE_LABELS[session.type]}</Badge>
          {session.skillLevel ? (
            <Badge variant="secondary">
              {SESSION_SKILL_LEVEL_LABELS[session.skillLevel]}
            </Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-bold">{session.title}</h1>
        {session.topic ? (
          <p className="text-muted-foreground">{session.topic}</p>
        ) : null}
      </header>

      {session.sessionSpeakers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            {session.type === "workshop" ? "Facilitan" : "Exponen"}
          </h2>
          <ul className="space-y-3">
            {session.sessionSpeakers.map((entry) => (
              <li key={entry.id}>
                <p className="font-medium">{entry.speaker.publicName}</p>
                {entry.role ? (
                  <p className="text-sm text-muted-foreground">{entry.role}</p>
                ) : null}
                {entry.speaker.bio ? (
                  <p className="text-sm text-muted-foreground">
                    {entry.speaker.bio}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {session.description ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Sobre la sesión</h2>
          <p className="whitespace-pre-line">{session.description}</p>
        </section>
      ) : null}

      {outcomes.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Qué te llevas</h2>
          <ul className="list-disc space-y-1 pl-5">
            {outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Precio</h2>
        <p className="text-lg font-medium">{formatMoney(publicPrice)}</p>
        {participantPrice !== publicPrice ? (
          <p className="text-muted-foreground">
            {formatMoney(participantPrice)} para participantes activos
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Horarios</h2>
        <OccurrenceScheduleList
          occurrences={session.occurrences}
          programStatus={session.program.status}
          sessionStatus={session.status}
          venuesById={venuesById}
          fallbackVenueId={
            session.venueId ?? session.program.defaultVenueId ?? null
          }
        />
      </section>
    </div>
  );
}

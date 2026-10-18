import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SessionPageContent from "@/app/components/programs/session-page-content";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  fetchProgramSettings,
  fetchPublishedStandaloneSession,
  fetchPublishedStandaloneSessionRouteParams,
  fetchVenues,
} from "@/app/lib/programs/data";
import { getAvailabilityForOccurrences } from "@/app/lib/programs/registration-actions";
import { buildSessionMetadata } from "@/app/lib/programs/session-metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-static";
export const revalidate = 60;

export async function generateStaticParams() {
  return fetchPublishedStandaloneSessionRouteParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildSessionMetadata(await fetchPublishedStandaloneSession(slug));
}

/**
 * A talk or workshop that belongs to no program. `sessions` is a reserved
 * program slug, so this static segment never shadows a program page.
 */
export default async function StandaloneSessionPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs", null);

  const { slug } = await params;
  const [session, settings, venues] = await Promise.all([
    fetchPublishedStandaloneSession(slug),
    fetchProgramSettings(),
    fetchVenues(),
  ]);

  if (!session) notFound();

  const availabilityByOccurrence = await getAvailabilityForOccurrences(
    session.occurrences.map((occurrence) => occurrence.id),
  );

  return (
    <SessionPageContent
      session={session}
      settings={settings}
      venues={venues}
      availabilityByOccurrence={availabilityByOccurrence}
      renderedAt={new Date()}
    />
  );
}

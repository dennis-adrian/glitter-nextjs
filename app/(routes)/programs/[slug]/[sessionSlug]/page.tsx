import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SessionPageContent from "@/app/components/programs/session-page-content";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  fetchProgramSettings,
  fetchPublishedSession,
  fetchPublishedSessionRouteParams,
  fetchVenues,
} from "@/app/lib/programs/data";
import { getAvailabilityForOccurrences } from "@/app/lib/programs/registration-actions";
import { buildSessionMetadata } from "@/app/lib/programs/session-metadata";

type Props = {
  params: Promise<{ slug: string; sessionSlug: string }>;
};

export const dynamic = "force-static";
export const revalidate = 60;

export async function generateStaticParams() {
  return fetchPublishedSessionRouteParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sessionSlug } = await params;
  return buildSessionMetadata(await fetchPublishedSession(slug, sessionSlug));
}

/** A session inside a program; standalone ones live at `/programs/sessions`. */
export default async function SessionPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs", null);

  const { slug, sessionSlug } = await params;
  const [session, settings, venues] = await Promise.all([
    fetchPublishedSession(slug, sessionSlug),
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

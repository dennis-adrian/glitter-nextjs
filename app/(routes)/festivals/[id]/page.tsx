import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { z } from "zod";

import FestivalPageHero from "@/app/components/festivals/festival-page-hero";
import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import { FestivalGuideSkeleton } from "@/app/components/festivals/festival-guide";
import FestivalVisitorDiscovery, {
  FestivalGuideSection,
} from "@/app/components/festivals/festival-visitor-discovery";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fetchPublicFestivalPage } from "@/app/lib/festivals/actions";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const getFestival = cache((festivalId: number) =>
  fetchPublicFestivalPage(festivalId),
);

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) return {};

  const festival = await getFestival(validatedParams.data.id);
  if (!festival) return {};

  const image =
    festival.posterUrl ?? festival.festivalBannerUrl ?? festival.thumbnailUrl;

  return {
    title: festival.name,
    description:
      festival.description ||
      `Entrada, mapa, participantes y actividades de ${festival.name}.`,
    openGraph: image ? { images: [image] } : undefined,
  };
}

function VisitorDiscoveryFallback() {
  return (
    <div className="space-y-16" aria-label="Cargando guía del festival">
      <section className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <Skeleton className="h-120 rounded-2xl" />
      </section>
      <section className="space-y-5">
        <Skeleton className="h-10 w-56" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function Page({ params }: PageProps) {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) notFound();

  const festival = await getFestival(validatedParams.data.id);
  if (!festival) notFound();

  return (
    <article>
      {/* A deeper screen for verified participants: the bar names it. */}
      <ScreenTitle title={festival.name} />
      <FestivalPageHero festival={festival} hasFastPass={false} />

      <div className="container mx-auto flex max-w-7xl flex-col gap-12 px-4 pb-10 pt-6 sm:gap-16 sm:px-6 sm:pb-14 lg:px-8">
        <Suspense fallback={<FestivalGuideSkeleton />}>
          <FestivalGuideSection
            festivalId={festival.id}
            locationLabel={festival.locationLabel}
            locationUrl={festival.locationUrl}
          />
        </Suspense>
        {/* Outside the loading boundary, so a link to #mapa always finds it
            where the map will be, even before the map has loaded. */}
        <section id="mapa" tabIndex={-1} className="scroll-mt-24">
          <Suspense fallback={<VisitorDiscoveryFallback />}>
            <FestivalVisitorDiscovery
              festivalId={festival.id}
              festivalName={festival.name}
            />
          </Suspense>
        </section>
      </div>
    </article>
  );
}

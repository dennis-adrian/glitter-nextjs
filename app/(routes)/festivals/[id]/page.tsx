import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { z } from "zod";

import FestivalPageHero from "@/app/components/festivals/festival-page-hero";
import FestivalVisitorDiscovery from "@/app/components/festivals/festival-visitor-discovery";
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
      festival.description ??
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
    <article className="pb-24 md:pb-0">
      <FestivalPageHero festival={festival} hasFastPass={false} />

      <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
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

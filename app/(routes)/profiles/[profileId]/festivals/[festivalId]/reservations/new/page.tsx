import SectorSelectionSkeleton from "@/app/components/festivals/reservations/sector-selection-skeleton";
import SectorSelectionPage from "@/app/components/pages/profiles/festivals/sector-selection";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page(
  props: {
    params: Promise<{ festivalId: string; profileId: string }>;
  }
) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <Suspense fallback={<SectorSelectionSkeleton />}>
      <SectorSelectionPage
        profileId={validatedParams.data.profileId}
        festivalId={validatedParams.data.festivalId}
      />
    </Suspense>
  );
}

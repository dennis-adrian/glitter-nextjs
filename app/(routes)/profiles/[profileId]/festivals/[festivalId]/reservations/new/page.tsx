import Loader from "@/app/components/loader";
import NewReservationPage from "@/app/components/pages/profiles/festivals/new-reservation";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page({
  params,
}: {
  params: { festivalId: string; profileId: string };
}) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <Suspense fallback={<Loader />}>
      <NewReservationPage
        profileId={validatedParams.data.profileId}
        festivalId={validatedParams.data.festivalId}
      />
    </Suspense>
  );
}

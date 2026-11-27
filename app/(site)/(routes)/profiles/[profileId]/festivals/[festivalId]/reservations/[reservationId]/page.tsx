import { notFound } from "next/navigation";
import { z } from "zod";

import ReservationDetailPage from "@/app/components/pages/profiles/festivals/reservation-detail";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
  reservationId: z.coerce.number(),
});

export default async function Page(props: {
  params: Promise<{
    festivalId: string;
    profileId: string;
    reservationId: string;
  }>;
}) {
  const validatedParams = ParamsSchema.safeParse(await props.params);
  if (!validatedParams.success) notFound();

  return (
    <ReservationDetailPage
      profileId={validatedParams.data.profileId}
      festivalId={validatedParams.data.festivalId}
      reservationId={validatedParams.data.reservationId}
    />
  );
}

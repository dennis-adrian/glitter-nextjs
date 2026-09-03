import { notFound } from "next/navigation";
import { z } from "zod";

import CreditsIntroduction from "@/app/components/festivals/reservations/credits-introduction";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page(props: {
  params: Promise<{ festivalId: string; profileId: string }>;
}) {
  const validatedParams = ParamsSchema.safeParse(await props.params);
  if (!validatedParams.success) notFound();

  return (
    <CreditsIntroduction
      profileId={validatedParams.data.profileId}
      festivalId={validatedParams.data.festivalId}
    />
  );
}

import { UserCategory } from "@/app/api/users/definitions";
import Terms from "@/app/components/festivals/terms";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await getCurrentUserProfile();
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  const festival = await fetchFestivalWithDates(parseInt(params.id));
  if (!festival) notFound();

  return (
    <Terms
      profile={profile!}
      festival={festival}
      category={profile!.category as Exclude<UserCategory, "none">}
    />
  );
}

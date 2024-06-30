import { UserCategory } from "@/app/api/users/definitions";
import Terms from "@/app/components/festivals/terms";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { HeartCrackIcon } from "lucide-react";
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

  if (profile?.role !== "admin" && festival.status !== "active") {
    return (
      <div className="flex flex-col items-center justify-center my-8 text-muted-foreground gap-2">
        <HeartCrackIcon className="h-12 w-12" />
        <p>El festival aún no tiene las reservas activas</p>
      </div>
    );
  }

  return (
    <Terms
      profile={profile!}
      festival={festival}
      category={profile!.category as Exclude<UserCategory, "none">}
    />
  );
}

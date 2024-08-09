import { UserCategory } from "@/app/api/users/definitions";
import Terms from "@/app/components/festivals/terms";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { HeartCrackIcon } from "lucide-react";
import { notFound } from "next/navigation";

type TermsPageProps = {
  profileId: number;
  festivalId: number;
};
export default async function TermsPage(props: TermsPageProps) {
  const profile = await getCurrentUserProfile();
  await protectRoute(profile || undefined, props.profileId);
  const festival = await fetchFestivalWithDates(props.festivalId);
  if (!festival) notFound();

  if (profile?.role !== "admin" && festival.status !== "active") {
    return (
      <div className="flex flex-col items-center justify-center my-8 text-muted-foreground gap-2">
        <HeartCrackIcon className="h-12 w-12" />
        <p>El festival aún no tiene las reservas activas</p>
      </div>
    );
  }

  const hasSubcategories =
    profile?.profileSubcategories && profile.profileSubcategories.length > 0;
  if (!hasSubcategories) notFound();

  return (
    <Terms
      profile={profile!}
      festival={festival}
      category={profile!.category as Exclude<UserCategory, "none">}
    />
  );
}

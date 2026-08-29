import { fetchUserProfileById } from "@/app/api/users/actions";
import { UserCategory } from "@/app/api/users/definitions";
import TermsAndConditions from "@/app/components/festivals/terms";
import PausedAccountTermsMessage from "@/app/components/festivals/paused-account-terms-message";
import {
  fetchFestivalSectors,
  fetchFestivalSectorsWithAllowedCategories,
} from "@/app/lib/festival_sectors/actions";
import { getPublishedFestivalTermsForPage } from "@/app/lib/festival-terms/actions";
import {
  FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE,
  isFestivalParticipantTermsEnabled,
} from "@/app/lib/festivals/participant-terms";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";
import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { HeartCrackIcon } from "lucide-react";
import { notFound } from "next/navigation";

type TermsPageProps = {
  profileId: number;
  festivalId: number;
};
export default async function TermsPage(props: TermsPageProps) {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, props.profileId, {
    allowedStatuses: [...PARTICIPANT_READ_ONLY_ROUTE_STATUSES],
  });
  const festival = await fetchFestivalWithDates(props.festivalId);
  const festivalSectors = await fetchFestivalSectors(props.festivalId);
  if (!festival) notFound();

  const canViewParticipantTerms =
    currentProfile?.role === "admin" ||
    (isFestivalParticipantTermsEnabled(festival) &&
      (festival.status === "active" || festival.status === "published"));

  if (!canViewParticipantTerms) {
    return (
      <div className="flex flex-col items-center justify-center my-8 text-muted-foreground gap-2 px-4 text-center">
        <HeartCrackIcon className="h-12 w-12" />
        <p>
          {isFestivalParticipantTermsEnabled(festival)
            ? "El festival aún no tiene las reservas activas"
            : FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE}
        </p>
      </div>
    );
  }

  const canAcceptTerms =
    festival.status === "active" && isFestivalParticipantTermsEnabled(festival);

  const forProfile = await fetchUserProfileById(props.profileId);
  if (!forProfile) notFound();

  if (forProfile.status === "paused") {
    return <PausedAccountTermsMessage />;
  }

  const hasSubcategories =
    forProfile.profileSubcategories &&
    forProfile.profileSubcategories.length > 0;
  if (!hasSubcategories) notFound();

  const festivalSectorsWithAllowedCategoriesPromise =
    fetchFestivalSectorsWithAllowedCategories(festival.id);
  const termsVersion = await getPublishedFestivalTermsForPage();

  return (
    <TermsAndConditions
      currentUser={currentProfile!}
      forProfile={forProfile}
      festival={festival}
      festivalSectors={festivalSectors}
      category={forProfile.category as Exclude<UserCategory, "none">}
      festivalSectorsWithAllowedCategoriesPromise={
        festivalSectorsWithAllowedCategoriesPromise
      }
      termsVersion={termsVersion}
      canAcceptTerms={canAcceptTerms}
    />
  );
}

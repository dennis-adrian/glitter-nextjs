import { fetchUserProfileById } from "@/app/api/users/actions";
import SectorSelectionClient from "@/app/components/festivals/reservations/sector-selection-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getSelfServicePageDenial } from "@/app/lib/reservations/entry";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type SectorSelectionPageProps = {
  profileId: number;
  festivalId: number;
};

export default async function SectorSelectionPage(
  props: SectorSelectionPageProps,
) {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, props.profileId);

  const festival = await fetchBaseFestival(props.festivalId);
  if (!festival) notFound();

  const forProfile = await fetchUserProfileById(props.profileId);
  if (!forProfile) notFound();

  const denial = await getSelfServicePageDenial({
    actor: currentProfile
      ? { id: currentProfile.id, role: currentProfile.role }
      : null,
    targetProfile: forProfile,
    festival,
  });
  if (denial?.code === "TERMS_STALE") {
    return <TermsReacceptanceRequired festivalId={festival.id} />;
  }
  if (denial) {
    return (
      <ReservationNotAllowed
        festival={festival}
        policyCode={denial.code}
        sanctionBlock={denial.sanctionBlock}
      />
    );
  }

  const subcategoryIds = forProfile.profileSubcategories.map(
    (ps) => ps.subcategoryId,
  );
  const fetchedSectors = await fetchFestivalSectorsByUserCategory(
    festival.id,
    forProfile.category,
    subcategoryIds,
    forProfile.participationType,
  );
  const sectors =
    currentProfile?.role === "admin"
      ? fetchedSectors
      : stripHiddenReservationsFromSectors(fetchedSectors);

  return (
    <SectorSelectionClient
      profileId={props.profileId}
      festivalId={props.festivalId}
      sectors={sectors}
      generalMapUrl={festival.generalMapUrl}
      profileCategory={forProfile.category}
      subcategoryIds={subcategoryIds}
      participationType={forProfile.participationType}
    />
  );
}

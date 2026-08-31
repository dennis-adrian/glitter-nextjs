import MapTabsClient from "@/app/components/festivals/reservations/map-tabs-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import { getSelfServicePageDenial } from "@/app/lib/reservations/entry";
import {
  fetchFestivalReservationMapDto,
  fetchSelfServiceFestivalSnapshot,
  fetchSelfServiceTargetProfile,
} from "@/app/lib/reservations/map-queries";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type MapReservationPageProps = {
  profileId: number;
  festivalId: number;
};

export default async function MapReservationPage(
  props: MapReservationPageProps,
) {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, props.profileId);

  const [festival, forProfile] = await Promise.all([
    fetchSelfServiceFestivalSnapshot(props.festivalId),
    fetchSelfServiceTargetProfile(props.profileId, props.festivalId),
  ]);
  if (!festival || !forProfile) notFound();

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

  const map = await fetchFestivalReservationMapDto({
    festivalId: festival.id,
    profileId: forProfile.id,
    revealHiddenIdentities: canViewAdminReservationData(
      currentProfile
        ? { id: currentProfile.id, role: currentProfile.role }
        : null,
    ),
  });
  if (!map) notFound();

  return <MapTabsClient map={map} />;
}

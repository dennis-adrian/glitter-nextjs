import FullTableSummaryNotice from "@/app/components/festivals/reservations/full-table-summary-notice";
import HoldConfirmationClient from "@/app/components/festivals/reservations/hold-confirmation-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import { getSelfServicePageDenial } from "@/app/lib/reservations/entry";
import {
  fetchFestivalReservationConfirmationDto,
  fetchSelfServiceFestivalSnapshot,
  fetchSelfServiceTargetProfile,
} from "@/app/lib/reservations/map-queries";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound, redirect } from "next/navigation";

type HoldConfirmationPageProps = {
  profileId: number;
  festivalId: number;
  sectorId: number;
  holdId: number;
};

export default async function HoldConfirmationPage(
  props: HoldConfirmationPageProps,
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

  const confirmation = await fetchFestivalReservationConfirmationDto({
    festivalId: props.festivalId,
    profileId: props.profileId,
    holdId: props.holdId,
  });

  if (!confirmation) {
    redirect(
      `/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new`,
    );
  }

  if (confirmation.sector.id !== props.sectorId) {
    redirect(
      `/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new/sectors/${confirmation.sector.id}`,
    );
  }

  return (
    <div className="container p-3 md:p-6">
      <FullTableSummaryNotice fullTable={confirmation.fullTable} />
      <HoldConfirmationClient
        recentPartners={confirmation.recentPartners}
        hold={confirmation.hold}
        stand={confirmation.stand}
        sectorName={confirmation.sector.name}
        sectorStands={confirmation.sector.thumbnailStands}
        mapBounds={confirmation.sector.mapBounds}
        festival={confirmation.festival}
        profile={confirmation.profile}
        sectorId={confirmation.sector.id}
      />
    </div>
  );
}

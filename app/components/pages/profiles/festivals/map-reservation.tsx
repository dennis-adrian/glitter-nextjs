import FullTablePanel from "@/app/components/festivals/reservations/full-table-panel";
import MapTabsClient from "@/app/components/festivals/reservations/map-tabs-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import {
  getSelfServiceDenialAtOpen,
  getSelfServicePageDenial,
} from "@/app/lib/reservations/entry";
import {
  fetchFestivalReservationMapDto,
  fetchSelfServiceFestivalSnapshot,
  fetchSelfServiceTargetProfile,
} from "@/app/lib/reservations/map-queries";
import { fetchFullTableOffer } from "@/app/lib/reservations/full-table-queries";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type MapReservationPageProps = {
  profileId: number;
  festivalId: number;
};

/**
 * The full-table offer for someone the clock alone is holding back, or null
 * when a second rule blocks them too.
 */
async function preOpenFullTableOffer(input: {
  actor: { id: number; role: string } | null;
  profile: { id: number; category: string };
  festivalId: number;
}) {
  // Same rule as the open map below: the panel's actions resolve the actor from
  // the session, so showing it to an admin viewing someone else's countdown
  // would put that participant's balance over a button spending the admin's own
  // credits.
  if (input.actor?.id !== input.profile.id) return null;

  const remaining = await getSelfServiceDenialAtOpen({
    actor: input.actor,
    profileId: input.profile.id,
    festivalId: input.festivalId,
  });
  if (remaining) return null;

  const [fullTableOffer, creditsEnabled] = await Promise.all([
    fetchFullTableOffer({
      userId: input.profile.id,
      festivalId: input.festivalId,
      category: input.profile.category,
    }),
    isFeatureEnabled("credits"),
  ]);
  return { fullTableOffer, creditsEnabled };
}

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
  // The days between the terms shipping and the map opening are exactly when
  // participants are meant to settle the money question, and this countdown is
  // the page they land on. The offer rides along beneath it (PRD §7.2) —
  // `activateFullTableAccess` has no window of its own, so nothing else has to
  // move. Only the clock may be lifted: `getSelfServiceDenialAtOpen` re-runs
  // every other rule at the opening instant, because RESERVATIONS_NOT_OPEN is
  // evaluated first and would otherwise hide an unenrolled participant.
  if (denial?.code === "RESERVATIONS_NOT_OPEN") {
    const offer = await preOpenFullTableOffer({
      actor: currentProfile
        ? { id: currentProfile.id, role: currentProfile.role }
        : null,
      profile: forProfile,
      festivalId: festival.id,
    });

    return (
      <>
        <ReservationNotAllowed festival={festival} policyCode={denial.code} />
        {offer ? (
          <div className="container p-4 pt-0 md:p-6 md:pt-0">
            <div className="mx-auto max-w-[600px]">
              <FullTablePanel
                offer={offer.fullTableOffer}
                festivalId={festival.id}
                creditsEnabled={offer.creditsEnabled}
              />
            </div>
          </div>
        ) : null}
      </>
    );
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

  // The full-table decision happens here, before the map: the map is for
  // choosing a space, never for financial setup (PRD §7.2).
  // Only for the participant themselves. Its actions resolve the actor from
  // the session, so an admin viewing someone else's map would be shown that
  // participant's balance while spending their own credits.
  const viewingOwnMap = currentProfile?.id === forProfile.id;
  const [fullTableOffer, creditsEnabled] = await Promise.all([
    viewingOwnMap
      ? fetchFullTableOffer({
          userId: forProfile.id,
          festivalId: festival.id,
          category: forProfile.category,
        })
      : null,
    isFeatureEnabled("credits"),
  ]);

  return (
    <>
      {fullTableOffer && (
        <FullTablePanel
          offer={fullTableOffer}
          festivalId={festival.id}
          creditsEnabled={creditsEnabled}
        />
      )}
      <MapTabsClient map={map} />
    </>
  );
}

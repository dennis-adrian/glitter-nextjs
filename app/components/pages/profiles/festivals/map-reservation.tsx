import FullTablePanel from "@/app/components/festivals/reservations/full-table-panel";
import MapTabsClient from "@/app/components/festivals/reservations/map-tabs-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import { getSelfServicePageDenial } from "@/app/lib/reservations/entry";
import {
  fetchFestivalReservationMapDto,
  fetchSelfServiceFestivalSnapshot,
  fetchSelfServiceTargetProfile,
} from "@/app/lib/reservations/map-queries";
import { fetchFullTableOffer } from "@/app/lib/reservations/full-table-queries";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentBaseProfile, protectRoute } from "@/app/lib/users/helpers";
import { started } from "@/app/lib/started";
import { notFound } from "next/navigation";

type MapReservationPageProps = {
  profileId: number;
  festivalId: number;
};

export default async function MapReservationPage(
  props: MapReservationPageProps,
) {
  // Keyed on the route's ids, a row each: started before the session check so
  // they overlap it. A visitor the check redirects costs two tiny queries.
  const festivalPromise = started(
    fetchSelfServiceFestivalSnapshot(props.festivalId),
  );
  const forProfilePromise = started(
    fetchSelfServiceTargetProfile(props.profileId, props.festivalId),
  );

  const currentProfile = await getCurrentBaseProfile();
  await protectRoute(currentProfile || undefined, props.profileId);
  const actor = currentProfile
    ? { id: currentProfile.id, role: currentProfile.role }
    : null;

  const [festival, forProfile] = await Promise.all([
    festivalPromise,
    forProfilePromise,
  ]);
  if (!festival || !forProfile) notFound();

  // The full-table panel is only for the participant themselves. Its actions
  // resolve the actor from the session, so an admin viewing someone else's map
  // would be shown that participant's balance over a button spending their own
  // credits. Neither the offer nor the flag depends on the denial, so both
  // start now and are fetched once per render.
  const viewingOwnMap = currentProfile?.id === forProfile.id;
  const offerPromise = started(
    viewingOwnMap
      ? fetchFullTableOffer({
          userId: forProfile.id,
          festivalId: festival.id,
          category: forProfile.category,
        })
      : Promise.resolve(null),
  );
  const creditsEnabledPromise = started(
    isFeatureEnabled("credits", currentProfile ?? null),
  );

  const denial = await getSelfServicePageDenial({
    actor,
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
  // move. Only the clock may be lifted: the denial is evaluated again at the
  // opening instant, because RESERVATIONS_NOT_OPEN is evaluated first and
  // would otherwise hide an unenrolled participant.
  if (denial?.code === "RESERVATIONS_NOT_OPEN") {
    const remaining = viewingOwnMap
      ? await getSelfServicePageDenial({
          actor,
          targetProfile: forProfile,
          festival,
          now: festival.reservationsStartDate,
        })
      : denial;
    const [fullTableOffer, creditsEnabled] = remaining
      ? [null, false]
      : await Promise.all([offerPromise, creditsEnabledPromise]);

    return (
      <>
        {fullTableOffer ? (
          <div className="container px-4 pt-4 md:px-6 md:pt-6">
            <div className="mx-auto max-w-[600px]">
              <FullTablePanel
                offer={fullTableOffer}
                festivalId={festival.id}
                creditsEnabled={creditsEnabled}
              />
            </div>
          </div>
        ) : null}
        <ReservationNotAllowed
          festival={festival}
          policyCode={denial.code}
          serverNow={new Date().toISOString()}
        />
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

  // The full-table decision happens here, before the map: the map is for
  // choosing a space, never for financial setup (PRD §7.2). The map quotes
  // the activation price only when credits are visible to this viewer — they
  // pay for it — and the offer is already null for anyone else's map.
  const activationOfferPromise = started(
    creditsEnabledPromise.then((on) => (on ? offerPromise : null)),
  );
  const [map, fullTableOffer, creditsEnabled] = await Promise.all([
    fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: forProfile.id,
      revealHiddenIdentities: canViewAdminReservationData(actor),
      activationOffer: activationOfferPromise,
    }),
    offerPromise,
    creditsEnabledPromise,
  ]);
  if (!map) notFound();

  return (
    <>
      {/* A banner here, not the full pitch: this page is where the participant
          picks a space, and the offer has already had a screen of its own. */}
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

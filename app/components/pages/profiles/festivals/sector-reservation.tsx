import ClientMap from "@/app/components/festivals/client-map";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import FestivalSectorTitle from "@/app/components/festivals/sectors/sector-title";
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

type SectorReservationPageProps = {
  profileId: number;
  festivalId: number;
  sectorId: number;
};

export default async function SectorReservationPage(
  props: SectorReservationPageProps,
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
    actorProfileId: currentProfile?.id ?? null,
    revealHiddenIdentities: canViewAdminReservationData(
      currentProfile
        ? { id: currentProfile.id, role: currentProfile.role }
        : null,
    ),
  });
  if (!map) notFound();

  const sector = map.sectors.find((s) => s.id === props.sectorId);
  if (!sector) notFound();

  return (
    <>
      <StepIndicator
        step={2}
        totalSteps={4}
        backLabel="Cambiar sector"
        backHref={`/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new`}
      />
      <div className="max-w-3xl mx-auto px-4 py-4 md:py-6">
        <div className="flex flex-col items-center gap-2">
          <FestivalSectorTitle sector={sector} />
          <div className="w-full md:max-w-2xl mx-auto">
            <ClientMap
              festival={map.festival}
              profile={map.profile}
              sectorId={sector.id}
              sectorName={sector.name}
              stands={sector.stands}
              mapElements={sector.mapElements}
              activeHold={map.activeHold}
              alreadyReserved={map.alreadyReserved}
              subcategoryIds={map.subcategoryIds}
              fullTableAccessActive={map.fullTableAccessActive}
              fullTableActivationPrice={map.fullTableActivationPrice}
              mapBounds={sector.mapBounds ?? undefined}
            />
          </div>
          <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
            El plano muestra las ubicaciones y la distribución confirmada de los
            stands. Las medidas y proporciones de todos los elementos son
            estimadas y se utilizan de manera orientativa.
          </p>
        </div>
      </div>
    </>
  );
}

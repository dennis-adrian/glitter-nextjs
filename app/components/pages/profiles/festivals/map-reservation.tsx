import { fetchUserProfileById } from "@/app/api/users/actions";
import MapTabsClient from "@/app/components/festivals/reservations/map-tabs-client";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import TermsReacceptanceRequired from "@/app/components/festival-terms/reacceptance-required";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getSelfServicePageDenial } from "@/app/lib/reservations/entry";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { standHolds } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
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

  const activeHoldRow = await db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.userId, forProfile.id),
      eq(standHolds.festivalId, festival.id),
      gt(standHolds.expiresAt, new Date()),
    ),
    columns: { id: true, standId: true },
  });
  const activeHold = activeHoldRow
    ? { id: activeHoldRow.id, standId: activeHoldRow.standId }
    : null;

  return (
    <MapTabsClient
      festival={festival}
      profile={forProfile}
      sectors={sectors}
      activeHold={activeHold}
      subcategoryIds={subcategoryIds}
    />
  );
}

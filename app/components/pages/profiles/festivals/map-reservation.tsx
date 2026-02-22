import { fetchUserProfileById } from "@/app/api/users/actions";
import MapTabsClient from "@/app/components/festivals/reservations/map-tabs-client";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { standHolds } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { DateTime } from "luxon";
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

	const reservationStartDate = DateTime.fromJSDate(
		festival.reservationsStartDate,
	);
	const currentTime = DateTime.now();
	if (currentTime < reservationStartDate && currentProfile?.role !== "admin") {
		return <ReservationNotAllowed festival={festival} />;
	}

	const forProfile = await fetchUserProfileById(props.profileId);
	if (!forProfile) notFound();

	const inFestival = isProfileInFestival(festival.id, forProfile);
	if (!inFestival) {
		return (
			<div className="text-muted-foreground flex pt-8 justify-center">
				No estás habilitado para participar en este evento
			</div>
		);
	}

	const subcategoryIds = forProfile.profileSubcategories.map(
		(ps) => ps.subcategoryId,
	);
	const sectors = await fetchFestivalSectorsByUserCategory(
		festival.id,
		forProfile.category,
		subcategoryIds,
		forProfile.participationType,
	);

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

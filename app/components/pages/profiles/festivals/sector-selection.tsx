import { fetchUserProfileById } from "@/app/api/users/actions";
import SectorSelectionClient from "@/app/components/festivals/reservations/sector-selection-client";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import ReservationNotAllowed from "@/app/components/pages/profiles/festivals/reservation-not-allowed";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { formatDate } from "@/app/lib/formatters";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
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

	const reservationStartDate = formatDate(
		festival.reservationsStartDate,
	).toJSDate();
	const currentTime = DateTime.now().toJSDate();
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
	);

	return (
		<SectorSelectionClient
			profileId={props.profileId}
			festivalId={props.festivalId}
			sectors={sectors}
			generalMapUrl={festival.generalMapUrl}
			profileCategory={forProfile.category}
			subcategoryIds={subcategoryIds}
		/>
	);
}

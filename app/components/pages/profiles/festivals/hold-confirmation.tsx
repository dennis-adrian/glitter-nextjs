import { fetchUserProfileById } from "@/app/api/users/actions";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import HoldConfirmationClient from "@/app/components/festivals/reservations/hold-confirmation-client";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";
import { fetchSectorWithStandsAndReservations } from "@/app/lib/festival_sectors/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { fetchFestivalParticipants } from "@/app/lib/festivals/actions";
import { fetchHoldWithStand } from "@/app/lib/stands/hold-actions";
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

	const festival = await fetchBaseFestival(props.festivalId);
	if (!festival) notFound();

	const forProfile = await fetchUserProfileById(props.profileId);
	if (!forProfile) notFound();

	// Fetch and validate the hold
	const hold = await fetchHoldWithStand(
		props.holdId,
		props.profileId,
		props.festivalId,
	);

	if (!hold) {
		redirect(
			`/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new/sectors/${props.sectorId}`,
		);
	}

	// Check if hold is expired
	if (new Date() >= hold.expiresAt) {
		redirect(
			`/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new/sectors/${props.sectorId}`,
		);
	}

	if (hold.stand.festivalSectorId === null) {
		notFound();
	}

	if (hold.stand.festivalSectorId !== props.sectorId) {
		redirect(
			`/profiles/${props.profileId}/festivals/${props.festivalId}/reservations/new/sectors/${hold.stand.festivalSectorId}`,
		);
	}

	// Fetch sector for name + stands for thumbnail
	const sector = await fetchSectorWithStandsAndReservations(props.sectorId);

	const sectorStands = (sector?.stands ?? []).map((s) => ({
		id: s.id,
		status: s.status,
		positionLeft: s.positionLeft,
		positionTop: s.positionTop,
		label: s.label,
		standNumber: s.standNumber,
	}));

	const mapBounds =
		sector?.mapOriginX != null &&
		sector?.mapOriginY != null &&
		sector?.mapWidth != null &&
		sector?.mapHeight != null
			? {
					minX: sector.mapOriginX,
					minY: sector.mapOriginY,
					width: sector.mapWidth,
					height: sector.mapHeight,
				}
			: computeCanvasBounds(sector?.stands ?? []);

	// Fetch potential partners for illustration/new_artist categories
	let partnerOptions: {
		label: string;
		value: string;
		imageUrl?: string | null;
	}[] = [];
	if (
		forProfile.category === "illustration" ||
		forProfile.category === "new_artist"
	) {
		const participants = await fetchFestivalParticipants(props.festivalId);
		const eligiblePartners = participants
			.filter((p) => {
				const user = p.user;
				// A participant with a non-rejected reservation already has a stand
				const hasReservation =
					p.reservation && p.reservation.status !== "rejected";
				return (
					user.id !== forProfile.id &&
					(user.category === "illustration" ||
						user.category === "new_artist") &&
					!hasReservation
				);
			})
			.map((p) => p.user);

		partnerOptions = getParticipantsOptions(eligiblePartners);
	}

	return (
		<HoldConfirmationClient
			hold={{
				id: hold.id,
				expiresAt: hold.expiresAt.toISOString(),
			}}
			stand={{
				id: hold.stand.id,
				label: hold.stand.label,
				standNumber: hold.stand.standNumber,
				standCategory: hold.stand.standCategory,
				price: hold.stand.price,
			}}
			sectorName={sector?.name ?? ""}
			sectorStands={sectorStands}
			mapBounds={mapBounds}
			festival={{
				id: festival.id,
				name: festival.name,
			}}
			profile={{
				id: forProfile.id,
				displayName: forProfile.displayName,
				category: forProfile.category,
				imageUrl: forProfile.imageUrl,
			}}
			sectorId={props.sectorId}
			partnerOptions={partnerOptions}
		/>
	);
}

import { fetchStandById } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { ReserveStandCard } from "@/app/components/user_profile/announcements_cards/reserve-stand-card";
import { ReservedStandCard } from "@/app/components/user_profile/announcements_cards/reserved-stand-card";
import { TermsCard } from "@/app/components/user_profile/announcements_cards/terms-card";
import { isProfileComplete } from "@/app/lib/utils";
import PendingVerificationCard from "./pending-verification-card";
import RejectedProfileCard from "./rejected-profile.card";
import { fetchFestival } from "@/app/lib/festivals/actions";

export default async function Card({ profile }: { profile: ProfileType }) {
	if (!profile || profile?.role === "admin") return null;

	if (profile.status === "rejected") {
		return <RejectedProfileCard />;
	}

	if (profile.status !== "verified") {
		if (isProfileComplete(profile)) {
			return <PendingVerificationCard />;
		}
	}

	const festival = await fetchFestival({});
	if (!festival) return null;

	if (isProfileInFestival(festival.id, profile)) {
		const currentFestivalResevation = profile.participations.find(
			(participation) => {
				return participation.reservation.festivalId === festival.id;
			},
		);

		if (currentFestivalResevation) {
			const reservationStatus = currentFestivalResevation.reservation.status;
			if (reservationStatus === "rejected") return null;

			const standId = currentFestivalResevation.reservation.standId;
			const stand = await fetchStandById(standId);
			if (stand) {
				return (
					<ReservedStandCard
						profile={profile}
						festival={festival}
						stand={stand}
						reservationStatus={reservationStatus}
					/>
				);
			}
		}

		return <ReserveStandCard festival={festival} profile={profile} />;
	} else {
		return <TermsCard festival={festival} profile={profile} />;
	}
}

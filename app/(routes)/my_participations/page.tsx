import { fetchValidReservationsByFestival } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";
import { UpcomingFestivalCard } from "@/app/components/organisms/upcoming-festival";
import { RedirectButton } from "@/app/components/redirect-button";
import { profileHasReservationMade } from "@/app/helpers/next_event";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { ExternalLinkIcon } from "lucide-react";
import { notFound } from "next/navigation";

export default async function Page() {
	const activeFestival = await getActiveFestival();
	const currentProfile = await getCurrentUserProfile();
	let validReservations: ReservationWithParticipantsAndUsersAndStandAndCollaborators[] =
		[];

	if (!currentProfile) {
		notFound();
	}

	let isProfileInActiveFestival = false;

	if (activeFestival) {
		isProfileInActiveFestival = profileHasReservationMade(
			currentProfile,
			activeFestival.id,
		);
		validReservations = await fetchValidReservationsByFestival(
			activeFestival.id,
		);
	}

	const confirmedReservationInActiveFestival = validReservations.find(
		(reservation) =>
			reservation.participants.some(
				(participant) => participant.user.id === currentProfile.id,
			),
	);

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-xl md:text-3xl font-bold">Participación activa</h1>
			<div className="my-2 md:my-4 w-full">
				{isProfileInActiveFestival && activeFestival ? (
					<div className="flex flex-col gap-2">
						{currentProfile.shouldSubmitProducts && (
							<div className=" flex flex-col gap-1 items-center bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm p-3">
								<p>
									Subí imágenes de lo que ofrecerás en el festival presionando
									el botón a continuación
								</p>
								<RedirectButton
									href="/my_participations/submit_products"
									className="text-current hover:text-current"
									variant="link"
								>
									Subir imágenes
									<ExternalLinkIcon className="w-4 h-4 ml-2" />
								</RedirectButton>
							</div>
						)}
						<UpcomingFestivalCard
							festival={activeFestival}
							profile={currentProfile}
							reservation={confirmedReservationInActiveFestival}
						/>
					</div>
				) : (
					<div className="md:text-center p-6 bg-gray-100 rounded-lg">
						<p className="text-gray-500 text-sm md:text-base">
							No tienes ninguna participación confirmada en el festival actual.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

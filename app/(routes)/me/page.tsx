import { redirect } from "next/navigation";

import FestivalCarousel from "@/app/components/participant_dashboard/festival-carousel";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import PendingTasksList from "@/app/components/participant_dashboard/pending-tasks";
import QuickActions from "@/app/components/participant_dashboard/quick-actions";
import ReservationCard from "@/app/components/participant_dashboard/reservation-card";
import StatsStrip from "@/app/components/participant_dashboard/stats-strip";
import UpcomingFestivalsSection from "@/app/components/participant_dashboard/upcoming-festivals";
import {
	fetchCarouselFestivals,
	fetchFestivalActivitiesByFestivalId,
} from "@/app/lib/festivals/actions";
import { FestivalActivity } from "@/app/lib/festivals/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function ParticipantDashboardPage() {
	const [currentProfile, carouselFestivals] = await Promise.all([
		getCurrentUserProfile(),
		fetchCarouselFestivals(),
	]);

	if (!currentProfile) {
		redirect("/");
	}

	const activeFestival =
		carouselFestivals.find((f) => f.status === "active") ?? null;

	const activeParticipation = activeFestival
		? (currentProfile.participations.find(
				(p) =>
					p.reservation.festivalId === activeFestival.id &&
					p.reservation.status !== "rejected",
			) ?? null)
		: null;

	let festivalActivities: FestivalActivity[] = [];
	if (
		activeFestival &&
		activeParticipation?.reservation.status === "accepted"
	) {
		festivalActivities = await fetchFestivalActivitiesByFestivalId(
			activeFestival.id,
		);
	}

	return (
		<div className="container p-3 md:p-6">
			{/* Greeting — always visible, above the carousel */}
			<div className="">
				<h1 className="font-bold tracking-tight text-2xl md:text-3xl">
					¡Hola,{" "}
					{currentProfile.firstName ?? currentProfile.displayName ?? "artista"}!
				</h1>
				<p className="text-sm text-muted-foreground">
					Bienvenida a tu espacio en Glitter.
				</p>
			</div>

			{carouselFestivals.length > 0 && (
				<div className="w-full ">
					<FestivalCarousel
						festivals={carouselFestivals}
						profile={currentProfile}
						activeParticipation={activeParticipation}
					/>
				</div>
			)}

			<div className="flex flex-col gap-6 mt-4">
				<StatsStrip profile={currentProfile} />

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
					{/* Left column: primary / action */}
					<div className="flex flex-col gap-6">
						<ReservationCard
							profile={currentProfile}
							activeFestival={activeFestival}
							activeParticipation={activeParticipation}
						/>

						<PendingTasksList
							profile={currentProfile}
							activeFestival={activeFestival}
							activeParticipation={activeParticipation}
							festivalActivities={festivalActivities}
						/>
					</div>

					{/* Right column: secondary / discovery */}
					<div className="flex flex-col gap-6">
						<UpcomingFestivalsSection
							festivals={carouselFestivals}
							activeFestivalId={activeFestival?.id ?? null}
						/>

						<ParticipationHistoryPreview profile={currentProfile} />

						<QuickActions profile={currentProfile} />
					</div>
				</div>
			</div>
		</div>
	);
}

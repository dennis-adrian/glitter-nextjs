import { CakeIcon, CogIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import FestivalCarousel from "@/app/components/participant_dashboard/festival-carousel";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import PendingTasksList from "@/app/components/participant_dashboard/pending-tasks";
import QuickActions from "@/app/components/participant_dashboard/quick-actions";
import ReservationCard from "@/app/components/participant_dashboard/reservation-card";
import StatsStrip from "@/app/components/participant_dashboard/stats-strip";
import UpcomingFestivalsSection from "@/app/components/participant_dashboard/upcoming-festivals";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	fetchCarouselFestivals,
	fetchFestivalActivitiesByFestivalId,
} from "@/app/lib/festivals/actions";
import { FestivalActivity } from "@/app/lib/festivals/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";

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
			{/* Header — always visible, above the carousel */}
			<div>
				<div className="flex items-start justify-between">
					<div>
						<VerificationStatusLabel status={currentProfile.status} />
						<h1 className="font-bold tracking-tight text-3xl md:text-5xl">
							Hola,{" "}
							{currentProfile.firstName ??
								currentProfile.displayName ??
								"artista"}
						</h1>
						{currentProfile.verifiedAt && (
							<p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
								<CakeIcon className="size-4" />
								Te uniste en{" "}
								{DateTime.fromJSDate(currentProfile.verifiedAt).year}
							</p>
						)}
					</div>
					<Button variant="outline" size="sm" className="flex shrink-0" asChild>
						<Link href="/my_profile">
							<CogIcon className="size-4 mr-1" />
							Editar perfil
						</Link>
					</Button>
				</div>
				<Separator className="mt-4" />
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

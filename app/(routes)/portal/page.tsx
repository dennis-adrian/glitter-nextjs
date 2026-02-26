import { CakeIcon, CogIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { redirect } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";
import FestivalCarousel from "@/app/components/participant_dashboard/festival-carousel";
import ReservationCard from "@/app/components/participant_dashboard/reservation-card";
import RestrictedDashboard from "@/app/components/participant_dashboard/restricted-dashboard";
import {
	fetchCarouselFestivals,
	fetchProfileEnrollmentInFestival,
} from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";

export default async function ParticipantDashboardPage() {
	const currentProfile = await getCurrentUserProfile();

	if (!currentProfile) {
		redirect("/");
	}

	if (currentProfile.status !== "verified") {
		return (
			<RestrictedDashboard
				profile={currentProfile}
				status={currentProfile.status}
			/>
		);
	}

	const carouselFestivals = await fetchCarouselFestivals();

	const activeFestival =
		carouselFestivals.find((f) => f.status === "active") ?? null;

	const activeParticipation = activeFestival
		? (currentProfile.participations.find(
				(p) =>
					p.reservation.festivalId === activeFestival.id &&
					p.reservation.status !== "rejected",
			) ?? null)
		: null;

	const profileEnrollment = await fetchProfileEnrollmentInFestival(
		currentProfile.id,
		activeFestival?.id ?? 0,
	);

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
							Configuración
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
						enrollment={profileEnrollment}
					/>
				</div>
			)}

			<div className="flex flex-col gap-6 mt-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
					{profileEnrollment && activeFestival && (
						<div className="flex flex-col gap-2 md:gap-3">
							<Heading level={2}>Mi participación</Heading>
							<ReservationCard
								profile={currentProfile}
								activeFestival={activeFestival}
								activeParticipation={activeParticipation}
								profileEnrollment={profileEnrollment}
							/>
						</div>
					)}

					<div className="flex flex-col gap-6">
						<ParticipationHistoryPreview
							profile={currentProfile}
							activeFestivalId={activeFestival?.id}
						/>

						{/* <QuickActions profile={currentProfile} /> */}
					</div>
				</div>
			</div>
		</div>
	);
}

import { CakeIcon, CogIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import Heading from "@/app/components/atoms/heading";
import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";
import {
	PortalBanners,
	PortalBannersSkeleton,
} from "@/app/components/marketing/portal-banners";
import FestivalActivities from "@/app/components/participant_dashboard/festival-activities";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import ReservationCard from "@/app/components/participant_dashboard/reservation-card";
import RestrictedDashboard from "@/app/components/participant_dashboard/restricted-dashboard";
import { fetchOutstandingInvoiceCountByProfileAndFestival } from "@/app/data/invoices/actions";
import {
	fetchProfileEnrollmentInFestival,
	fetchPublishedActiveFestivals,
} from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

	const carouselFestivals = await fetchPublishedActiveFestivals();

	const activeFestival =
		carouselFestivals.find((f) => f.status === "active") ?? null;

	const participationsInActiveFestival = activeFestival
		? currentProfile.participations.filter(
				(p) => p.reservation.festivalId === activeFestival.id,
			)
		: [];

	const activeParticipations = participationsInActiveFestival.filter(
		(p) => p.reservation.status !== "rejected",
	);

	let profileEnrollment = activeFestival
		? ((await fetchProfileEnrollmentInFestival(
				currentProfile.id,
				activeFestival.id,
			)) ?? null)
		: null;
	if (activeFestival && !profileEnrollment) {
		profileEnrollment =
			currentProfile.userRequests.find(
				(r) =>
					r.type === "festival_participation" &&
					r.festivalId === activeFestival.id,
			) ?? null;
	}

	const allReservationsRejected =
		participationsInActiveFestival.length > 0 &&
		activeParticipations.length === 0;
	const rejectedEnrollment = profileEnrollment?.status === "rejected";
	const showMiParticipacionBlock =
		!!activeFestival &&
		!!(profileEnrollment || activeParticipations.length > 0) &&
		!allReservationsRejected &&
		!rejectedEnrollment;

	const invoiceCounts =
		activeFestival && activeParticipations.length > 0
			? await fetchOutstandingInvoiceCountByProfileAndFestival(
					currentProfile.id,
					activeFestival.id,
				)
			: { reservationCount: 0, outstandingInvoiceCount: 0 };

	const hasAcceptedReservation = activeParticipations.some(
		(p) => p.reservation.status === "accepted",
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

			<Suspense fallback={<PortalBannersSkeleton />}>
				<PortalBanners />
			</Suspense>

			<div className="flex flex-col gap-6 mt-4">
				{showMiParticipacionBlock && (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
							<div className="flex flex-col gap-2 md:gap-3">
								<Heading level={2}>Mi participación</Heading>
								<ReservationCard
									profile={currentProfile}
									activeFestival={activeFestival}
									activeParticipations={activeParticipations}
									profileEnrollment={profileEnrollment}
									outstandingInvoiceCount={
										invoiceCounts.outstandingInvoiceCount
									}
									reservationCount={invoiceCounts.reservationCount}
								/>
							</div>
						</div>

						{hasAcceptedReservation && (
							<FestivalActivities
								festivalId={activeFestival.id}
								forProfile={currentProfile}
							/>
						)}
					</>
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
	);
}

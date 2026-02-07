import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { Suspense } from "react";
import AnnouncementsBanner from "@/app/components/participant-dashboard/sections/announcements-banner";
import FestivalStatusSection from "@/app/components/participant-dashboard/sections/festival-status-section";
import TasksSection from "@/app/components/participant-dashboard/sections/tasks-section";
import ProfileOverviewSection from "@/app/components/participant-dashboard/sections/profile-overview-section";
import StoreShowcaseSection from "@/app/components/participant-dashboard/sections/store-showcase-section";
import HistorySection from "@/app/components/participant-dashboard/sections/history-section";
import InfractionsSection from "@/app/components/participant-dashboard/sections/infractions-section";
import SectionSkeleton from "@/app/components/participant-dashboard/skeletons/section-skeleton";

export default async function ParticipantDashboard() {
	const profile = await getCurrentUserProfile();
	const activeFestival = await getActiveFestival();

	if (!profile) return null;

	const today = formatDate(new Date().toISOString()).toLocaleString(
		DateTime.DATE_FULL,
	);

	return (
		<div className="container p-3 md:p-6 space-y-6">
			{/* Welcome Header */}
			<div>
				<h1 className="text-xl md:text-3xl font-bold">
					Hola, {profile.displayName || profile.firstName || "participante"}
				</h1>
				<p className="text-sm text-muted-foreground">{today}</p>
			</div>

			<AnnouncementsBanner />

			<Suspense fallback={<SectionSkeleton lines={3} />}>
				<FestivalStatusSection
					profile={profile}
					festival={activeFestival}
				/>
			</Suspense>

			<Suspense fallback={<SectionSkeleton lines={2} />}>
				<TasksSection profile={profile} festival={activeFestival} />
			</Suspense>

			<ProfileOverviewSection profile={profile} />

			{profile.status === "verified" && (
				<Suspense fallback={<SectionSkeleton lines={2} />}>
					<StoreShowcaseSection />
				</Suspense>
			)}

			<HistorySection profile={profile} activeFestival={activeFestival} />

			<Suspense fallback={<SectionSkeleton lines={2} />}>
				<InfractionsSection profile={profile} />
			</Suspense>
		</div>
	);
}

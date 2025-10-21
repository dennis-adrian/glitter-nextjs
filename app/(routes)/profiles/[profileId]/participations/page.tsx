import Title from "@/app/components/atoms/title";
import UserParticipationCard from "@/app/components/molecules/user-participation-card";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import { formatDate } from "@/app/lib/formatters";
import { fetchUserParticipations } from "@/app/lib/users/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { CalendarIcon, LandPlotIcon, PackageOpenIcon } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";

export default async function ParticipationsPage() {
	const currentProfile = await getCurrentUserProfile();
	await protectRoute(currentProfile || undefined, currentProfile?.id);

	if (!currentProfile) {
		notFound();
	}

	const participations = await fetchUserParticipations(currentProfile.id);

	return (
		<div className="container p-3 md:p-6">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/my_history">Mi historial</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Participaciones</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			{!!participations.length ? (
				<>
					<Title level="h1">Participaciones</Title>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
						{participations.map((participation) => (
							<UserParticipationCard
								key={participation.id}
								participation={participation}
							/>
						))}
					</div>
				</>
			) : (
				<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground mt-10">
					<PackageOpenIcon className="w-16 h-16" />
					<span>Aún no hay participaciones</span>
				</div>
			)}
		</div>
	);
}

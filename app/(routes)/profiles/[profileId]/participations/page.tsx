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
					<h1 className="text-lg md:text-2xl font-bold my-3">
						Participaciones
					</h1>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{participations.map((participation) => {
							const initialDate =
								participation.reservation.festival.festivalDates?.[0];
							const finalDate =
								participation.reservation.festival.festivalDates?.[
									participation.reservation.festival.festivalDates.length - 1
								];

							const startDate = formatDate(
								initialDate?.startDate!,
							).toLocaleString({
								day: "numeric",
								month: "short",
							});
							const endDate = formatDate(finalDate?.endDate!).toLocaleString({
								day: "numeric",
								month: "short",
							});

							return (
								<div
									key={participation.id}
									className="bg-card p-3 rounded-md shadow-md border flex gap-3 items-center"
								>
									<div className="relative w-12 h-12 md:w-16 md:h-16 aspect-square rounded-full">
										<Image
											src={
												participation.reservation.festival.festivalBannerUrl ||
												"/img/placeholders/placeholder-300x300.png"
											}
											alt={participation.reservation.festival.name}
											className="object-cover rounded-full"
											fill
											blurDataURL="/img/placeholders/placeholder-300x300.png"
											placeholder="blur"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<p className="text-sm md:text-base font-medium leading-tight">
											{participation.reservation.festival.name}
										</p>
										<p className="text-xs md:text-sm leading-tight text-muted-foreground flex items-center gap-1">
											<CalendarIcon className="w-4 h-4" />
											<span>
												{startDate} - {endDate}
											</span>
										</p>
										<p className="text-xs md:text-sm leading-tight text-muted-foreground flex items-center gap-1">
											<LandPlotIcon className="w-4 h-4" />
											<span>
												Espacio {participation.reservation.stand.label}
												{participation.reservation.stand.standNumber}
											</span>
										</p>
									</div>
								</div>
							);
						})}
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

import { Participation } from "@/app/api/users/definitions";
import { formatDate } from "@/app/lib/formatters";
import { CalendarIcon, LandPlotIcon } from "lucide-react";
import Image from "next/image";

export default function UserParticipationCard({
	participation,
}: {
	participation: Participation;
}) {
	const { festivalDates } = participation.reservation.festival;
	const initialDate = festivalDates?.[0];
	const finalDate = festivalDates?.[festivalDates.length - 1];

	const startDate = festivalDates?.length
		? formatDate(initialDate?.startDate!).toLocaleString({
				day: "numeric",
				month: "short",
			})
		: null;

	const endDate =
		festivalDates?.length && festivalDates.length > 1
			? formatDate(finalDate?.endDate!).toLocaleString({
					day: "numeric",
					month: "short",
				})
			: null;

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
				{startDate && endDate && (
					<p className="text-xs md:text-sm leading-tight text-muted-foreground flex items-center gap-1">
						<CalendarIcon className="w-4 h-4" />
						<span>
							{startDate} - {endDate}
						</span>
					</p>
				)}
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
}

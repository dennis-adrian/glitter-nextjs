import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";

type Props = {
	festivals: FestivalWithDates[];
	activeFestivalId: number | null;
};

export default function UpcomingFestivalsSection({
	festivals,
	activeFestivalId,
}: Props) {
	const list = festivals.filter((f) => f.id !== activeFestivalId);

	if (list.length === 0) return null;

	return (
		<div>
			<div className="flex items-center justify-between mb-3">
				<h2 className="font-isidora font-bold italic tracking-wide text-lg">
					Próximos Festivales
				</h2>
				<Button asChild variant="ghost" size="sm" className="text-xs">
					<Link href="/festivals">Ver todos</Link>
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-3">
				{list.map((festival) => {
					const dateLabel =
						festival.festivalDates.length > 0
							? getFestivalDateLabel(festival)
							: null;
					const isOpen =
						festival.publicRegistration || festival.eventDayRegistration;

					return (
						<Card key={festival.id} className="overflow-hidden">
							<div className="h-24 bg-muted overflow-hidden">
								{festival.festivalBannerUrl ? (
									<img
										src={festival.festivalBannerUrl}
										alt=""
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full bg-primary/10" />
								)}
							</div>
							<CardContent className="p-3 flex flex-col gap-1.5">
								{festival.locationLabel && (
									<p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">
										{festival.locationLabel}
									</p>
								)}
								<p className="text-sm font-medium leading-snug line-clamp-2">
									{festival.name}
								</p>
								{dateLabel && (
									<p className="text-xs text-muted-foreground">{dateLabel}</p>
								)}
								<Badge
									size="sm"
									className={
										isOpen
											? "bg-green-100 text-green-700 border-green-200 w-fit"
											: "bg-blue-50 text-blue-600 border-blue-200 w-fit"
									}
								>
									{isOpen ? "Abierto" : "Próximamente"}
								</Badge>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}

import { CalendarIcon, ChevronRightIcon, StoreIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Participation, ProfileType } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import Image from "next/image";
import { formatDate, getFestivalDateString } from "@/app/lib/formatters";

type Props = {
	profile: ProfileType;
	activeFestivalId?: number;
};

const FESTIVAL_TYPE_STYLE: Record<string, { badge: string; border: string }> = {
	glitter: {
		badge: "bg-purple-600 text-white border-purple-200",
		border: "border-l-purple-600",
	},
	twinkler: {
		badge: "bg-pink-600 text-white border-pink-600",
		border: "border-l-pink-600",
	},
	festicker: {
		badge: "bg-rose-600 text-white border-rose-600",
		border: "border-l-rose-600",
	},
};

function getPastParticipations(
	participations: Participation[],
	activeFestivalId?: number,
) {
	const sortedParticipations = participations.sort((a, b) => {
		const aDate = new Date(a.reservation.createdAt);
		const bDate = new Date(b.reservation.createdAt);
		return bDate.getTime() - aDate.getTime();
	});

	return sortedParticipations
		.filter(
			(p) =>
				p.reservation.status === "accepted" &&
				p.reservation.festivalId !== activeFestivalId,
		)
		.slice(0, 3);
}

export default function ParticipationHistoryPreview({
	profile,
	activeFestivalId,
}: Props) {
	const past = getPastParticipations(profile.participations, activeFestivalId);

	if (past.length === 0) return null;

	return (
		<div>
			<div className="flex items-center justify-between mb-3">
				<Heading level={2}>Participaciones pasadas</Heading>
				<Button asChild variant="ghost" size="sm" className="text-xs">
					<Link href={`/profiles/${profile.id}/participations`}>
						Ver todo <ChevronRightIcon className="w-4 h-4 ml-1" />
					</Link>
				</Button>
			</div>
			<ul className="flex flex-col gap-2 md:gap-3">
				{past.map((p) => {
					const { festival, stand } = p.reservation;
					const festivalType = (festival.festivalType as string) ?? "glitter";
					const styles =
						FESTIVAL_TYPE_STYLE[festivalType] ?? FESTIVAL_TYPE_STYLE.glitter;
					const startDate = festival.festivalDates?.[0]?.startDate;
					const endDate =
						festival.festivalDates?.[festival.festivalDates.length - 1]
							?.startDate;

					return (
						<li
							key={p.id}
							className={`flex items-start border-l-4 ${styles.border} rounded-lg px-4 py-3 gap-3 bg-muted/20`}
						>
							{festival.posterUrl && (
								<div className="relative aspect-4/5 w-full max-w-32 h-auto rounded-lg">
									<Image
										src={festival.posterUrl}
										alt="poster del festival"
										fill
										className="object-cover rounded-md"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
										placeholder="blur"
									/>
								</div>
							)}
							<div>
								<Badge
									className={`text-[10px] shrink-0 uppercase font-bold mb-1 ${styles.badge}`}
								>
									{festivalType}
								</Badge>
								<h3 className="font-space-grotesk text-lg font-bold">
									{festival.name}
								</h3>
								{startDate && endDate && (
									<p className="flex text-sm text-muted-foreground mt-1">
										<CalendarIcon className="w-4 h-4 mr-1" />
										{getFestivalDateString(
											formatDate(startDate).toLocaleString({
												day: "numeric",
												month: "short",
											}),
											formatDate(endDate).toLocaleString({
												day: "numeric",
												month: "short",
												year: "numeric",
											}),
										)}
									</p>
								)}
								<p className="flex text-sm text-muted-foreground mt-1">
									<StoreIcon className="w-4 h-4 mr-1" />
									Stand {stand.label}
									{stand.standNumber}
								</p>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

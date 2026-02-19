import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Participation, ProfileType } from "@/app/api/users/definitions";

type Props = {
	profile: ProfileType;
};

const FESTIVAL_TYPE_STYLE: Record<
	string,
	{ badge: string; border: string }
> = {
	glitter: {
		badge: "bg-purple-100 text-purple-800 border-purple-200",
		border: "border-l-violet-500",
	},
	twinkler: {
		badge: "bg-pink-100 text-pink-800 border-pink-200",
		border: "border-l-pink-500",
	},
	festicker: {
		badge: "bg-rose-100 text-rose-800 border-rose-200",
		border: "border-l-rose-500",
	},
};

function getPastParticipations(participations: Participation[]) {
	return participations
		.filter((p) => p.reservation.status === "accepted")
		.slice(0, 3);
}

export default function ParticipationHistoryPreview({ profile }: Props) {
	const past = getPastParticipations(profile.participations);

	if (past.length === 0) return null;

	return (
		<div>
			<div className="flex items-center justify-between mb-3">
				<h2 className="font-isidora font-bold italic tracking-wide text-lg">
					Tu historial
				</h2>
				<Button asChild variant="ghost" size="sm" className="text-xs">
					<Link href="/my_history">
						Ver todo{" "}
						<ChevronRightIcon className="w-4 h-4 ml-1" />
					</Link>
				</Button>
			</div>
			<ul className="flex flex-col gap-2">
				{past.map((p) => {
					const { festival, stand } = p.reservation;
					const festivalType = (festival.festivalType as string) ?? "glitter";
					const styles =
						FESTIVAL_TYPE_STYLE[festivalType] ?? FESTIVAL_TYPE_STYLE.glitter;

					return (
						<li
							key={p.id}
							className={`flex items-center justify-between border-l-4 ${styles.border} rounded-lg px-4 py-3 gap-3 bg-muted/20`}
						>
							<div>
								<p className="text-sm font-medium leading-snug">
									{festival.name}
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Stand {stand.standNumber}
								</p>
							</div>
							<Badge className={`text-[10px] shrink-0 ${styles.badge}`}>
								{festivalType}
							</Badge>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

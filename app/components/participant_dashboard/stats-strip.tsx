import { Participation, ProfileType } from "@/app/api/users/definitions";

type Props = {
	profile: ProfileType;
};

function getParticipatedFestivalsCount(participations: Participation[]) {
	const accepted = participations.filter(
		(p) => p.reservation.status === "accepted",
	);
	const uniqueFestivalIds = new Set(
		accepted.map((p) => p.reservation.festivalId),
	);
	return uniqueFestivalIds.size;
}

function getYearsInGlitter(participations: Participation[]): number | null {
	if (participations.length === 0) return null;
	const years = participations.map((p) =>
		new Date(p.createdAt).getFullYear(),
	);
	const firstYear = Math.min(...years);
	const currentYear = new Date().getFullYear();
	return currentYear - firstYear;
}

export default function StatsStrip({ profile }: Props) {
	const festivalsCount = getParticipatedFestivalsCount(profile.participations);

	if (festivalsCount === 0) return null;

	const yearsInGlitter = getYearsInGlitter(profile.participations);

	const stats = [
		{
			value: festivalsCount,
			label: festivalsCount === 1 ? "festival" : "festivales",
			sub: "participaciones",
		},
		...(yearsInGlitter !== null
			? [
					{
						value: yearsInGlitter === 0 ? "1er" : yearsInGlitter,
						label: yearsInGlitter === 1 ? "año" : "años",
						sub: "en Glitter",
					},
				]
			: []),
	];

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
			{stats.map((stat, i) => (
				<div
					key={i}
					className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 rounded-xl p-4 text-center"
				>
					<p className="text-3xl md:text-4xl font-black text-primary">
						{stat.value}
					</p>
					<p className="text-xs text-muted-foreground mt-1">
						{stat.label}{" "}
						<span className="text-muted-foreground/70">{stat.sub}</span>
					</p>
				</div>
			))}
		</div>
	);
}

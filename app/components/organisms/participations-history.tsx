import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { Card, CardContent } from "@/app/components/ui/card";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { PackageOpenIcon } from "lucide-react";
import { notFound } from "next/navigation";

export default async function ParticipationsHistory({
	forProfile,
}: {
	forProfile: ProfileType;
}) {
	const activeFestival = await getActiveFestival();

	if (!activeFestival) {
		notFound();
	}

	const participations = forProfile.participations;

	if (participations.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
					<PackageOpenIcon className="w-20 h-20" />
					<span>No hay participaciones disponibles</span>
				</CardContent>
			</Card>
		);
	}

	return (
		<div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{participations.map((participation) => (
					<div key={participation.id}>
						{participation.reservation.festival.name}
					</div>
				))}
			</div>
		</div>
	);
}

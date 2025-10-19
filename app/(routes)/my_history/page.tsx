import Title from "@/app/components/atoms/title";
import ParticipationsHistory from "@/app/components/organisms/participations-history";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function MyHistoryPage() {
	const currentProfile = await getCurrentUserProfile();
	await protectRoute(currentProfile || undefined, currentProfile?.id);

	if (!currentProfile) {
		notFound();
	}

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-1 md:gap-2 mb-4">
				<Title>Mi historial</Title>
				<p className="text-muted-foreground leading-tight">
					Aquí puedes ver el historial de tus participaciones en festivales.
				</p>
			</div>
			<ParticipationsHistory forProfile={currentProfile} />
		</div>
	);
}

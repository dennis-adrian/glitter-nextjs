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
import { fetchUserParticipations } from "@/app/lib/users/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { PackageOpenIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
});

type ParticipationsPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function ParticipationsPage(
	props: ParticipationsPageProps,
) {
	const { profileId } = await props.params;
	const { success: paramValidationSuccess, data: params } =
		ParamsSchema.safeParse({
			profileId,
		});

	if (!paramValidationSuccess) notFound();

	const currentProfile = await getCurrentUserProfile();
	await protectRoute(currentProfile || undefined, params.profileId);

	if (!currentProfile) {
		notFound();
	}

	const participations = await fetchUserParticipations(params.profileId);

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

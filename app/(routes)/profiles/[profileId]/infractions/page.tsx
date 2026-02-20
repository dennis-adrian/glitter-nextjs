import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import Title from "@/app/components/atoms/heading";
import { fetchUserInfractions } from "@/app/lib/users/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PackageOpenIcon } from "lucide-react";
import UserInfractionCard from "@/app/components/molecules/user-infraction-card";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
});

type InfractionsPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function InfractionsPage(props: InfractionsPageProps) {
	const { profileId } = await props.params;
	const validatedParams = ParamsSchema.safeParse({
		profileId,
	});

	if (!validatedParams.success) {
		return notFound();
	}

	const { profileId: paramsProfileId } = validatedParams.data;

	const currentProfile = await getCurrentUserProfile();
	await protectRoute(currentProfile || undefined, paramsProfileId);

	const infractions = await fetchUserInfractions(
		validatedParams.data.profileId,
	);

	return (
		<div className="container p-3 md:p-6">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/my_history">Mi historial</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Infracciones</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			{!!infractions.length ? (
				<div className="my-3">
					<Title>Historial de Infracciones</Title>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{infractions.map((infraction) => (
							<UserInfractionCard key={infraction.id} infraction={infraction} />
						))}
					</div>
				</div>
			) : (
				<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground mt-10">
					<PackageOpenIcon className="w-16 h-16" />
					<span>No hay infracciones registradas</span>
				</div>
			)}
		</div>
	);
}

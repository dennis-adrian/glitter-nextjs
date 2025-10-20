import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import Title from "@/app/components/atoms/title";
import { fetchUserInfractions } from "@/app/lib/users/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PackageOpenIcon } from "lucide-react";

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

	console.log("infractions", infractions);

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
					<Title level="h1">Historial de Infracciones</Title>
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

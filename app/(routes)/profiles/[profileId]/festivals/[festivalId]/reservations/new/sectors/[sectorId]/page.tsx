import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	festivalId: z.coerce.number(),
	profileId: z.coerce.number(),
});

export default async function Page(props: {
	params: Promise<{
		festivalId: string;
		profileId: string;
		sectorId: string;
	}>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);
	if (!validatedParams.success) notFound();

	redirect(
		`/profiles/${validatedParams.data.profileId}/festivals/${validatedParams.data.festivalId}/reservations/new`,
	);
}

import Loader from "@/app/components/loader";
import SectorReservationPage from "@/app/components/pages/profiles/festivals/sector-reservation";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
	festivalId: z.coerce.number(),
	profileId: z.coerce.number(),
	sectorId: z.coerce.number(),
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
	console.log(validatedParams);
	if (!validatedParams.success) notFound();

	return (
		<Suspense fallback={<Loader />}>
			<SectorReservationPage
				profileId={validatedParams.data.profileId}
				festivalId={validatedParams.data.festivalId}
				sectorId={validatedParams.data.sectorId}
			/>
		</Suspense>
	);
}

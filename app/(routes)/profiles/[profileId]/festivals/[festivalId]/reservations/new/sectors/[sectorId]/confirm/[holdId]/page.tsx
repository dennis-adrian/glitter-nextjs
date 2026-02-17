import HoldConfirmationPage from "@/app/components/pages/profiles/festivals/hold-confirmation";
import HoldConfirmationSkeleton from "@/app/components/pages/profiles/festivals/hold-confirmation-skeleton";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
	festivalId: z.coerce.number(),
	profileId: z.coerce.number(),
	sectorId: z.coerce.number(),
	holdId: z.coerce.number(),
});

export default async function Page(props: {
	params: Promise<{
		festivalId: string;
		profileId: string;
		sectorId: string;
		holdId: string;
	}>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);
	if (!validatedParams.success) notFound();

	return (
		<Suspense fallback={<HoldConfirmationSkeleton />}>
			<HoldConfirmationPage
				profileId={validatedParams.data.profileId}
				festivalId={validatedParams.data.festivalId}
				sectorId={validatedParams.data.sectorId}
				holdId={validatedParams.data.holdId}
			/>
		</Suspense>
	);
}
